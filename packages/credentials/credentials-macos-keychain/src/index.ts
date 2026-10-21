/** macOS Keychain provider for Harness credentials; values cross only the Host-to-helper pipe. @module @deepseek-ai/dsh-credentials-macos-keychain */

import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { createInterface } from 'node:readline'
import { CredentialProvider, credentialKeyScope, parseCredentialKey } from '@deepseek-ai/dsh-credentials'
import type {
  CredentialInfo, CredentialKey, CredentialRecord, CredentialRecordEntry,
  CredentialRecordInfo, CredentialRef, ResolvedCredential,
} from '@deepseek-ai/dsh-credentials'
import type { SubprocessHandle } from '@deepseek-ai/dsh-subprocess'

const ACCOUNT_REF_PREFIX = 'ref:'
const ACCOUNT_RECORD_PREFIX = 'record:'
const MAX_HELPER_OUTPUT_BYTES = 64 * 1024
const DEFAULT_OPERATION_TIMEOUT_MS = 30_000

/** Native-helper configuration; the helper path must identify a bundled executable. */
export interface Config {
  /** Absolute path to the signed or app-bundled Keychain helper executable. */
  helperPath: string
  /** Upper bound for one helper request, including a read-modify-write callback. */
  timeoutMs?: number
}

interface HelperResponse {
  ok: boolean
  code?: string
  value?: string
  accounts?: string[]
  diagnostic?: HelperDiagnostic
  phases?: string[]
}

interface HelperDiagnostic {
  operation: string
  osStatus: number | null
  message: string
  credentialRoute?: 'workbench.scys.*'
  helperPath?: string
  helperReached?: boolean
}

class KeychainOperationError extends Error {
  constructor(
    message: string,
    readonly diagnostic?: HelperDiagnostic,
    readonly phases?: readonly string[],
  ) {
    super(message)
  }
}

/** Keychain credential provider over the existing `ctx.credentials` record and reference API. */
export class MacOSKeychainCredentialProvider extends CredentialProvider {
  static inject = ['subprocess']
  static Config = z.object({
    helperPath: z.string().min(1),
    timeoutMs: z.number().min(1).default(DEFAULT_OPERATION_TIMEOUT_MS),
  })
  private readonly helperPath: string
  private readonly timeoutMs: number

  constructor(ctx: Context, config: Config) {
    super(ctx)
    if (process.platform !== 'darwin') throw new Error('credentials-macos-keychain requires macOS')
    if (!config.helperPath.startsWith('/')) throw new Error('credentials-macos-keychain helperPath must be absolute')
    this.helperPath = config.helperPath
    this.timeoutMs = config.timeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS
  }

  override async resolve(ref: CredentialRef): Promise<ResolvedCredential | undefined> {
    const value = (await this.call({ operation: 'get', account: this.refAccount(ref) })).value
    return value === undefined ? undefined : { value, source: 'keychain' }
  }

  override async describe(ref: CredentialRef): Promise<CredentialInfo> {
    return await this.hasAccount(this.refAccount(ref))
      ? { configured: true, source: 'keychain', writable: true }
      : { configured: false, writable: true }
  }

  override async set(ref: CredentialRef, value: string): Promise<void> {
    if (value.length === 0) throw new Error('credentials-macos-keychain cannot store an empty credential')
    await this.call({ operation: 'set', account: this.refAccount(ref), value })
    this.notifyUpdated(ref)
  }

  override async unset(ref: CredentialRef): Promise<void> {
    const account = this.refAccount(ref)
    const existed = await this.hasAccount(account)
    await this.call({ operation: 'delete', account })
    if (existed) this.notifyUpdated(ref)
  }

  override async readRecord(key: CredentialKey): Promise<CredentialRecord | undefined> {
    const value = (await this.call({ operation: 'get', account: this.recordAccount(key) })).value
    if (value === undefined) return undefined
    try { return parseRecord(value) } catch {
      if (credentialKeyScope(key) !== 'workbench-scys') throw new Error('KEYCHAIN_READ_FAILED')
      throw new KeychainOperationError('KEYCHAIN_READ_FAILED', {
        operation: 'read',
        osStatus: null,
        message: 'CREDENTIAL_RECORD_PARSE_FAILED',
        credentialRoute: 'workbench.scys.*',
        helperPath: this.helperPath,
        helperReached: true,
      })
    }
  }

  override async describeRecord(key: CredentialKey): Promise<CredentialRecordInfo> {
    const configured = await this.hasAccount(this.recordAccount(key))
    if (!configured) return { configured: false, writable: true }
    const record = await this.readRecord(key)
    if (record === undefined) return { configured: false, writable: true }
    return { configured: true, kind: record.kind, writable: true }
  }

  override async listRecords(): Promise<readonly CredentialRecordEntry[]> {
    const accounts = (await this.call({ operation: 'list', account: 'records' })).accounts ?? []
    const records: CredentialRecordEntry[] = []
    for (const account of accounts ?? []) {
      if (!account.startsWith(ACCOUNT_RECORD_PREFIX)) continue
      const key = parseCredentialKey(account.slice(ACCOUNT_RECORD_PREFIX.length))
      const record = await this.readRecord(key)
      if (record !== undefined) records.push({ key, kind: record.kind })
    }
    return records
  }

  override async modifyRecord(
    key: CredentialKey,
    mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>,
  ): Promise<CredentialRecord | undefined> {
    const account = this.recordAccount(key)
    let handle: SubprocessHandle
    try { handle = this.spawn({ operation: 'modify', account }, true) } catch {
      throw new Error('KEYCHAIN_WRITE_FAILED')
    }
    const phases: string[] = ['REQUEST_SENT']
    handle.stdin!.write(`${JSON.stringify({ operation: 'modify', account })}\n`)
    const lines = createInterface({ input: handle.stdout! })
    const iterator = lines[Symbol.asyncIterator]()
    const timer = setTimeout(() => handle.terminate(), this.timeoutMs)
    try {
      const first = await nextHelperResponse(iterator)
      phases.push(...(first.phases ?? []))
      const current = first.value === undefined ? undefined : parseRecord(first.value)
      const next = await mutate(current)
      phases.push('CALLBACK_FINISHED')
      const committedRecord = next ?? current
      const serialized = committedRecord === undefined ? undefined : serializeRecord(committedRecord)
      phases.push('WRITE_STARTED')
      handle.stdin!.write(`${JSON.stringify({ operation: 'commit', account, value: serialized })}\n`)
      const committed = await nextHelperResponse(iterator)
      phases.splice(0, phases.length, ...(committed.phases ?? phases))
      if (next !== undefined) this.notifyRecordUpdated(key)
      return committed.value === undefined ? undefined : parseRecord(committed.value)
    } catch (error) {
      handle.terminate()
      throw safeKeychainError(error, 'KEYCHAIN_WRITE_FAILED', phases)
    } finally {
      clearTimeout(timer)
      lines.close()
      await handle.done.catch(() => undefined)
    }
  }

  override async deleteRecord(key: CredentialKey): Promise<void> {
    const account = this.recordAccount(key)
    const existed = await this.hasAccount(account)
    await this.call({ operation: 'delete', account })
    if (existed) this.notifyRecordUpdated(key)
  }

  private refAccount(ref: CredentialRef): string { return `${ACCOUNT_REF_PREFIX}${ref}` }
  private recordAccount(key: CredentialKey): string { return `${ACCOUNT_RECORD_PREFIX}${key}` }

  private async hasAccount(account: string): Promise<boolean> {
    return (await this.call({ operation: 'has', account })).value === 'present'
  }

  private async call(request: Record<string, unknown>): Promise<HelperResponse> {
    let handle: SubprocessHandle | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let helperResponded = false
    try {
      handle = this.spawn(request, false)
      const stdout = handle.stdout!
      const chunks: Buffer[] = []
      let bytes = 0
      stdout.on('data', (chunk: Buffer) => {
        bytes += chunk.length
        if (bytes > MAX_HELPER_OUTPUT_BYTES) handle!.terminate()
        else chunks.push(chunk)
      })
      timer = setTimeout(() => handle!.terminate(), this.timeoutMs)
      const outcome = await handle.done
      if (bytes > MAX_HELPER_OUTPUT_BYTES || outcome.exitCode !== 0 || outcome.signal !== null) {
        throw new Error(operationFailure(request.operation))
      }
      helperResponded = true
      return parseHelperResponse(Buffer.concat(chunks).toString('utf8'))
    } catch (error) {
      handle?.terminate()
      const safeError = safeKeychainError(error, operationFailure(request.operation))
      if (request.operation === 'get' && request.account === 'record:workbench-scys/oauth') {
        const diagnostic = safeError instanceof KeychainOperationError ? safeError.diagnostic : undefined
        const safeDiagnostic: HelperDiagnostic = {
          ...(diagnostic ?? { operation: 'read', osStatus: null, message: safeError.message }),
          credentialRoute: 'workbench.scys.*' as const,
          helperPath: this.helperPath,
          helperReached: helperResponded,
        }
        this.ctx.logger('credentials-macos-keychain').error('SCYS Keychain read diagnostic %s', JSON.stringify({
          operation: 'read',
          credentialRoute: 'workbench.scys.*',
          helperPath: this.helperPath,
          helperReached: helperResponded,
          osStatus: safeDiagnostic.osStatus,
          osStatusMessage: safeDiagnostic.message,
        }))
        throw new KeychainOperationError(safeError.message, safeDiagnostic, safeError instanceof KeychainOperationError ? safeError.phases : undefined)
      }
      throw safeError
    } finally {
      if (timer !== undefined) clearTimeout(timer)
      await handle?.done.catch(() => undefined)
    }
  }

  private spawn(request: Record<string, unknown>, interactive: boolean): SubprocessHandle {
    return this.ctx.subprocess.spawn({
      argv: [this.helperPath],
      cwd: process.cwd(),
      env: {},
      graceMs: 250,
      stdio: {
        stdin: interactive ? 'pipe' : { data: `${JSON.stringify(request)}\n` },
        stdout: 'pipe',
        stderr: { maxBytes: 1024 },
      },
    })
  }
}

function operationFailure(operation: unknown): string {
  if (operation === 'get' || operation === 'has' || operation === 'list') return 'KEYCHAIN_READ_FAILED'
  if (operation === 'delete') return 'KEYCHAIN_DELETE_FAILED'
  return 'KEYCHAIN_WRITE_FAILED'
}

function safeKeychainError(error: unknown, fallback: string, phases?: readonly string[]): Error {
  if (error instanceof KeychainOperationError) {
    return new KeychainOperationError(error.message, error.diagnostic, error.phases ?? phases)
  }
  const message = error instanceof Error ? error.message : ''
  return new KeychainOperationError(
    /^KEYCHAIN_(?:READ|WRITE|DELETE|LOCK)_FAILED$/.test(message) ? message : fallback,
    undefined,
    phases,
  )
}

async function nextHelperResponse(iterator: AsyncIterator<string>): Promise<HelperResponse> {
  const line = await iterator.next()
  if (line.done) throw new Error('KEYCHAIN_HELPER_FAILED')
  return parseHelperResponse(line.value)
}

function parseHelperResponse(line: string): HelperResponse {
  let response: HelperResponse
  try { response = JSON.parse(line) as HelperResponse } catch { throw new Error('KEYCHAIN_HELPER_FAILED') }
  if (!response.ok) {
    const code = response.code ?? 'KEYCHAIN_HELPER_FAILED'
    throw new KeychainOperationError(code, response.diagnostic, response.phases)
  }
  return response
}

function parseRecord(value: string): CredentialRecord {
  let record: unknown
  try { record = JSON.parse(value) } catch { throw new Error('KEYCHAIN_READ_FAILED') }
  if (typeof record !== 'object' || record === null || !('kind' in record)
    || (record.kind !== 'grant' && record.kind !== 'api-key')) throw new Error('KEYCHAIN_READ_FAILED')
  return record as CredentialRecord
}

function serializeRecord(record: CredentialRecord): string {
  try {
    const value = JSON.stringify(record)
    if (value === undefined) throw new Error()
    return value
  } catch { throw new Error('KEYCHAIN_WRITE_FAILED') }
}

export default MacOSKeychainCredentialProvider
