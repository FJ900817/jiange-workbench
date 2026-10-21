/** One-shot, local-only authentication probe for the installed Aipoju CLI. */

import { spawn } from 'node:child_process'
import { constants as fsConstants } from 'node:fs'
import { access, lstat, open, rename, stat, unlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

const CLI_PATH = '/Users/jane/.npm-global/bin/breakout'
const DESKTOP_HELPER_PATH = '/Applications/DeepSeek Harness.app/Contents/Frameworks/KeychainCredentialHelper'
const PROBE_DIRECTORY = 'diagnostics'
const MARKER_NAME = 'aipoju-host-auth-probe.once'
const RESULT_NAME = 'aipoju-host-auth-probe.result.json'
const COMMAND_TIMEOUT_MS = 15_000
const COMMAND_OUTPUT_LIMIT_BYTES = 256 * 1024

/** Sanitized outcome written by the one-shot Host startup probe. */
export interface AipojuHostAuthProbeResult {
  readonly runtime: 'desktop_host'
  readonly cliAvailable: boolean
  readonly authenticated: boolean | null
  readonly capabilitiesAvailable: boolean
  readonly capabilityCount: number | null
  readonly status: 'AUTH_OK' | 'AUTH_BLOCKED' | 'CLI_START_FAILED' | 'TIMEOUT' | 'UNKNOWN'
  readonly errorCategory: string | null
}

interface CommandResult {
  readonly exitCode: number | null
  readonly stdout: string
  readonly stderr: string
  readonly timedOut: boolean
  readonly outputLimitExceeded: boolean
  readonly spawnErrorCode?: string
}

interface ProbeOptions {
  readonly home: string
  readonly helperPath?: string
  readonly expectedHelperPath?: string
  readonly cliPath?: string
  readonly pathValue?: string
  readonly timeoutMs?: number
  readonly outputLimitBytes?: number
}

/** Run a pending probe only from the installed macOS Desktop Shell Host. */
export async function runAipojuHostAuthProbe(options: ProbeOptions): Promise<void> {
  const helperPath = options.helperPath ?? process.env.DSH_KEYCHAIN_HELPER_PATH
  const expectedHelperPath = resolve(options.expectedHelperPath ?? DESKTOP_HELPER_PATH)
  if (helperPath === undefined || resolve(helperPath) !== expectedHelperPath) return
  if (!await isExecutable(helperPath)) return

  const home = resolve(options.home)
  const directory = join(home, PROBE_DIRECTORY)
  if (!await isPrivateOwnedDirectory(home, false) || !await isPrivateOwnedDirectory(directory, true)) return

  const markerPath = join(directory, MARKER_NAME)
  const consumedPath = join(directory, `${MARKER_NAME}.${randomUUID()}.consumed`)
  try {
    await rename(markerPath, consumedPath)
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return
    return
  }

  let result: AipojuHostAuthProbeResult
  try {
    if (!await isPrivateEmptyMarker(consumedPath)) {
      result = makeResult('UNKNOWN', false, null, false, null, 'marker_invalid')
    } else {
      result = await inspectCli(options)
    }
    await writePrivateResult(directory, result)
  } catch {
    // The marker has already been atomically consumed; filesystem errors never reach logs.
  } finally {
    await unlink(consumedPath).catch(() => undefined)
  }
}

function makeResult(
  status: AipojuHostAuthProbeResult['status'],
  cliAvailable: boolean,
  authenticated: boolean | null,
  capabilitiesAvailable: boolean,
  capabilityCount: number | null,
  errorCategory: string | null,
): AipojuHostAuthProbeResult {
  return { runtime: 'desktop_host', cliAvailable, authenticated, capabilitiesAvailable, capabilityCount, status, errorCategory }
}

async function inspectCli(options: ProbeOptions): Promise<AipojuHostAuthProbeResult> {
  const cliPath = options.cliPath ?? CLI_PATH
  const pathValue = options.pathValue ?? process.env.PATH ?? ''
  if (!await isExecutable(cliPath)) return makeResult('CLI_START_FAILED', false, null, false, null, 'cli_unavailable')
  if (!await pathContainsNode(pathValue)) return makeResult('CLI_START_FAILED', false, null, false, null, 'node_runtime_missing_from_path')

  const command = await runCapabilities(
    cliPath,
    resolve(options.home),
    options.timeoutMs ?? COMMAND_TIMEOUT_MS,
    options.outputLimitBytes ?? COMMAND_OUTPUT_LIMIT_BYTES,
  )
  if (command.timedOut) return makeResult('TIMEOUT', true, null, false, null, 'capabilities_timeout')
  if (command.outputLimitExceeded) return makeResult('UNKNOWN', true, null, false, null, 'output_limit_exceeded')
  if (command.spawnErrorCode !== undefined) {
    return makeResult('CLI_START_FAILED', false, null, false, null, `spawn_${safeErrorCode(command.spawnErrorCode)}`)
  }

  const output = `${command.stdout}\n${command.stderr}`
  const capabilityCount = parseCapabilityCount(command.stdout)
  if (command.exitCode === 0 && capabilityCount !== null) {
    return makeResult('AUTH_OK', true, true, true, capabilityCount, null)
  }
  if (isAuthenticationFailure(output)) {
    return makeResult('AUTH_BLOCKED', true, false, false, null, 'authentication_unavailable')
  }
  if (isCliBootstrapFailure(output)) {
    return makeResult('CLI_START_FAILED', false, null, false, null, 'native_cli_unavailable')
  }
  return makeResult('UNKNOWN', true, null, false, null, 'capabilities_command_failed')
}

async function runCapabilities(
  cliPath: string,
  cwd: string,
  timeoutMs: number,
  outputLimitBytes: number,
): Promise<CommandResult> {
  return await new Promise((resolveResult) => {
    let stdout = Buffer.alloc(0)
    let stderr = Buffer.alloc(0)
    let timedOut = false
    let outputLimitExceeded = false
    let settled = false
    let killTimer: NodeJS.Timeout | undefined
    const finish = (result: CommandResult, timeout?: NodeJS.Timeout): void => {
      if (settled) return
      settled = true
      if (timeout !== undefined) clearTimeout(timeout)
      if (killTimer !== undefined) clearTimeout(killTimer)
      resolveResult(result)
    }
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(cliPath, ['capabilities'], {
        cwd,
        env: process.env,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        detached: process.platform !== 'win32',
      })
    } catch (error) {
      resolveResult({
        exitCode: null,
        stdout: '',
        stderr: '',
        timedOut: false,
        outputLimitExceeded: false,
        spawnErrorCode: errorCode(error) ?? 'UNKNOWN',
      })
      return
    }
    const timeout = setTimeout(() => {
      timedOut = true
      signalChildTree(child, 'SIGTERM')
      killTimer = setTimeout(() => { signalChildTree(child, 'SIGKILL') }, 1_000)
    }, timeoutMs)
    const complete = (result: CommandResult): void => { finish(result, timeout) }
    const collect = (target: 'stdout' | 'stderr', chunk: Buffer | string): void => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      if (stdout.length + stderr.length + bytes.length > outputLimitBytes) {
        outputLimitExceeded = true
        clearTimeout(timeout)
        signalChildTree(child, 'SIGTERM')
        killTimer = setTimeout(() => { signalChildTree(child, 'SIGKILL') }, 1_000)
        return
      }
      if (target === 'stdout') stdout = Buffer.concat([stdout, bytes])
      else stderr = Buffer.concat([stderr, bytes])
    }
    child.stdout?.on('data', (chunk: Buffer | string) => { collect('stdout', chunk) })
    child.stderr?.on('data', (chunk: Buffer | string) => { collect('stderr', chunk) })
    child.once('error', (error) => {
      complete({
        exitCode: null,
        stdout: '',
        stderr: '',
        timedOut: false,
        outputLimitExceeded: false,
        spawnErrorCode: errorCode(error) ?? 'UNKNOWN',
      })
    })
    child.once('close', (code) => {
      complete({
        exitCode: code,
        stdout: stdout.toString('utf8'),
        stderr: stderr.toString('utf8'),
        timedOut,
        outputLimitExceeded,
      })
    })
  })
}

function parseCapabilityCount(text: string): number | null {
  let value: unknown
  try {
    value = JSON.parse(stripAnsi(text).trim()) as unknown
  } catch {
    return null
  }
  const candidates: unknown[] = [
    value,
    isRecord(value) ? value.capabilities : undefined,
    isRecord(value) && isRecord(value.data) ? value.data.capabilities : undefined,
    isRecord(value) ? value.data : undefined,
  ]
  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.every(isCapabilityEntry)) return candidate.length
  }
  return null
}

function isCapabilityEntry(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0
  if (!isRecord(value)) return false
  return ['id', 'name', 'key', 'capability'].some((key) => {
    const field = value[key]
    return typeof field === 'string' && field.trim().length > 0
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stripAnsi(value: string): string {
  return value.replace(/\u001B\[[0-?]*[ -/]*[@-~]/gu, '')
}

function isAuthenticationFailure(value: string): boolean {
  const patterns = [
    /not authenticated|unauthenticated|authentication required|login required|not logged in/iu,
    /unauthorized|credential(?:s)? (?:missing|not found)/iu,
    /未登录|请先登录|登录已失效|认证失败|凭据(?:缺失|不存在)/u,
  ]
  return patterns.some(pattern => pattern.test(stripAnsi(value)))
}

function isCliBootstrapFailure(value: string): boolean {
  return /未找到适用于|CLI 启动失败|command not found|no such file or directory/iu.test(stripAnsi(value))
}

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.X_OK)
    const target = await stat(path)
    return target.isFile()
  } catch {
    return false
  }
}

function signalChildTree(child: ReturnType<typeof spawn>, signal: NodeJS.Signals): void {
  if (process.platform !== 'win32' && child.pid !== undefined) {
    try {
      process.kill(-child.pid, signal)
      return
    } catch (error) {
      if (errorCode(error) === 'ESRCH') return
    }
  }
  child.kill(signal)
}

async function pathContainsNode(pathValue: string): Promise<boolean> {
  for (const part of pathValue.split(':')) {
    if (part.length === 0) continue
    if (await isExecutable(join(part, 'node'))) return true
  }
  return false
}

async function isPrivateOwnedDirectory(path: string, requirePrivate: boolean): Promise<boolean> {
  try {
    const stat = await lstat(path)
    if (!stat.isDirectory() || stat.isSymbolicLink() || process.getuid?.() !== stat.uid) return false
    return requirePrivate ? (stat.mode & 0o077) === 0 : (stat.mode & 0o022) === 0
  } catch {
    return false
  }
}

async function isPrivateEmptyMarker(path: string): Promise<boolean> {
  try {
    const stat = await lstat(path)
    return stat.isFile()
      && !stat.isSymbolicLink()
      && process.getuid?.() === stat.uid
      && (stat.mode & 0o077) === 0
      && stat.size === 0
  } catch {
    return false
  }
}

async function writePrivateResult(directory: string, result: AipojuHostAuthProbeResult): Promise<void> {
  const resultPath = join(directory, RESULT_NAME)
  try {
    const existing = await lstat(resultPath)
    if (!existing.isFile() || existing.isSymbolicLink() || process.getuid?.() !== existing.uid || (existing.mode & 0o077) !== 0) return
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') return
  }

  const temporaryPath = join(directory, `.${RESULT_NAME}.${randomUUID()}.tmp`)
  try {
    const handle = await open(temporaryPath, 'wx', 0o600)
    try {
      await handle.writeFile(`${JSON.stringify(result, null, 2)}\n`, 'utf8')
    } finally {
      await handle.close()
    }
    await rename(temporaryPath, resultPath)
  } finally {
    await unlink(temporaryPath).catch(() => undefined)
  }
}

function errorCode(error: unknown): string | undefined {
  if (!isRecord(error) || typeof error.code !== 'string') return undefined
  return error.code
}

function safeErrorCode(value: string): string {
  return /^[A-Z0-9_]+$/iu.test(value) ? value.toLowerCase() : 'unknown'
}
