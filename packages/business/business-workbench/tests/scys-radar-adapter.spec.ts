import { describe, expect, it, vi } from 'vitest'
import {
  callAllowedScysTool, classifyScysReconnectError, createScysObservedFetch, findScysRows, mapScysComment, mapScysContent, mapScysProject,
  readOAuthCallbackCode, SCYS_READONLY_TOOLS,
} from '../src/scys-radar-adapter.ts'
import { ScysRadarAdapter } from '../src/scys-radar-adapter.ts'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { auth, type OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import type { ScysHttpBoundaryObservation, ScysReconnectDiagnostic, ScysTokenCallbackObservation } from '../src/types.ts'

type TestHttpObservation = Omit<ScysHttpBoundaryObservation, 'requestAttempted' | 'httpStatus' | 'errorType' | 'errorCode'> & {
  requestAttempted: true
  httpStatus: number | null
  errorType: string | null
  errorCode: string | null
}

function reconnectTrace(stage: ScysReconnectDiagnostic['stage'] = 'mcp_initialize') {
  return { stage, httpObservations: [] as TestHttpObservation[], tokensCallbackCallCount: 0, tokenCallbackObservations: [] as ScysTokenCallbackObservation[] }
}

describe('SCYS Radar Host adapter', () => {
  const registeredRedirectUrl = 'http://127.0.0.1:1234/scys/oauth/callback'
  const registeredClient = {
    client_id: 'synthetic-client', redirect_uris: [registeredRedirectUrl],
    token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'], client_name: 'Synthetic client',
  }

  it('uses the saved registered callback URI when reconnecting an existing grant', async () => {
    const readRecord = vi.fn(async () => ({ kind: 'grant', payload: {
      version: 1, clientInformation: registeredClient,
      tokens: { access_token: 'synthetic-access', token_type: 'Bearer', refresh_token: 'synthetic-refresh' },
    } }))
    let provider: OAuthClientProvider | undefined
    const connect = vi.spyOn(Client.prototype, 'connect').mockImplementation(async transport => {
      provider = (transport as unknown as { _authProvider: OAuthClientProvider })._authProvider
    })
    vi.spyOn(Client.prototype, 'listTools').mockResolvedValue({ tools: [] } as never)
    vi.spyOn(Client.prototype, 'close').mockResolvedValue(undefined)
    try {
      const adapter = new ScysRadarAdapter({ readRecord } as never)
      expect(await adapter.getSourceStatus()).toEqual({ status: 'connected' })
      expect(provider?.redirectUrl).toBe(registeredRedirectUrl)
      expect(provider?.clientMetadata.redirect_uris).toEqual([registeredRedirectUrl])
      expect(readRecord).toHaveBeenCalledTimes(1)
      expect(connect).toHaveBeenCalledTimes(1)
      await adapter.dispose()
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('queries recent, hot, and digested feeds through fixed bounded searchTopic arguments', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-14T00:00:00.000Z'))
    const start = Math.floor(Date.now() / 1_000) - 7 * 24 * 60 * 60
    const makeRow = (id: number, seconds: number, flags: { isHot?: boolean; isDigested?: boolean } = {}) => ({
      topicDTO: {
        entityType: 'xq_topic', entityId: String(id), gmtCreate: seconds,
        showTitle: `Topic ${id}`, summary: 'summary'.repeat(300), articleContent: 'private full body',
        topicUserDTO: { nickname: 'author' }, ...flags,
      },
    })
    const schema = { properties: {
      gmtCreateStart: { type: 'number' }, gmtCreateEnd: { type: 'number' }, isHot: { type: 'boolean' },
      isDigested: { type: 'boolean' }, pageIndex: { type: 'integer' }, pageSize: { type: 'integer' },
    } }
    const tools = [{ name: 'searchTopic', inputSchema: schema }]
    const connect = vi.spyOn(Client.prototype, 'connect').mockResolvedValue(undefined)
    vi.spyOn(Client.prototype, 'listTools').mockResolvedValue({ tools } as never)
    vi.spyOn(Client.prototype, 'close').mockResolvedValue(undefined)
    const callTool = vi.spyOn(Client.prototype, 'callTool').mockImplementation(async request => {
      const args = request.arguments as { pageIndex: number; isHot?: boolean; isDigested?: boolean }
      const flags = args.isHot === true ? { isHot: true } : args.isDigested === true ? { isDigested: true } : {}
      const rows = args.pageIndex === 1
        ? Array.from({ length: 10 }, (_, index) => makeRow(index + 1, start + 100 + index, flags))
        : [makeRow(10, start + 110, flags), makeRow(11, start + 111, flags), makeRow(12, start + 112, flags)]
      return { structuredContent: { items: rows } } as never
    })
    try {
      const adapter = new ScysRadarAdapter({ readRecord: vi.fn(async () => ({ kind: 'grant', payload: {
        version: 1, clientInformation: registeredClient,
        tokens: { access_token: 'synthetic-access', token_type: 'Bearer' },
      } })) } as never)
      expect(await adapter.getSourceStatus()).toEqual({ status: 'connected' })
      for (const mode of ['recent', 'hot', 'digested'] as const) {
        const result = await adapter.queryFeed(mode)
        expect(result.status).toBe('ready')
        if (result.status !== 'ready') continue
        expect(result.query).toMatchObject({ mode, pagesRead: 2, mayHaveMore: false, serverFilterAccepted: true })
        expect(result.items).toHaveLength(12)
        expect(result.items[0]?.entityType).toBe('xq_topic')
        expect(result.items[0]?.entityId).toBe('12')
        expect(result.items[0]?.publishedAt).toBe(new Date((start + 112) * 1_000).toISOString())
        expect(result.items[0]?.content).toBeNull()
        expect(result.items[0]?.summary).toHaveLength(1_200)
        expect(JSON.stringify(result)).not.toContain('private full body')
        expect(result.query.itemMarkerEvidence).toBe(mode === 'recent' ? 'not_applicable' : 'confirmed')
      }
      const calls = callTool.mock.calls.map(([request, _schema, options]) => ({ request, options }))
      expect(calls).toHaveLength(6)
      expect(calls[0]?.request).toEqual({ name: 'searchTopic', arguments: {
        gmtCreateStart: start, gmtCreateEnd: Math.floor(Date.now() / 1_000), pageIndex: 1, pageSize: 10,
      } })
      expect(calls[2]?.request.arguments).toMatchObject({ isHot: true, pageSize: 10 })
      expect(calls[4]?.request.arguments).toMatchObject({ isDigested: true, pageSize: 10 })
      expect(calls.every(call => call.options?.timeout === 12_000)).toBe(true)
      expect(connect).toHaveBeenCalledTimes(1)
      await adapter.dispose()
    } finally {
      vi.restoreAllMocks()
      vi.useRealTimers()
    }
  })

  it('caches successful feeds, coalesces concurrent reads, and preserves stale data after refresh failure', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-14T00:00:00.000Z'))
    const created = Math.floor(Date.now() / 1_000) - 60
    const tools = [{ name: 'searchTopic', inputSchema: { properties: {
      gmtCreateStart: { type: 'number' }, gmtCreateEnd: { type: 'number' },
      pageIndex: { type: 'integer' }, pageSize: { type: 'integer' },
    } } }]
    vi.spyOn(Client.prototype, 'connect').mockResolvedValue(undefined)
    vi.spyOn(Client.prototype, 'listTools').mockResolvedValue({ tools } as never)
    vi.spyOn(Client.prototype, 'close').mockResolvedValue(undefined)
    const callTool = vi.spyOn(Client.prototype, 'callTool').mockResolvedValue({ structuredContent: { items: [{ topicDTO: {
      entityType: 'xq_topic', entityId: '987654321', gmtCreate: created, showTitle: 'Cached feed',
    } }] } } as never)
    try {
      const adapter = new ScysRadarAdapter({ readRecord: vi.fn(async () => ({ kind: 'grant', payload: {
        version: 1, clientInformation: registeredClient,
        tokens: { access_token: 'synthetic-access', token_type: 'Bearer' },
      } })) } as never)
      expect(await adapter.getSourceStatus()).toEqual({ status: 'connected' })
      const [first, concurrent] = await Promise.all([adapter.queryFeed('recent'), adapter.queryFeed('recent')])
      expect(first).toEqual(concurrent)
      expect(callTool).toHaveBeenCalledTimes(1)
      expect(first).toMatchObject({ status: 'ready', query: { stale: false, refreshErrorCode: null } })
      await adapter.queryFeed('recent')
      expect(callTool).toHaveBeenCalledTimes(1)

      callTool.mockRejectedValueOnce(new Error('synthetic upstream failure'))
      const stale = await adapter.queryFeed('recent', true)
      expect(stale).toMatchObject({ status: 'ready', query: { stale: true, refreshErrorCode: 'SCYS_MCP_UNAVAILABLE' } })
      expect(JSON.stringify(stale)).not.toContain('synthetic upstream failure')
      expect(callTool).toHaveBeenCalledTimes(2)
      await adapter.dispose()
    } finally {
      vi.restoreAllMocks()
      vi.useRealTimers()
    }
  })

  it('rejects feed queries when the installed tool schema does not declare the fixed filter fields', async () => {
    vi.spyOn(Client.prototype, 'connect').mockResolvedValue(undefined)
    vi.spyOn(Client.prototype, 'listTools').mockResolvedValue({ tools: [{ name: 'searchTopic', inputSchema: { properties: {} } }] } as never)
    const callTool = vi.spyOn(Client.prototype, 'callTool')
    vi.spyOn(Client.prototype, 'close').mockResolvedValue(undefined)
    try {
      const adapter = new ScysRadarAdapter({ readRecord: vi.fn(async () => ({ kind: 'grant', payload: {
        version: 1, clientInformation: registeredClient,
        tokens: { access_token: 'synthetic-access', token_type: 'Bearer' },
      } })) } as never)
      expect(await adapter.getSourceStatus()).toEqual({ status: 'connected' })
      await expect(adapter.queryFeed('recent')).resolves.toEqual({ status: 'SCYS_FEED_QUERY_UNSUPPORTED' })
      await expect(adapter.queryFeed('hot')).resolves.toEqual({ status: 'SCYS_FEED_QUERY_UNSUPPORTED' })
      expect(callTool).not.toHaveBeenCalled()
      await adapter.dispose()
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('refreshes an expired access token through the installed SDK and persists before reuse', async () => {
    const initial = { access_token: 'synthetic-expired', token_type: 'Bearer', refresh_token: 'synthetic-refresh' }
    const refreshed = { access_token: 'synthetic-new', token_type: 'Bearer', refresh_token: 'synthetic-next' }
    let stored: unknown = { kind: 'grant', payload: { version: 1, clientInformation: registeredClient, tokens: initial } }
    const readRecord = vi.fn(async () => stored)
    const modifyRecord = vi.fn(async (_key: unknown, mutate: (record: unknown) => Promise<unknown>) => {
      stored = await mutate(stored)
      return stored
    })
    const { provider } = await createTestProvider(readRecord, tokenProviderOptions(), modifyRecord, registeredRedirectUrl)
    const tokenFetch = vi.fn(async () => Response.json(refreshed))
    const result = await auth(withSyntheticDiscovery(provider), {
      serverUrl: new URL('https://mcp.scys.com/shengcai-web/mcp'), fetchFn: tokenFetch,
    })
    expect(result).toBe('AUTHORIZED')
    expect(tokenFetch).toHaveBeenCalledTimes(1)
    expect(modifyRecord).toHaveBeenCalledTimes(1)
    expect(readRecord).toHaveBeenCalledTimes(1)
    await expect(provider.tokens()).resolves.toEqual(refreshed)
    const transport = new StreamableHTTPClientTransport(new URL('https://mcp.scys.com/shengcai-web/mcp'), { authProvider: provider })
    const headers = await (transport as unknown as { _commonHeaders(): Promise<Headers> })._commonHeaders()
    expect(headers.get('authorization')).toBe('Bearer synthetic-new')
    expect(stored).toEqual({ kind: 'grant', payload: { version: 1, clientInformation: registeredClient, tokens: refreshed } })
  })

  it('continues MCP initialization with the refreshed access token', async () => {
    const initial = { access_token: 'synthetic-expired', token_type: 'Bearer', refresh_token: 'synthetic-refresh' }
    const refreshed = { access_token: 'synthetic-new', token_type: 'Bearer', refresh_token: 'synthetic-next' }
    let stored: unknown = { kind: 'grant', payload: { version: 1, clientInformation: registeredClient, tokens: initial } }
    const readRecord = vi.fn(async () => stored)
    const modifyRecord = vi.fn(async (_key: unknown, mutate: (record: unknown) => Promise<unknown>) => {
      stored = await mutate(stored)
      return stored
    })
    const tokenFetch = vi.fn(async () => Response.json(refreshed))
    vi.spyOn(Client.prototype, 'connect').mockImplementation(async transport => {
      const activeTransport = transport as unknown as { _authProvider: OAuthClientProvider; _commonHeaders(): Promise<Headers> }
      expect((await activeTransport._commonHeaders()).get('authorization')).toBe('Bearer synthetic-expired')
      expect(await auth(withSyntheticDiscovery(activeTransport._authProvider), {
        serverUrl: new URL('https://mcp.scys.com/shengcai-web/mcp'), fetchFn: tokenFetch,
      })).toBe('AUTHORIZED')
      expect((await activeTransport._commonHeaders()).get('authorization')).toBe('Bearer synthetic-new')
    })
    vi.spyOn(Client.prototype, 'listTools').mockResolvedValue({ tools: [] } as never)
    vi.spyOn(Client.prototype, 'close').mockResolvedValue(undefined)
    try {
      const adapter = new ScysRadarAdapter({ readRecord, modifyRecord } as never)
      expect(await adapter.getSourceStatus()).toEqual({ status: 'connected' })
      expect(readRecord).toHaveBeenCalledTimes(1)
      expect(modifyRecord).toHaveBeenCalledTimes(1)
      expect(tokenFetch).toHaveBeenCalledTimes(1)
      await adapter.dispose()
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('requires user authorization after a rejected refresh without retrying or deleting the grant', async () => {
    const initial = { access_token: 'synthetic-expired', token_type: 'Bearer', refresh_token: 'synthetic-invalid' }
    const modifyRecord = vi.fn()
    const { provider } = await createTestProvider(vi.fn(async () => ({ kind: 'grant', payload: {
      version: 1, clientInformation: registeredClient, tokens: initial,
    } })), { ...tokenProviderOptions(), allowCredentialInvalidation: false, allowAuthorizationFallback: false }, modifyRecord, registeredRedirectUrl)
    const tokenFetch = vi.fn(async () => Response.json({ error: 'invalid_grant' }, { status: 400 }))
    await expect(auth(withSyntheticDiscovery(provider), {
      serverUrl: new URL('https://mcp.scys.com/shengcai-web/mcp'), fetchFn: tokenFetch,
    })).rejects.toThrow('SCYS_RECONNECT_CREDENTIAL_INVALIDATION_DISABLED')
    expect(tokenFetch).toHaveBeenCalledTimes(1)
    expect(modifyRecord).not.toHaveBeenCalled()
  })

  it('does not open browser authorization when a saved grant has no refresh token', async () => {
    const { provider } = await createTestProvider(vi.fn(async () => ({ kind: 'grant', payload: {
      version: 1, clientInformation: registeredClient,
      tokens: { access_token: 'synthetic-expired', token_type: 'Bearer' },
    } })), { ...tokenProviderOptions(), allowAuthorizationFallback: false }, async () => undefined, registeredRedirectUrl)
    const tokenFetch = vi.fn()
    await expect(auth(withSyntheticDiscovery(provider), {
      serverUrl: new URL('https://mcp.scys.com/shengcai-web/mcp'), fetchFn: tokenFetch,
    })).rejects.toThrow('SCYS_RECONNECT_AUTHORIZATION_DISABLED')
    expect(tokenFetch).not.toHaveBeenCalled()
  })

  it('fails closed when the registered callback URI is absent instead of fabricating one', async () => {
    const readRecord = vi.fn(async () => ({ kind: 'grant', payload: {
      version: 1, clientInformation: { client_id: 'synthetic-client' },
      tokens: { access_token: 'synthetic-access', token_type: 'Bearer' },
    } }))
    const adapter = new ScysRadarAdapter({ readRecord } as never)
    const first = await adapter.getSourceStatus()
    expect(first.status).toBe('expired')
    expect(first.diagnostic?.stage).toBe('oauth_redirect_check')
    expect(first.diagnostic?.errorCode).toBe('SCYS_OAUTH_REDIRECT_MISSING')
    expect(first.diagnostic?.httpObservations).toEqual([])
    expect(await adapter.getSourceStatus()).toEqual(first)
    expect(readRecord).toHaveBeenCalledTimes(1)
  })

  it('retries a transient saved-grant reconnect only after bounded cooldown and shares the retry', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-14T00:00:00.000Z'))
    const readRecord = vi.fn(async () => ({ kind: 'grant', payload: {
      version: 1, clientInformation: registeredClient,
      tokens: { access_token: 'synthetic-access', token_type: 'Bearer', refresh_token: 'synthetic-refresh' },
    } }))
    let releaseConnect: (() => void) | undefined
    const retryGate = new Promise<void>(resolve => { releaseConnect = resolve })
    const connect = vi.spyOn(Client.prototype, 'connect')
      .mockRejectedValueOnce(Object.assign(new Error('private HTTP detail'), { name: 'StreamableHTTPError', code: 503 }))
      .mockImplementationOnce(async () => await retryGate)
    vi.spyOn(Client.prototype, 'listTools').mockResolvedValue({ tools: [] } as never)
    vi.spyOn(Client.prototype, 'close').mockResolvedValue(undefined)
    const adapter = new ScysRadarAdapter({ readRecord } as never)
    try {
      const first = await adapter.getSourceStatus()
      expect(first.status).toBe('error')
      expect(first.diagnostic?.errorCode).toBe('SCYS_HTTP_503')
      expect(JSON.stringify(first)).not.toContain('private HTTP detail')
      expect(await adapter.getSourceStatus()).toEqual(first)
      expect(readRecord).toHaveBeenCalledTimes(1)
      expect(connect).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(2 * 60_000 - 1)
      expect(await adapter.getSourceStatus()).toEqual(first)
      expect(connect).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(1)
      const retryA = adapter.getSourceStatus()
      const retryB = adapter.getSourceStatus()
      await vi.waitFor(() => expect(connect).toHaveBeenCalledTimes(2))
      expect(readRecord).toHaveBeenCalledTimes(2)
      releaseConnect?.()
      await expect(Promise.all([retryA, retryB])).resolves.toEqual([
        { status: 'connected' }, { status: 'connected' },
      ])
      expect(connect).toHaveBeenCalledTimes(2)
      expect(await adapter.getSourceStatus()).toEqual({ status: 'connected' })
    } finally {
      releaseConnect?.()
      await adapter.dispose()
      vi.useRealTimers()
      vi.restoreAllMocks()
    }
  })

  it('does not retry an authorization rejection or launch OAuth automatically', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-14T00:00:00.000Z'))
    const readRecord = vi.fn(async () => ({ kind: 'grant', payload: {
      version: 1, clientInformation: registeredClient,
      tokens: { access_token: 'synthetic-access', token_type: 'Bearer', refresh_token: 'synthetic-refresh' },
    } }))
    const connect = vi.spyOn(Client.prototype, 'connect').mockRejectedValue(
      Object.assign(new Error('private authorization detail'), { name: 'StreamableHTTPError', code: 401 }),
    )
    vi.spyOn(Client.prototype, 'listTools').mockResolvedValue({ tools: [] } as never)
    vi.spyOn(Client.prototype, 'close').mockResolvedValue(undefined)
    const adapter = new ScysRadarAdapter({ readRecord } as never)
    try {
      const first = await adapter.getSourceStatus()
      expect(first.status).toBe('expired')
      expect(first.diagnostic?.errorCode).toBe('SCYS_HTTP_401')
      await vi.advanceTimersByTimeAsync(60 * 60_000)
      expect(await adapter.getSourceStatus()).toEqual(first)
      expect(readRecord).toHaveBeenCalledTimes(1)
      expect(connect).toHaveBeenCalledTimes(1)
    } finally {
      await adapter.dispose()
      vi.useRealTimers()
      vi.restoreAllMocks()
    }
  })

  it('increases repeated transient reconnect cooldowns and caps the delay', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-14T00:00:00.000Z'))
    const readRecord = vi.fn(async () => ({ kind: 'grant', payload: {
      version: 1, clientInformation: registeredClient,
      tokens: { access_token: 'synthetic-access', token_type: 'Bearer', refresh_token: 'synthetic-refresh' },
    } }))
    const connect = vi.spyOn(Client.prototype, 'connect')
    for (let index = 0; index < 5; index += 1) {
      connect.mockRejectedValueOnce(Object.assign(new Error('private server detail'), { name: 'StreamableHTTPError', code: 503 }))
    }
    connect.mockResolvedValue(undefined)
    vi.spyOn(Client.prototype, 'listTools').mockResolvedValue({ tools: [] } as never)
    vi.spyOn(Client.prototype, 'close').mockResolvedValue(undefined)
    const adapter = new ScysRadarAdapter({ readRecord } as never)
    try {
      expect((await adapter.getSourceStatus()).status).toBe('error')
      for (const [index, minutes] of [2, 4, 8, 15, 15].entries()) {
        await vi.advanceTimersByTimeAsync(minutes * 60_000 - 1)
        expect((await adapter.getSourceStatus()).status).toBe('error')
        expect(connect).toHaveBeenCalledTimes(index + 1)
        await vi.advanceTimersByTimeAsync(1)
        const status = await adapter.getSourceStatus()
        expect(connect).toHaveBeenCalledTimes(index + 2)
        if (index < 4) expect(status.status).toBe('error')
        else expect(status).toEqual({ status: 'connected' })
      }
      expect(readRecord).toHaveBeenCalledTimes(6)
    } finally {
      await adapter.dispose()
      vi.useRealTimers()
      vi.restoreAllMocks()
    }
  })

  it('rejects a callback URI outside the original loopback registration', async () => {
    const readRecord = vi.fn(async () => ({ kind: 'grant', payload: {
      version: 1, clientInformation: { ...registeredClient, redirect_uris: ['https://other.example.test/callback'] },
      tokens: { access_token: 'synthetic-access', token_type: 'Bearer' },
    } }))
    const status = await new ScysRadarAdapter({ readRecord } as never).getSourceStatus()
    expect(status.status).toBe('expired')
    expect(status.diagnostic?.stage).toBe('oauth_redirect_check')
    expect(status.diagnostic?.errorCode).toBe('SCYS_OAUTH_REDIRECT_INVALID')
    expect(status.diagnostic?.httpObservations).toEqual([])
  })

  it('reports a missing saved authorization without attempting MCP connection', async () => {
    const readRecord = vi.fn(async () => undefined)
    const status = await new ScysRadarAdapter({ readRecord } as never).getSourceStatus()
    expect(status.status).toBe('disconnected')
    expect(status.diagnostic?.stage).toBe('credential_read')
    expect(status.diagnostic?.errorCode).toBe('SCYS_CREDENTIAL_NOT_FOUND')
    expect(readRecord).toHaveBeenCalledTimes(1)
  })

  it('distinguishes credential routing and native Keychain read failures without exposing records', async () => {
    const cases = [
      { error: new Error('WORKBENCH_SCYS_KEYCHAIN_UNAVAILABLE'), code: 'SCYS_CREDENTIAL_ROUTER_UNAVAILABLE' },
      { error: new Error('private read failure'), code: 'SCYS_CREDENTIAL_ROUTER_CALL_FAILED' },
      { error: Object.assign(new Error('KEYCHAIN_READ_FAILED'), { diagnostic: {
        operation: 'read', helperReached: true, osStatus: -50, message: 'private Keychain text',
      } }), code: 'SCYS_KEYCHAIN_NATIVE_READ_FAILED', osStatus: -50 },
      { error: Object.assign(new Error('KEYCHAIN_READ_FAILED'), { diagnostic: {
        operation: 'read', helperReached: true, osStatus: -77777, message: 'private Keychain text',
      } }), code: 'SCYS_KEYCHAIN_NATIVE_READ_FAILED' },
    ] as const
    for (const item of cases) {
      const readRecord = vi.fn(async () => { throw item.error })
      const result = await new ScysRadarAdapter({ readRecord } as never).getSourceStatus()
      expect(result.status).toBe('error')
      expect(result.diagnostic?.stage).toBe('credential_read')
      expect(result.diagnostic?.errorCode).toBe(item.code)
      expect(result.diagnostic?.keychainOsStatus).toBe('osStatus' in item ? item.osStatus : undefined)
      expect(result.diagnostic?.httpObservations).toEqual([])
      expect(JSON.stringify(result)).not.toMatch(/private|Keychain text/)
      expect(readRecord).toHaveBeenCalledTimes(1)
    }
  })

  it('distinguishes a provider record decode failure from Host authorization structure validation', async () => {
    const providerError = Object.assign(new Error('KEYCHAIN_READ_FAILED'), { diagnostic: {
      operation: 'read', helperReached: true, osStatus: null, message: 'CREDENTIAL_RECORD_PARSE_FAILED',
    } })
    const providerResult = await new ScysRadarAdapter({ readRecord: vi.fn(async () => { throw providerError }) } as never).getSourceStatus()
    expect(providerResult.diagnostic?.stage).toBe('credential_read')
    expect(providerResult.diagnostic?.errorCode).toBe('SCYS_CREDENTIAL_RECORD_PARSE_FAILED')

    const invalidResult = await new ScysRadarAdapter({ readRecord: vi.fn(async () => ({ kind: 'grant', payload: {
      version: 1, tokens: { access_token: 42, token_type: 'Bearer' },
    } })) } as never).getSourceStatus()
    expect(invalidResult.diagnostic?.stage).toBe('credential_parse')
    expect(invalidResult.diagnostic?.errorCode).toBe('SCYS_CREDENTIAL_STRUCTURE_INVALID')
    expect(JSON.stringify(invalidResult)).not.toMatch(/access_token|Bearer/)
    const parseFailure = classifyScysReconnectError(new Error('private parser detail'), reconnectTrace('credential_parse'))
    expect(parseFailure.errorCode).toBe('SCYS_CREDENTIAL_PARSE_FAILED')
    expect(JSON.stringify(parseFailure)).not.toContain('private parser detail')
  })

  it('separates missing authorization tokens from an absent credential record', async () => {
    const result = await new ScysRadarAdapter({ readRecord: vi.fn(async () => ({ kind: 'grant', payload: { version: 1 } })) } as never).getSourceStatus()
    expect(result.status).toBe('disconnected')
    expect(result.diagnostic?.stage).toBe('credential_parse')
    expect(result.diagnostic?.errorCode).toBe('SCYS_CREDENTIAL_INCOMPLETE')
  })

  it('classifies connection setup failures by the operation reached, not exception text', () => {
    for (const [stage, code] of [
      ['oauth_redirect_check', 'SCYS_OAUTH_REDIRECT_CHECK_FAILED'],
      ['oauth_provider_create', 'SCYS_OAUTH_PROVIDER_CREATE_FAILED'],
      ['mcp_transport_create', 'SCYS_MCP_TRANSPORT_CREATE_FAILED'],
      ['mcp_client_create', 'SCYS_MCP_CLIENT_CREATE_FAILED'],
    ] as const) {
      const result = classifyScysReconnectError(new Error('private setup detail'), reconnectTrace(stage))
      expect(result.stage).toBe(stage)
      expect(result.errorCode).toBe(code)
      expect(JSON.stringify(result)).not.toContain('private setup detail')
    }
  })

  it('keeps the tool surface to the explicit read-only allowlist', async () => {
    expect(SCYS_READONLY_TOOLS).toHaveLength(11)
    expect(SCYS_READONLY_TOOLS.includes('searchTopic')).toBe(true)
    expect(SCYS_READONLY_TOOLS.includes('topicDetail')).toBe(true)
    const client = {
      connect: vi.fn(async () => undefined), listTools: vi.fn(async () => ({ tools: [] })),
      callTool: vi.fn(async () => ({ structuredContent: { ok: true } })), close: vi.fn(async () => undefined),
    }
    await expect(callAllowedScysTool(client, 'searchTopic', { keyword: 'AI' })).resolves.toEqual({ ok: true })
    await expect(callAllowedScysTool(client, 'topicDetail', { topicId: 'topic-1' })).resolves.toEqual({ ok: true })
    for (const name of ['topicLike', 'addFavorite', 'deleteFavorite', 'publish', 'unlistedTool']) {
      await expect(callAllowedScysTool(client, name, {})).rejects.toThrow('SCYS_TOOL_NOT_ALLOWED')
    }
    expect(client.callTool).toHaveBeenCalledTimes(2)
    expect(client.callTool).toHaveBeenNthCalledWith(1, { name: 'searchTopic', arguments: { keyword: 'AI' } })
  })

  it('accepts OAuth callback codes only when state matches and no provider error exists', () => {
    expect(readOAuthCallbackCode(new URL('http://127.0.0.1/callback?code=opaque&state=match'), 'match')).toBe('opaque')
    expect(readOAuthCallbackCode(new URL('http://127.0.0.1/callback?code=opaque&state=other'), 'match')).toBeUndefined()
    expect(readOAuthCallbackCode(new URL('http://127.0.0.1/callback?code=opaque&state='), '')).toBeUndefined()
    expect(readOAuthCallbackCode(new URL('http://127.0.0.1/callback?code=opaque&state=match&error=denied'), 'match')).toBeUndefined()
    expect(readOAuthCallbackCode(new URL('http://127.0.0.1/callback?state=match'), 'match')).toBeUndefined()
  })

  it('maps only source content and leaves absent fields null', () => {
    expect(mapScysContent({
      topicId: 'topic-1', type: 'article', gmtCreate: '2026-10-07', detailUrl: 'https://scys.com/topic/1',
      topicDTO: { showTitle: '真实标题', articleContent: '真实正文' },
      topicUserDTO: { nickname: '作者' }, likeCount: 7, favoriteCount: 3, coinCount: 1, commentCount: 2,
      xsecToken: 'must-not-cross', cookie: 'must-not-cross',
    })).toEqual({
      source: 'scys', id: 'topic-1', entityType: null, entityId: null, contentType: 'article', title: '真实标题', summary: null, content: '真实正文',
      author: '作者', publishedAt: '2026-10-07', url: 'https://scys.com/topic/1', isHot: null, isDigested: null,
      engagement: { likeCount: 7, favoriteCount: 3, coinCount: 1, commentCount: 2 },
    })
  })

  it('preserves official topic identity and seconds-based publication time without replacing the card id', () => {
    expect(mapScysContent({ topicDTO: {
      topicId: 'card-id', entityType: 'xq_topic', entityId: '123456789012345678',
      type: 'talk', showTitle: '文章', gmtCreate: 1_791_094_809,
    } })).toMatchObject({
      id: 'card-id', entityType: 'xq_topic', entityId: '123456789012345678',
      contentType: 'talk', publishedAt: new Date(1_791_094_809_000).toISOString(),
    })
  })

  it('uses both official identity fields for full detail and one bounded comment page', async () => {
    const identity = { entityType: 'xq_topic', entityId: '123456789012345678' }
    const readRecord = vi.fn(async () => ({ kind: 'grant', payload: {
      version: 1, clientInformation: registeredClient,
      tokens: { access_token: 'synthetic-access', token_type: 'Bearer' },
    } }))
    const callTool = vi.spyOn(Client.prototype, 'callTool').mockImplementation(async request => {
      if (request.name === 'topicDetail') return { structuredContent: {
        topicDTO: { ...identity, topicId: 'card-id', showTitle: '文章', articleContent: '正文', articleContentContainFeishuDoc: '完整正文', gmtCreate: 1_791_094_809 },
        topicUserDTO: { nickname: '作者' }, detailUrl: 'https://scys.com/topic/1',
      } } as never
      return { structuredContent: { items: [{ commentId: '1', content: '真实评论' }] } } as never
    })
    vi.spyOn(Client.prototype, 'connect').mockResolvedValue(undefined)
    vi.spyOn(Client.prototype, 'listTools').mockResolvedValue({ tools: [
      { name: 'topicDetail', inputSchema: { properties: { entityType: {}, entityId: {} }, required: ['entityType', 'entityId'] } },
      { name: 'pageTopicComment', inputSchema: { properties: { entityType: {}, entityId: {}, commentPageSize: {} }, required: ['entityType', 'entityId'] } },
    ] } as never)
    vi.spyOn(Client.prototype, 'close').mockResolvedValue(undefined)
    try {
      const adapter = new ScysRadarAdapter({ readRecord } as never)
      expect((await adapter.getContentDetail(identity))).toMatchObject({ status: 'ready', item: {
        entityType: 'xq_topic', entityId: identity.entityId, content: '完整正文', author: '作者',
        publishedAt: new Date(1_791_094_809_000).toISOString(),
      } })
      expect(await adapter.loadComments(identity)).toMatchObject({ status: 'ready', comments: [{ text: '真实评论' }] })
      expect(callTool).toHaveBeenNthCalledWith(1, { name: 'topicDetail', arguments: identity })
      expect(callTool).toHaveBeenNthCalledWith(2, { name: 'pageTopicComment', arguments: { ...identity, commentPageSize: 20 } })
      await adapter.dispose()
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('rejects missing or unsupported topic identity before calling a tool', async () => {
    const callTool = vi.spyOn(Client.prototype, 'callTool')
    try {
      const adapter = new ScysRadarAdapter({ readRecord: vi.fn() } as never)
      expect(await adapter.getContentDetail({ entityType: 'talk', entityId: '123' })).toEqual({ status: 'SCYS_TOPIC_IDENTITY_MISSING' })
      expect(await adapter.loadComments({ entityType: null, entityId: '123' })).toEqual({ status: 'SCYS_TOPIC_IDENTITY_MISSING' })
      expect(callTool).not.toHaveBeenCalled()
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('maps project and comment fields without inventing a missing project URL', () => {
    expect(mapScysProject({ projectId: 'project-1', name: '案例', description: '案例描述' })).toEqual({
      source: 'scys', id: 'project-1', title: '案例', summary: null, description: '案例描述', publishedAt: null,
      url: null, engagement: { likeCount: null, favoriteCount: null, coinCount: null, commentCount: null },
    })
    expect(mapScysComment({ commentId: 'comment-1', content: '评论', userInfo: { nickname: '读者' }, likeCount: 4 })).toEqual({
      source: 'scys', id: 'comment-1', text: '评论', author: '读者', publishedAt: null, likeCount: 4,
    })
  })

  it('finds a populated nested list even when an earlier envelope contains an empty list', () => {
    expect(findScysRows({ list: [], data: { items: [{ topicId: 'topic-1' }] } })).toEqual([{ topicId: 'topic-1' }])
    expect(findScysRows({ data: { list: [] } })).toEqual([])
  })

  it('finds contentSearch rows inside the topicDetailDTO response envelope', () => {
    const rows = [{ topicId: 'topic-1', topicDTO: { showTitle: '真实标题' } }]
    expect(findScysRows({ topicDetailDTO: { items: rows } })).toEqual(rows)
  })

  it('does not expose credentials through status projections', () => {
    const status = { status: 'connected' as const }
    expect(JSON.stringify(status)).not.toMatch(/access_token|refresh_token|authorization|cookie/i)
  })

  it('returns only safe HTTP reconnect diagnostics', () => {
    const diagnostic = classifyScysReconnectError(Object.assign(new Error('https://example.invalid/token?access_token=secret'), {
      name: 'StreamableHTTPError', code: 401,
    }), {
      ...reconnectTrace('oauth_token_refresh'),
      httpObservations: [{ phase: 'oauth_token_refresh', requestAttempted: true, httpStatus: 401, errorType: null, errorCode: null }],
    })
    expect(diagnostic).toEqual({
      stage: 'oauth_token_refresh', errorCode: 'SCYS_HTTP_401', httpStatus: 401,
      safeMessage: 'OAuth token refresh received HTTP 401.',
      httpObservations: [{ phase: 'oauth_token_refresh', requestAttempted: true, httpStatus: 401, errorType: null, errorCode: null }],
      errorType: 'StreamableHTTPError', safeErrorCode: 'HTTP_401', sdkErrorSourceFile: null, sdkErrorSourceLine: null,
    })
    expect(JSON.stringify(diagnostic)).not.toMatch(/secret|access_token|example\.invalid/)
  })

  it('classifies network failures without exposing their original message', () => {
    const diagnostic = classifyScysReconnectError(Object.assign(new Error('host name with credential fragments'), {
      cause: Object.assign(new Error('hidden'), { code: 'ENOTFOUND' }),
    }), reconnectTrace('mcp_initialize'))
    expect(diagnostic).toEqual({
      stage: 'mcp_initialize', errorCode: 'SCYS_NETWORK_ENOTFOUND', httpStatus: null,
      safeMessage: 'DNS lookup failed.',
      httpObservations: [], errorType: 'Error', safeErrorCode: 'ENOTFOUND', sdkErrorSourceFile: null, sdkErrorSourceLine: null,
    })
    expect(JSON.stringify(diagnostic)).not.toMatch(/credential|hidden/)
  })

  it('reports only allowlisted OAuth token-check error details', () => {
    const diagnostic = classifyScysReconnectError(Object.assign(new TypeError('secret token value'), {
      code: 'ERR_INVALID_ARG_TYPE',
    }), { ...reconnectTrace('oauth_token_check'), failurePoint: 'token_record_read' })
    expect(diagnostic).toEqual({
      stage: 'oauth_token_check',
      errorCode: 'SCYS_OAUTH_TOKEN_CHECK_TOKEN_RECORD_READ_INVALID_ARGUMENT_TYPE', httpStatus: null,
      safeMessage: 'The saved OAuth credential record could not be read for the reconnect.',
      httpObservations: [], errorType: 'TypeError', safeErrorCode: 'ERR_INVALID_ARG_TYPE', sdkErrorSourceFile: null, sdkErrorSourceLine: null,
    })
    expect(JSON.stringify(diagnostic)).not.toMatch(/secret|token value/)
  })

  it('reads one grant per connection and reuses it for repeated SDK token callbacks', async () => {
    const tokens = { access_token: 'synthetic-access', token_type: 'Bearer' }
    const readRecord = vi.fn(async () => ({ kind: 'grant', payload: { version: 1, tokens } }))
    const providerOptions = tokenProviderOptions()
    const { provider } = await createTestProvider(readRecord, providerOptions)

    await expect(provider.tokens()).resolves.toEqual(tokens)
    await expect(provider.tokens()).resolves.toEqual(tokens)
    expect(readRecord).toHaveBeenCalledTimes(1)
    expect(providerOptions.calls).toBe(2)
    expect(providerOptions.failurePoints).toEqual(['token_record_read', 'token_mapping', undefined, 'token_record_read', 'token_mapping', undefined])
  })

  it('propagates the first credential read failure without treating it as a missing grant', async () => {
    const failingOptions = tokenProviderOptions()
    const readFailure = Object.assign(new Error('sensitive credential detail'), { code: 'KEYCHAIN_READ_FAILED' })
    await expect(createTestProvider(vi.fn(async () => { throw readFailure }), failingOptions)).rejects.toBe(readFailure)
    expect(failingOptions.calls).toBe(0)
    expect(JSON.stringify(failingOptions.observations)).not.toMatch(/sensitive|credential detail/)
  })

  it('does not report a failed credential read as disconnected', async () => {
    const adapter = new ScysRadarAdapter({ readRecord: vi.fn(async () => { throw new Error('synthetic read failure') }) } as never)
    const status = await adapter.getSourceStatus()
    expect(status.status).toBe('error')
    expect(status.diagnostic?.stage).toBe('credential_read')
  })

  it('returns complete stored client information from the connection snapshot', async () => {
    const clientInformation = {
      client_id: 'synthetic-client',
      redirect_uris: ['http://127.0.0.1:1234/callback'],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      client_name: 'Synthetic client',
    }
    const readRecord = vi.fn(async () => ({ kind: 'grant', payload: { version: 1, clientInformation } }))
    const { provider } = await createTestProvider(readRecord)
    expect(provider.clientInformation()).toEqual(clientInformation)
    expect(readRecord).toHaveBeenCalledOnce()
  })

  it('rejects malformed grant or token fields before exposing them to the SDK', async () => {
    const parseOptions = tokenProviderOptions()
    await expect(createTestProvider(vi.fn(async () => ({ kind: 'other', payload: {} })), parseOptions)).rejects.toThrow('SCYS_CREDENTIAL_RECORD_INVALID')
    expect(JSON.stringify(parseOptions.observations)).not.toMatch(/access_token|Bearer/)

    const invalidTokensOptions = tokenProviderOptions()
    await expect(createTestProvider(vi.fn(async () => ({ kind: 'grant', payload: { version: 1, tokens: { access_token: 42, token_type: 'Bearer' } } })), invalidTokensOptions)).rejects.toThrow('SCYS_CREDENTIAL_RECORD_INVALID')
    expect(JSON.stringify(invalidTokensOptions.observations)).not.toMatch(/access_token|Bearer/)
  })

  it('lets SDK _commonHeaders consume the snapshotted token after callback return', async () => {
    const tokens = { access_token: 'synthetic-access', token_type: 'Bearer' }
    const providerOptions = tokenProviderOptions()
    const { provider } = await createTestProvider(vi.fn(async () => ({ kind: 'grant', payload: { version: 1, tokens } })), providerOptions)
    const transport = new StreamableHTTPClientTransport(new URL('https://mcp.scys.com/shengcai-web/mcp'), { authProvider: provider })
    const headers = await (transport as unknown as { _commonHeaders(): Promise<Headers> })._commonHeaders()
    expect(headers.get('authorization')).toBe('Bearer synthetic-access')
    expect(providerOptions.observations.map(item => [item.stage, item.result])).toEqual([
      ['token_mapping', 'pass'], ['callback_return', 'pass'],
    ])
  })

  it('persists refreshed tokens before replacing the connection snapshot', async () => {
    const initial = { access_token: 'synthetic-old', token_type: 'Bearer' }
    const refreshed = { access_token: 'synthetic-new', token_type: 'Bearer', refresh_token: 'synthetic-refresh', expires_in: 600 }
    let current: unknown = { kind: 'grant', payload: { version: 1, tokens: initial } }
    const readRecord = vi.fn(async () => current)
    const modifyRecord = vi.fn(async (_key: unknown, mutate: (record: unknown) => Promise<unknown>) => {
      current = await mutate(current)
      return current
    })
    const providerOptions = tokenProviderOptions()
    const { provider } = await createTestProvider(readRecord, providerOptions, modifyRecord)
    await provider.saveTokens(refreshed)
    await expect(provider.tokens()).resolves.toEqual(refreshed)
    expect(modifyRecord).toHaveBeenCalledTimes(1)
    expect(readRecord).toHaveBeenCalledTimes(1)
    expect(current).toEqual({ kind: 'grant', payload: { version: 1, tokens: refreshed } })
  })

  it('does not replace the in-memory grant when refresh persistence fails', async () => {
    const initial = { access_token: 'synthetic-old', token_type: 'Bearer' }
    const refreshed = { access_token: 'synthetic-new', token_type: 'Bearer' }
    const modifyRecord = vi.fn(async () => { throw new Error('synthetic persistence failure') })
    const { provider } = await createTestProvider(vi.fn(async () => ({ kind: 'grant', payload: { version: 1, tokens: initial } })), tokenProviderOptions(), modifyRecord)
    await expect(provider.saveTokens(refreshed)).rejects.toThrow('synthetic persistence failure')
    await expect(provider.tokens()).resolves.toEqual(initial)
  })

  it('clears the connection snapshot on disposal and reloads a fresh grant for the next connection', async () => {
    let currentToken = 'synthetic-first'
    const readRecord = vi.fn(async () => ({ kind: 'grant', payload: { version: 1, tokens: { access_token: currentToken, token_type: 'Bearer' } } }))
    const first = await createTestProvider(readRecord, tokenProviderOptions())
    const client = { close: vi.fn(async () => undefined) }
    ;(first.adapter as unknown as { connection: unknown }).connection = {
      client,
      transport: {} as StreamableHTTPClientTransport,
      tools: [],
      grantSnapshot: first.snapshot,
    }
    await first.adapter.dispose()
    expect(client.close).toHaveBeenCalledOnce()
    expect(first.snapshot.grant).toBeUndefined()

    currentToken = 'synthetic-second'
    const second = await createTestProvider(readRecord, tokenProviderOptions())
    await expect(second.provider.tokens()).resolves.toEqual({ access_token: 'synthetic-second', token_type: 'Bearer' })
    expect(readRecord).toHaveBeenCalledTimes(2)
  })

  it('clears the in-memory grant before refusing a prohibited saved-credential invalidation', async () => {
    const providerOptions = { ...tokenProviderOptions(), allowCredentialInvalidation: false }
    const { provider, snapshot } = await createTestProvider(
      vi.fn(async () => ({ kind: 'grant', payload: { version: 1, tokens: { access_token: 'synthetic-access', token_type: 'Bearer' } } })),
      providerOptions,
    )
    if (provider.invalidateCredentials === undefined) throw new Error('Provider must expose credential invalidation')
    await expect(provider.invalidateCredentials('tokens')).rejects.toThrow('SCYS_RECONNECT_CREDENTIAL_INVALIDATION_DISABLED')
    expect((snapshot.grant as { readonly tokens?: unknown } | undefined)?.tokens).toBeUndefined()
  })

  it('does not expose unknown OAuth error codes or messages', () => {
    const diagnostic = classifyScysReconnectError(Object.assign(new Error('access_token=private'), {
      code: 'private_access_token',
    }), reconnectTrace('oauth_token_check'))
    expect(diagnostic).toEqual({
      stage: 'oauth_token_check',
      errorCode: 'SCYS_OAUTH_TOKEN_CHECK_OAUTH_TOKEN_VALIDATION_ERROR', httpStatus: null,
      safeMessage: 'The OAuth SDK rejected or could not process the saved client or token data.',
      httpObservations: [], errorType: 'Error', safeErrorCode: null, sdkErrorSourceFile: null, sdkErrorSourceLine: null,
    })
    expect(JSON.stringify(diagnostic)).not.toMatch(/private|access_token/)
  })

  it('records a real fetch boundary status without retaining request data', async () => {
    const trace = reconnectTrace()
    const fetchFn = createScysObservedFetch(vi.fn(async () => new Response(null, { status: 401 })), trace, () => false)
    await fetchFn('https://mcp.scys.com/shengcai-web/mcp?access_token=secret', { method: 'POST', body: 'sensitive request body' })

    expect(trace.httpObservations).toEqual([{
      phase: 'mcp_initialize', requestAttempted: true, httpStatus: 401, errorType: null, errorCode: null,
    }])
    expect(JSON.stringify(trace.httpObservations)).not.toMatch(/secret|sensitive|mcp\.scys\.com/)
  })

  it('distinguishes a token refresh fetch rejection from an HTTP response', async () => {
    const trace = reconnectTrace()
    const networkError = Object.assign(new TypeError('sensitive URL and token'), { cause: Object.assign(new Error('private'), { code: 'ECONNRESET' }) })
    const fetchFn = createScysObservedFetch(vi.fn(async () => { throw networkError }), trace, () => false)

    await expect(fetchFn('https://auth.example.invalid/oauth/token?refresh_token=secret', { method: 'POST', body: 'private' })).rejects.toBe(networkError)
    expect(trace.httpObservations).toEqual([{
      phase: 'oauth_token_refresh', requestAttempted: true, httpStatus: null, errorType: 'TypeError', errorCode: 'ECONNRESET',
    }])
  })

  it('keeps SDK source location without exposing an unobserved request or stack text', () => {
    const error = Object.assign(new Error('private access_token'), {
      stack: 'Error: private access_token\n    at auth (node_modules/@modelcontextprotocol/sdk/dist/esm/client/auth.js:137:11)',
    })
    const diagnostic = classifyScysReconnectError(error, reconnectTrace('oauth_token_check'))

    expect(diagnostic.httpObservations).toEqual([])
    expect(diagnostic.sdkErrorSourceFile).toBe('client/auth.js')
    expect(diagnostic.sdkErrorSourceLine).toBe(137)
    expect(JSON.stringify(diagnostic)).not.toMatch(/private|access_token|node_modules|Error:/)
  })

  it('records an MCP network failure as an attempted fetch with no response status', async () => {
    const trace = reconnectTrace()
    const networkError = Object.assign(new TypeError('sensitive endpoint'), { cause: Object.assign(new Error('hidden'), { code: 'ENOTFOUND' }) })
    const fetchFn = createScysObservedFetch(vi.fn(async () => { throw networkError }), trace, () => false)
    await expect(fetchFn('https://mcp.scys.com/shengcai-web/mcp', { method: 'POST' })).rejects.toBe(networkError)

    const diagnostic = classifyScysReconnectError(networkError, trace)
    expect(diagnostic.httpObservations[0]).toMatchObject({ phase: 'mcp_initialize', requestAttempted: true, httpStatus: null, errorCode: 'ENOTFOUND' })
    expect(diagnostic.errorCode).toBe('SCYS_NETWORK_ENOTFOUND')
  })

  it('does not retain more than twelve request observations', async () => {
    const trace = reconnectTrace()
    const fetchFn = createScysObservedFetch(vi.fn(async () => new Response(null, { status: 200 })), trace, () => true)
    for (let index = 0; index < 13; index += 1) await fetchFn('https://mcp.scys.com/shengcai-web/mcp', { method: 'POST' })
    expect(trace.httpObservations).toHaveLength(12)
  })
})

function tokenProviderOptions() {
  const state = { calls: 0, observations: [] as ScysTokenCallbackObservation[], failurePoints: [] as (string | undefined)[] }
  return {
    get calls() { return state.calls },
    observations: state.observations,
    failurePoints: state.failurePoints,
    onTokensCallbackCall() { state.calls += 1 },
    onTokensCallbackObservation(observation: ScysTokenCallbackObservation) { state.observations.push(observation) },
    onFailurePoint(value: string | undefined) { state.failurePoints.push(value) },
  }
}

async function createTestProvider(
  readRecord: () => Promise<unknown>,
  options: ReturnType<typeof tokenProviderOptions> & { readonly allowCredentialInvalidation?: boolean; readonly allowAuthorizationFallback?: boolean } = tokenProviderOptions(),
  modifyRecord: ((key: unknown, mutate: (record: unknown) => Promise<unknown>) => Promise<unknown>) = async () => undefined,
  redirectUrl?: string,
): Promise<{ provider: OAuthClientProvider; snapshot: { grant: unknown }; adapter: ScysRadarAdapter }> {
  const adapter = new ScysRadarAdapter({ readRecord, modifyRecord } as never)
  const readSnapshot = (adapter as unknown as { readGrantSnapshot(): Promise<{ grant: unknown }> }).readGrantSnapshot.bind(adapter)
  const snapshot = await readSnapshot()
  const factory = (adapter as unknown as {
      createProvider(
        redirectUrl: string | undefined,
        stateChanged: ((state: string) => void) | undefined,
      options: ReturnType<typeof tokenProviderOptions> & { readonly allowCredentialInvalidation?: boolean; readonly grantSnapshot: { grant: unknown } },
    ): Promise<OAuthClientProvider>
  }).createProvider.bind(adapter)
  const provider = await factory(redirectUrl, undefined, { ...options, grantSnapshot: snapshot })
  return { provider, snapshot, adapter }
}

function withSyntheticDiscovery(provider: OAuthClientProvider): OAuthClientProvider {
  return {
    ...provider,
    discoveryState: async () => ({
      authorizationServerUrl: 'https://auth.example.test',
      authorizationServerMetadata: {
        issuer: 'https://auth.example.test', authorization_endpoint: 'https://auth.example.test/authorize',
        token_endpoint: 'https://auth.example.test/token', response_types_supported: ['code'],
      },
      resourceMetadata: {
        resource: 'https://mcp.scys.com/shengcai-web/mcp',
        authorization_servers: ['https://auth.example.test'],
      },
    }),
  }
}
