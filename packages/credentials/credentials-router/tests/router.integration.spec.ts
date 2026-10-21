import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { credentialKey, credentialKeyScope } from '@deepseek-ai/dsh-credentials'
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local'
import { CredentialRouter } from '../src/index.ts'

describe('Workbench credential router', () => {
  let ctx: Context
  let tempRoot: string
  let credentialsPath: string
  let legacyContext: Context
  let disposeLegacy: (() => Promise<void>) | undefined
  let disposeRouter: (() => Promise<void>) | undefined
  let routerProvider: CredentialRouter
  let routerReady = false
  const suffix = randomUUID().replaceAll('-', '')
  const legacyKey = credentialKey('workbench-router-test', `legacy-${suffix}`)

  beforeAll(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'dsh-credentials-router-'))
    credentialsPath = join(tempRoot, '.credentials.yaml')
    ctx = new Context()
    legacyContext = new Context()
    const legacy = legacyContext.plugin(LocalCredentialProvider, { path: credentialsPath, watch: false })
    disposeLegacy = async () => legacy.dispose()
    await legacy
    const routerFiber = ctx.plugin(CredentialRouter, {
      local: { path: credentialsPath, watch: false },
    })
    disposeRouter = async () => routerFiber.dispose()
    await routerFiber
    routerReady = true
    routerProvider = ctx.credentials as CredentialRouter
  }, 60_000)

  afterAll(async () => {
    if (ctx !== undefined && routerReady) {
      await ctx.credentials.deleteRecord(legacyKey)
      expect(await ctx.credentials.readRecord(legacyKey)).toBeUndefined()
    }
    await disposeRouter?.()
    await disposeLegacy?.()
    if (tempRoot !== undefined) await rm(tempRoot, { recursive: true, force: true })
  }, 30_000)

  it('routes all non-SCYS records through the original file-backed provider', async () => {
    const marker = `legacy-router-secret-${suffix}`
    const directRecord = { kind: 'grant' as const, payload: { marker, phase: 'direct' } }
    const routerRecord = { kind: 'grant' as const, payload: { marker, phase: 'router' } }
    expect(credentialKeyScope(legacyKey)).not.toBe('workbench-scys')

    console.info('LEGACY_MODIFY_ENTER')
    const directModify = legacyContext.credentials.modifyRecord(legacyKey, async current => {
      console.info('LEGACY_LOCK_ACQUIRED')
      console.info('LEGACY_READ_DONE')
      console.info('LEGACY_CALLBACK_START')
      expect(current).toBeUndefined()
      console.info('LEGACY_CALLBACK_DONE')
      console.info('LEGACY_WRITE_START')
      return directRecord
    })
    await withTimeout(directModify, 5_000, 'LEGACY_DIRECT_MODIFY_TIMEOUT')
    console.info('LEGACY_WRITE_DONE')
    console.info('LEGACY_LOCK_RELEASED')
    console.info('LEGACY_MODIFY_RETURN')
    expect(await legacyContext.credentials.readRecord(legacyKey)).toEqual(directRecord)
    expect(await legacyContext.credentials.describeRecord(legacyKey)).toEqual({ configured: true, kind: 'grant', writable: true })
    await legacyContext.credentials.deleteRecord(legacyKey)
    expect(await legacyContext.credentials.readRecord(legacyKey)).toBeUndefined()

    await routerProvider.readRecord(legacyKey)
    const internals = routerProvider as unknown as { localContext: Context; keychainContext: Context | undefined }
    expect(internals.localContext.reflect.get('credentials')).toBeInstanceOf(LocalCredentialProvider)
    expect(internals.keychainContext).toBeUndefined()

    console.info('ROUTER_MODIFY_ENTER')
    console.info('ROUTER_ROUTE_SELECTED=legacy')
    console.info('ROUTER_DELEGATE_START')
    const routerModify = ctx.credentials.modifyRecord(legacyKey, async current => {
      console.info('LEGACY_LOCK_ACQUIRED')
      console.info('LEGACY_READ_DONE')
      console.info('LEGACY_CALLBACK_START')
      expect(current).toBeUndefined()
      console.info('LEGACY_CALLBACK_DONE')
      console.info('LEGACY_WRITE_START')
      return routerRecord
    })
    await withTimeout(routerModify, 5_000, 'ROUTER_LEGACY_MODIFY_TIMEOUT')
    console.info('LEGACY_WRITE_DONE')
    console.info('LEGACY_LOCK_RELEASED')
    console.info('ROUTER_DELEGATE_RETURN')
    console.info('ROUTER_MODIFY_RETURN')
    expect(await ctx.credentials.readRecord(legacyKey)).toEqual(routerRecord)
    expect(await ctx.credentials.describeRecord(legacyKey)).toEqual({ configured: true, kind: 'grant', writable: true })
    expect(await readFile(credentialsPath, 'utf8')).toContain(marker)
    await ctx.credentials.deleteRecord(legacyKey)
    expect(await ctx.credentials.readRecord(legacyKey)).toBeUndefined()
  }, 30_000)

})

/** Bound a diagnostic operation so a broken lock or delegate cannot hang the test process. */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs)
    promise.then(
      value => { clearTimeout(timer); resolve(value) },
      error => { clearTimeout(timer); reject(error) },
    )
  })
}
