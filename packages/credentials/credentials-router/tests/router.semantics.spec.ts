import { beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import {
  CredentialProvider, credentialKey, credentialRef, credentialKeyScope,
} from '@deepseek-ai/dsh-credentials'
import type {
  CredentialInfo, CredentialKey, CredentialRecord, CredentialRecordEntry,
  CredentialRecordInfo, CredentialRef, ResolvedCredential,
} from '@deepseek-ai/dsh-credentials'
import { CredentialRouter } from '../src/index.ts'

class ControlledCredentialProvider extends CredentialProvider {
  readonly calls: string[] = []
  readonly refs = new Map<CredentialRef, string>()
  readonly records = new Map<CredentialKey, CredentialRecord>()
  failure: Error | undefined
  callbackCount = 0
  modifyCount = 0
  lastModifyReceiver: ControlledCredentialProvider | undefined

  override async resolve(ref: CredentialRef): Promise<ResolvedCredential | undefined> {
    this.calls.push(`resolve:${ref}`)
    this.throwFailure()
    const value = this.refs.get(ref)
    return value === undefined ? undefined : { value, source: 'controlled' }
  }

  override async describe(ref: CredentialRef): Promise<CredentialInfo> {
    this.calls.push(`describe:${ref}`)
    this.throwFailure()
    const configured = this.refs.has(ref)
    return { configured, ...(configured ? { source: 'controlled' } : {}), writable: true }
  }

  override async set(ref: CredentialRef, value: string): Promise<void> {
    this.calls.push(`set:${ref}`)
    this.throwFailure()
    this.refs.set(ref, value)
  }

  override async unset(ref: CredentialRef): Promise<void> {
    this.calls.push(`unset:${ref}`)
    this.throwFailure()
    this.refs.delete(ref)
  }

  override async readRecord(key: CredentialKey): Promise<CredentialRecord | undefined> {
    this.calls.push(`readRecord:${key}`)
    this.throwFailure()
    return this.records.get(key)
  }

  override async describeRecord(key: CredentialKey): Promise<CredentialRecordInfo> {
    this.calls.push(`describeRecord:${key}`)
    this.throwFailure()
    const record = this.records.get(key)
    return record === undefined ? { configured: false, writable: true } : { configured: true, kind: record.kind, writable: true }
  }

  override async listRecords(): Promise<readonly CredentialRecordEntry[]> {
    this.calls.push('listRecords')
    this.throwFailure()
    return [...this.records].map(([key, record]) => ({ key, kind: record.kind }))
  }

  override async modifyRecord(
    key: CredentialKey,
    mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>,
  ): Promise<CredentialRecord | undefined> {
    this.lastModifyReceiver = this
    this.calls.push(`modifyRecord:${key}`)
    this.throwFailure()
    this.modifyCount += 1
    const next = await mutate(this.records.get(key))
    this.callbackCount += 1
    if (next !== undefined) this.records.set(key, next)
    return next ?? this.records.get(key)
  }

  override async deleteRecord(key: CredentialKey): Promise<void> {
    this.calls.push(`deleteRecord:${key}`)
    this.throwFailure()
    this.records.delete(key)
  }

  private throwFailure(): void {
    if (this.failure !== undefined) throw this.failure
  }
}

describe('CredentialRouter provider-selection semantics', () => {
  let router: CredentialRouter
  let local: ControlledCredentialProvider
  let secure: ControlledCredentialProvider

  beforeEach(async () => {
    const localContext = new Context()
    const localFiber = localContext.plugin(ControlledCredentialProvider)
    await localFiber
    local = localContext.credentials as ControlledCredentialProvider

    const secureContext = new Context()
    const secureFiber = secureContext.plugin(ControlledCredentialProvider)
    await secureFiber
    secure = secureContext.credentials as ControlledCredentialProvider

    router = Object.create(CredentialRouter.prototype) as CredentialRouter
    Object.defineProperties(router, {
      localContext: { value: localContext },
      keychainContext: { value: secureContext },
      providersReady: { value: Promise.resolve() },
    })
  })

  it('routes ordinary record keys to Legacy', async () => {
    const key = credentialKey('llm-pi-ai', 'default')
    await router.modifyRecord(key, async () => ({ kind: 'api-key', key: 'legacy-test-secret' }))
    expect(local.calls).toContain(`modifyRecord:${key}`)
    expect(secure.calls).toEqual([])
  })

  it('routes unknown namespaces to Legacy', async () => {
    const key = credentialKey('uninstalled-plugin', 'orphan')
    await router.modifyRecord(key, async () => ({ kind: 'grant', payload: { ready: true } }))
    expect(local.calls).toContain(`modifyRecord:${key}`)
    expect(secure.calls).toEqual([])
  })

  it('routes only workbench.scys records to Secure', async () => {
    const key = credentialKey('workbench-scys', 'access-token')
    expect(credentialKeyScope(key)).toBe('workbench-scys')
    await router.modifyRecord(key, async () => ({ kind: 'grant', payload: { token: 'secure-test-secret' } }))
    expect(secure.calls).toContain(`modifyRecord:${key}`)
    expect(local.calls).toEqual([])
  })

  it('keeps reference set, resolve, describe, and unset on Legacy', async () => {
    const ref = credentialRef('ROUTER_TEST_SECRET')
    await router.set(ref, 'ref-test-secret')
    expect(await router.resolve(ref)).toEqual({ value: 'ref-test-secret', source: 'controlled' })
    expect(await router.describe(ref)).toEqual({ configured: true, source: 'controlled', writable: true })
    await router.unset(ref)
    expect(local.calls.map(call => call.split(':')[0])).toEqual(['set', 'resolve', 'describe', 'unset'])
    expect(secure.calls).toEqual([])
  })

  it('keeps Legacy record read, describe, list, and delete on Legacy', async () => {
    const key = credentialKey('workbench-router', 'legacy')
    local.records.set(key, { kind: 'grant', payload: { marker: 'legacy-only' } })
    expect(await router.readRecord(key)).toEqual({ kind: 'grant', payload: { marker: 'legacy-only' } })
    expect(await router.describeRecord(key)).toEqual({ configured: true, kind: 'grant', writable: true })
    expect(await router.listRecords()).toEqual([{ key, kind: 'grant' }])
    await router.deleteRecord(key)
    expect(local.calls.map(call => call.split(':')[0])).toEqual(['readRecord', 'describeRecord', 'listRecords', 'deleteRecord'])
    expect(secure.calls).toEqual(['listRecords'])
  })

  it('keeps SCYS record read, describe, list, and delete on Secure', async () => {
    const key = credentialKey('workbench-scys', 'refresh-token')
    secure.records.set(key, { kind: 'grant', payload: { token: 'secure-test-secret' } })
    expect(await router.readRecord(key)).toEqual({ kind: 'grant', payload: { token: 'secure-test-secret' } })
    expect(await router.describeRecord(key)).toEqual({ configured: true, kind: 'grant', writable: true })
    expect(await router.listRecords()).toEqual([{ key, kind: 'grant' }])
    await router.deleteRecord(key)
    expect(secure.calls.map(call => call.split(':')[0])).toEqual(['readRecord', 'describeRecord', 'listRecords', 'deleteRecord'])
    expect(local.calls).toEqual(['listRecords'])
  })

  it('delegates Legacy modifyRecord once without running the callback twice', async () => {
    const key = credentialKey('llm-pi-ai', 'provider-route')
    const mutate = async () => ({ kind: 'api-key' as const, key: 'legacy-test-secret' })
    await router.modifyRecord(key, mutate)
    expect(local.modifyCount).toBe(1)
    expect(local.callbackCount).toBe(1)
    expect(secure.modifyCount).toBe(0)
  })

  it('delegates SCYS modifyRecord once without running the callback twice', async () => {
    const key = credentialKey('workbench-scys', 'oauth-metadata')
    const mutate = async () => ({ kind: 'grant' as const, payload: { connected: true } })
    await router.modifyRecord(key, mutate)
    expect(secure.modifyCount).toBe(1)
    expect(secure.callbackCount).toBe(1)
    expect(local.modifyCount).toBe(0)
  })

  it('preserves the backend instance as the method receiver', async () => {
    const key = credentialKey('workbench-scys', 'access-token')
    await router.modifyRecord(key, async () => ({ kind: 'grant', payload: { ready: true } }))
    expect(secure.lastModifyReceiver?.modifyCount).toBe(1)
    expect(secure.calls).toContain(`modifyRecord:${key}`)
  })

  it('does not add a router-level lock or invoke the callback itself', async () => {
    const key = credentialKey('workbench-scys', 'access-token')
    let callbackCount = 0
    await router.modifyRecord(key, async () => {
      callbackCount += 1
      return { kind: 'grant', payload: { ready: true } }
    })
    expect(callbackCount).toBe(1)
    expect(secure.calls.filter(call => call.startsWith('modifyRecord:'))).toHaveLength(1)
  })

  it('passes the selected backend error through unchanged', async () => {
    const failure = new Error('secure-backend-failure')
    secure.failure = failure
    await expect(router.readRecord(credentialKey('workbench-scys', 'access-token'))).rejects.toBe(failure)
    expect(local.calls).toEqual([])
  })

  it('keeps descriptions and enumeration free of record values', async () => {
    const key = credentialKey('workbench-scys', 'access-token')
    secure.records.set(key, { kind: 'grant', payload: { token: 'never-in-metadata' } })
    const description = await router.describeRecord(key)
    const entries = await router.listRecords()
    expect(description).toEqual({ configured: true, kind: 'grant', writable: true })
    expect(JSON.stringify([description, entries])).not.toContain('never-in-metadata')
  })
})
