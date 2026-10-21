import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { credentialKey, credentialRef } from '@deepseek-ai/dsh-credentials'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import { MacOSKeychainCredentialProvider } from '../src/index.ts'

const execFileAsync = promisify(execFile)
const describeMac = describe.skipIf(process.platform !== 'darwin')
describeMac('macOS Keychain credential provider', () => {
  let ctx: Context
  let disposeRuntime: (() => Promise<void>) | undefined
  let disposeProvider: (() => Promise<void>) | undefined
  let disposeBadRuntime: (() => Promise<void>) | undefined
  let disposeBadProvider: (() => Promise<void>) | undefined
  let tempRoot: string
  let helperPath: string
  let testRef: ReturnType<typeof credentialRef>
  let testRecord: ReturnType<typeof credentialKey>

  beforeAll(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'dsh-keychain-provider-'))
    helperPath = join(tempRoot, 'KeychainCredentialHelper')
    testRef = credentialRef(`DSH_KEYCHAIN_TEST_${randomUUID().replaceAll('-', '').toUpperCase()}`)
    testRecord = credentialKey('credentials-macos-keychain', `test-${randomUUID().replaceAll('-', '')}`)
    const source = resolve('desktop/macos/KeychainCredentialHelper.swift')
    await execFileAsync('/usr/bin/swiftc', [
      '-sdk', '/Library/Developer/CommandLineTools/SDKs/MacOSX15.4.sdk',
      '-module-cache-path', join(tempRoot, 'module-cache'),
      '-target', 'arm64-apple-macos13.0', '-DKEYCHAIN_TEST', '-DDEBUG',
      source, '-framework', 'Security', '-o', helperPath,
    ], { maxBuffer: 1024 * 1024 })
    ctx = new Context()
    const runtimeFiber = ctx.plugin(LocalSubprocessRuntime)
    disposeRuntime = async () => runtimeFiber.dispose()
    await runtimeFiber
    const providerFiber = ctx.plugin(MacOSKeychainCredentialProvider, { helperPath })
    disposeProvider = async () => providerFiber.dispose()
    await providerFiber
  }, 60_000)

  afterAll(async () => {
    if (ctx !== undefined) {
      await ctx.credentials.unset(testRef)
      await ctx.credentials.deleteRecord(testRecord)
      expect(await ctx.credentials.describe(testRef)).toEqual({ configured: false, writable: true })
      expect(await ctx.credentials.readRecord(testRecord)).toBeUndefined()
    }
    await disposeProvider?.()
    await disposeRuntime?.()
    if (tempRoot !== undefined) await rm(tempRoot, { recursive: true, force: true })
  }, 20_000)

  it('stores, reads, describes, and deletes a reference without a file-backed credential path', async () => {
    const secret = `keychain-test-${randomUUID()}`
    await ctx.credentials.set(testRef, secret)
    expect(await ctx.credentials.resolve(testRef)).toEqual({ value: secret, source: 'keychain' })
    expect(await ctx.credentials.describe(testRef)).toEqual({ configured: true, source: 'keychain', writable: true })
    await ctx.credentials.unset(testRef)
    expect(await ctx.credentials.describe(testRef)).toEqual({ configured: false, writable: true })
  }, 30_000)

  it('commits and removes a grant through the existing credential-record API', async () => {
    const secret = `keychain-grant-${randomUUID()}`
    const record = { kind: 'grant' as const, payload: { access_token: secret, refresh_token: `${secret}-refresh` } }
    await ctx.credentials.modifyRecord(testRecord, () => Promise.resolve(record))
    expect(await ctx.credentials.readRecord(testRecord)).toEqual(record)
    expect(await ctx.credentials.describeRecord(testRecord)).toEqual({ configured: true, kind: 'grant', writable: true })
    expect(await ctx.credentials.listRecords()).toContainEqual({ key: testRecord, kind: 'grant' })
    await ctx.credentials.deleteRecord(testRecord)
    expect(await ctx.credentials.readRecord(testRecord)).toBeUndefined()
  }, 30_000)

  it('keeps helper failures generic instead of returning the submitted secret', async () => {
    const value = `failure-secret-${randomUUID()}`
    const badCtx = new Context()
    const badRuntime = badCtx.plugin(LocalSubprocessRuntime)
    disposeBadRuntime = async () => badRuntime.dispose()
    await badRuntime
    const badProvider = badCtx.plugin(MacOSKeychainCredentialProvider, { helperPath: join(tempRoot, 'missing-helper') })
    disposeBadProvider = async () => badProvider.dispose()
    await badProvider
    await expect(badCtx.credentials.set(testRef, value)).rejects.not.toThrow(value)
    await disposeBadProvider()
    await disposeBadRuntime()
  })
})
