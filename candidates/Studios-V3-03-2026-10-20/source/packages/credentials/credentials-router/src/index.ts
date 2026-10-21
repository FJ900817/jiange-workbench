/** Credential router that preserves the local provider except for the Workbench SCYS record namespace. @module @deepseek-ai/dsh-credentials-router */

import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { CredentialProvider, credentialKeyScope } from '@deepseek-ai/dsh-credentials'
import type {
  CredentialInfo, CredentialKey, CredentialRecord, CredentialRecordEntry,
  CredentialRecordInfo, CredentialRef, ResolvedCredential,
} from '@deepseek-ai/dsh-credentials'
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local'
import MacOSKeychainCredentialProvider from '@deepseek-ai/dsh-credentials-macos-keychain'

interface LocalConfig {
  path?: string
  dshHome?: string
  watch?: boolean
  debounceMs?: number
}

interface KeychainConfig {
  helperPath: string
  timeoutMs: number
}

/** Only records owned by this scope may enter Keychain; all other records stay on the existing provider. */
export const SCYS_CREDENTIAL_SCOPE = 'workbench-scys'

/** Composite-provider configuration; child providers retain their own settings. */
export interface Config {
  /** Existing file provider configuration. */
  local: LocalConfig
  /** Host-bundled Keychain helper configuration. */
  keychain?: KeychainConfig
}

/** Return whether a record belongs to the exact Workbench SCYS namespace. */
export function isWorkbenchScysCredential(key: CredentialKey): boolean {
  return credentialKeyScope(key) === SCYS_CREDENTIAL_SCOPE
}

/** One `ctx.credentials` provider that keeps ordinary keys on the local store and SCYS records in Keychain. */
export class CredentialRouter extends CredentialProvider {
  static Config = z.object({
    local: z.object({
      path: z.string().default(undefined as unknown as string),
      dshHome: z.string().default(undefined as unknown as string),
      watch: z.boolean().default(undefined as unknown as boolean),
      debounceMs: z.number().default(undefined as unknown as number),
    }).default({
      path: undefined as unknown as string,
      dshHome: undefined as unknown as string,
      watch: undefined as unknown as boolean,
      debounceMs: undefined as unknown as number,
    }),
    keychain: z.object({
      helperPath: z.string().min(1).default(undefined as unknown as string),
      timeoutMs: z.number().min(1).default(undefined as unknown as number),
    }).default(undefined as unknown as KeychainConfig),
  })

  private readonly localContext: Context
  private readonly keychainContext: Context | undefined
  private readonly providersReady: Promise<void>

  /** @param ctx - Host context that provides subprocess support for Keychain access. @param config - Existing local and bundled Keychain provider settings. */
  constructor(ctx: Context, config: Config) {
    super(ctx)
    this.localContext = ctx.isolate('credentials')
    const helperPath = config.keychain?.helperPath ?? process.env.DSH_KEYCHAIN_HELPER_PATH
    this.keychainContext = process.platform === 'darwin' && helperPath !== undefined
      ? ctx.isolate('credentials')
      : undefined
    const childLoads: Promise<unknown>[] = [Promise.resolve(this.localContext.plugin(LocalCredentialProvider, config.local))]
    if (this.keychainContext !== undefined && helperPath !== undefined) {
      childLoads.push(Promise.resolve(this.keychainContext.plugin(MacOSKeychainCredentialProvider, {
        helperPath,
        timeoutMs: config.keychain?.timeoutMs ?? 30_000,
      })))
    }
    this.providersReady = Promise.all(childLoads).then(() => undefined)
  }

  /** Resolve references with the unchanged local provider precedence. @param ref - Credential reference. @returns The resolved secret and source, if configured. */
  async resolve(ref: CredentialRef): Promise<ResolvedCredential | undefined> {
    await this.providersReady
    return this.localProvider().resolve(ref)
  }

  /** Describe references without exposing their values. @param ref - Credential reference. @returns Safe reference metadata. */
  async describe(ref: CredentialRef): Promise<CredentialInfo> {
    await this.providersReady
    return this.localProvider().describe(ref)
  }

  /** Preserve existing local writes for every reference. @param ref - Credential reference. @param value - Non-empty secret value. @returns Nothing. */
  async set(ref: CredentialRef, value: string): Promise<void> {
    await this.providersReady
    return this.localProvider().set(ref, value)
  }

  /** Preserve existing local deletes for every reference. @param ref - Credential reference. @returns Nothing. */
  async unset(ref: CredentialRef): Promise<void> {
    await this.providersReady
    return this.localProvider().unset(ref)
  }

  /** Read one record from exactly one backing provider. @param key - Credential record key. @returns The stored record, if present. */
  async readRecord(key: CredentialKey): Promise<CredentialRecord | undefined> {
    await this.providersReady
    return this.providerFor(key).readRecord(key)
  }

  /** Describe a record without exposing its payload. @param key - Credential record key. @returns Safe record metadata. */
  async describeRecord(key: CredentialKey): Promise<CredentialRecordInfo> {
    await this.providersReady
    return this.providerFor(key).describeRecord(key)
  }

  /** List local records and Keychain SCYS records without leaking SCYS records left in the local file. @returns Record addresses and kinds only. */
  async listRecords(): Promise<readonly CredentialRecordEntry[]> {
    await this.providersReady
    const [local, keychain] = await Promise.all([
      this.localProvider().listRecords(),
      this.keychainProvider()?.listRecords() ?? Promise.resolve([]),
    ])
    return [
      ...local.filter(entry => !isWorkbenchScysCredential(entry.key)),
      ...keychain.filter(entry => isWorkbenchScysCredential(entry.key)),
    ]
  }

  /** Apply an exclusive record mutation through its selected provider. @param key - Credential record key. @param mutate - Record mutation callback. @returns The committed record, if present. */
  async modifyRecord(
    key: CredentialKey,
    mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>,
  ): Promise<CredentialRecord | undefined> {
    await this.providersReady
    return this.providerFor(key).modifyRecord(key, mutate)
  }

  /** Delete one record from its selected provider. @param key - Credential record key. @returns Nothing. */
  async deleteRecord(key: CredentialKey): Promise<void> {
    await this.providersReady
    return this.providerFor(key).deleteRecord(key)
  }

  private providerFor(key: CredentialKey): CredentialProvider {
    if (!isWorkbenchScysCredential(key)) return this.localProvider()
    const provider = this.keychainProvider()
    if (provider === undefined) throw new Error('WORKBENCH_SCYS_KEYCHAIN_UNAVAILABLE')
    return provider
  }

  /** Resolve the provider registered in its isolated scope, bypassing the outer service accessor. */
  private localProvider(): CredentialProvider {
    return this.localContext.reflect.get('credentials') as CredentialProvider
  }

  /** Resolve the Keychain provider registered in its isolated scope, if available. */
  private keychainProvider(): CredentialProvider | undefined {
    return this.keychainContext?.reflect.get('credentials') as CredentialProvider | undefined
  }
}

export default CredentialRouter
