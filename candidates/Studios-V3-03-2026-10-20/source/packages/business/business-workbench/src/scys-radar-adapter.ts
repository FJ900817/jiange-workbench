/** Workbench-owned SCYS OAuth and read-only MCP adapter; only normalized data crosses its Remote API. */

import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import type { AddressInfo } from 'node:net'
import type { Context } from '@deepseek-ai/cordis'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import type { CredentialRecord, GrantRecord } from '@deepseek-ai/dsh-credentials'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { UnauthorizedError, type OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { OAuthClientInformationFullSchema, OAuthClientInformationSchema, OAuthTokensSchema } from '@modelcontextprotocol/sdk/shared/auth.js'
import type { OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js'
import type {
  ScysComment, ScysCommentLoadResult, ScysContentDetailResult, ScysContentSearchResult, ScysHttpBoundaryObservation,
  ScysContentSummary, ScysFeedMode, ScysFeedQueryInfo, ScysFeedQueryResult, ScysProjectDetailResult, ScysProjectSearchResult, ScysProjectSummary,
  ScysReconnectDiagnostic, ScysSourceStatusResult, ScysTokenCallbackObservation, ScysTopicIdentity,
} from './types.ts'

const SCYS_MCP_URL = 'https://mcp.scys.com/shengcai-web/mcp'
const SCYS_CREDENTIAL_KEY = credentialKey('workbench-scys', 'oauth')
const OAUTH_TIMEOUT_MS = 5 * 60_000
const MAX_ITEMS = 20
const MAX_COMMENTS = 20
const SCYS_FEED_WINDOW_SECONDS = 7 * 24 * 60 * 60
const SCYS_FEED_PAGE_SIZE = 10
const SCYS_FEED_MAX_PAGES = 2
const SCYS_FEED_TOOL_TIMEOUT_MS = 12_000
const SCYS_FEED_CACHE_TTL_MS = 15 * 60_000
const SCYS_RECONNECT_RETRY_DELAYS_MS = [2 * 60_000, 4 * 60_000, 8 * 60_000, 15 * 60_000] as const
const SCYS_RECONNECT_TRANSIENT_NETWORK_CODES = new Set([
  'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT',
])
const ALLOWED_KEYCHAIN_READ_OSSTATUS = new Set([-50, -25291, -25293, -25300, -25308])
/** Fixed upstream SCYS tools available to this Host adapter. */
export const SCYS_READONLY_TOOLS = [
  'contentSearch', 'searchTopic', 'topicDetail', 'searchProjectCases', 'projectLibSearch',
  'projectLibDetail', 'pageTopicComment', 'getProfileInfo', 'activitySearch',
  'activityManualSearch', 'activityManualDetail',
] as const

interface StoredOAuthGrant {
  readonly version: 1
  readonly tokens?: OAuthTokens
  readonly clientInformation?: OAuthClientInformationMixed
}

interface ListedTool {
  readonly name: string
  readonly inputSchema: { readonly properties?: Record<string, unknown>; readonly required?: readonly string[] }
}

interface McpClientLike {
  connect(transport: unknown): Promise<void>
  listTools(): Promise<{ readonly tools: readonly ListedTool[] }>
  callTool(
    request: { readonly name: string; readonly arguments: Record<string, unknown> },
    resultSchema?: unknown,
    options?: { readonly timeout: number },
  ): Promise<Record<string, unknown>>
  close(): Promise<void>
}

interface ActiveConnection {
  readonly client: McpClientLike
  readonly transport: StreamableHTTPClientTransport
  readonly tools: readonly ListedTool[]
  readonly grantSnapshot: OAuthGrantSnapshot
}

interface OAuthGrantSnapshot {
  grant: StoredOAuthGrant | undefined
}

type ScysOAuthCheckFailurePoint = 'client_information_read' | 'token_record_read' | 'token_mapping' | 'oauth_token_validation'

interface ReconnectTrace {
  stage: ScysReconnectDiagnostic['stage']
  failurePoint?: ScysOAuthCheckFailurePoint
  readonly httpObservations: MutableScysHttpObservation[]
  tokensCallbackCallCount: number
  readonly tokenCallbackObservations: ScysTokenCallbackObservation[]
}

interface MutableScysHttpObservation {
  readonly phase: ScysHttpBoundaryObservation['phase']
  readonly requestAttempted: true
  httpStatus: number | null
  errorType: string | null
  errorCode: string | null
}

interface ProviderOptions {
  readonly allowAuthorizationFallback?: boolean
  readonly allowCredentialInvalidation?: boolean
  readonly grantSnapshot: OAuthGrantSnapshot
  readonly onStage?: (stage: ScysReconnectDiagnostic['stage']) => void
  readonly onFailurePoint?: (failurePoint: ScysOAuthCheckFailurePoint | undefined) => void
  readonly onTokensCallbackCall?: () => void
  readonly onTokensCallbackObservation?: (observation: ScysTokenCallbackObservation) => void
}

type TokenCallbackStage = ScysTokenCallbackObservation['stage']
type TokenCallbackObservationRecorder = (stage: TokenCallbackStage, result: 'pass' | 'fail', error?: unknown) => void
type CredentialReadRecorder = (stage: 'credential_read' | 'credential_parse', result: 'pass' | 'fail', error?: unknown) => void

type SourceFailure = 'SCYS_NOT_CONNECTED' | 'SCYS_AUTH_EXPIRED' | 'SCYS_MCP_UNAVAILABLE'
type CachedScysFeed = Extract<ScysFeedQueryResult, { readonly status: 'ready' | 'empty' }>

/** Exposes fixed SCYS product operations; it never registers upstream tools on the Harness tool registry. */
export class ScysRadarAdapter {
  private connection: ActiveConnection | undefined
  private oauthPending = false
  private status: ScysSourceStatusResult['status'] = 'disconnected'
  private reconnectResult: ScysSourceStatusResult | undefined
  private reconnectPromise: Promise<ScysSourceStatusResult> | undefined
  private reconnectRetryAt = 0
  private reconnectFailureCount = 0
  private reconnectRetryable = false
  private readonly feedCache = new Map<ScysFeedMode, { readonly result: CachedScysFeed; readonly expiresAt: number }>()
  private readonly feedRequests = new Map<ScysFeedMode, Promise<ScysFeedQueryResult>>()
  private disposed = false

  /** @param credentials - Host-only Harness credential provider. */
  constructor(private readonly credentials: Context['credentials']) {}

  /** Return a content-free connection state, retrying transient saved-grant failures only after bounded cooldowns. @returns Safe source status. */
  async getSourceStatus(): Promise<ScysSourceStatusResult> {
    if (this.oauthPending) return { status: 'connecting' }
    if (this.connection !== undefined) return { status: 'connected' }
    if (this.reconnectPromise !== undefined) return this.reconnectPromise
    if (this.reconnectResult !== undefined
      && (!this.reconnectRetryable || Date.now() < this.reconnectRetryAt)) return this.reconnectResult
    const reconnect = this.reconnectWithSavedGrant()
    this.reconnectPromise = reconnect
    try {
      const result = await reconnect
      this.reconnectResult = result
      if (result.status === 'connected') {
        this.reconnectFailureCount = 0
        this.reconnectRetryAt = 0
        this.reconnectRetryable = false
      } else {
        this.reconnectRetryable = isRetryableSavedGrantFailure(result)
        if (this.reconnectRetryable) {
          const delayIndex = Math.min(this.reconnectFailureCount, SCYS_RECONNECT_RETRY_DELAYS_MS.length - 1)
          this.reconnectRetryAt = Date.now() + SCYS_RECONNECT_RETRY_DELAYS_MS[delayIndex]!
          this.reconnectFailureCount += 1
        } else {
          this.reconnectRetryAt = 0
        }
      }
      return result
    } finally {
      if (this.reconnectPromise === reconnect) this.reconnectPromise = undefined
    }
  }

  /** Begin one browser-mediated OAuth 2.1 flow; status is polled separately while the user authorizes. @returns Content-free connecting state. */
  async connect(): Promise<ScysSourceStatusResult> {
    if (this.oauthPending) return { status: 'connecting' }
    this.reconnectResult = undefined
    this.reconnectRetryAt = 0
    this.reconnectFailureCount = 0
    this.reconnectRetryable = false
    this.oauthPending = true
    this.status = 'connecting'
    void this.runOAuthFlow().catch(() => { this.status = 'error' }).finally(() => { this.oauthPending = false })
    return { status: 'connecting' }
  }

  /** Search SCYS content using only the fixed contentSearch/searchTopic allowlist. @param keyword - User-entered query. @returns Normalized content cards or safe failure. */
  async searchContent(keyword: string): Promise<ScysContentSearchResult> {
    const trimmed = keyword.trim()
    if (trimmed.length === 0 || trimmed.length > 100) return { status: 'SCYS_SEARCH_ERROR' }
    return this.withConnection(async connection => {
      const tool = chooseTool(connection.tools, ['contentSearch', 'searchTopic'])
      if (tool === undefined) return { status: 'SCYS_SEARCH_ERROR' }
      const args = searchArguments(tool, trimmed)
      if (args === undefined) return { status: 'SCYS_SEARCH_ERROR' }
      const result = await callAllowedScysTool(connection.client, tool.name, args)
      if (result === undefined) return { status: 'SCYS_SEARCH_ERROR' }
      const items = findScysRows(result).slice(0, MAX_ITEMS).map(mapScysContent)
      return items.length === 0 ? { status: 'empty' } : { status: 'ready', items }
    }, failure => ({ status: failure }))
  }

  /** Query one fixed official feed mode over a seven-day window, caching successful results in Host memory for fifteen minutes. @param mode - Recent, official-hot, or official-digested query. @param refresh - Bypass a fresh cache entry while retaining it for stale fallback. @returns Normalized rows and evidence that distinguishes an accepted filter from per-topic markers. */
  async queryFeed(mode: ScysFeedMode, refresh = false): Promise<ScysFeedQueryResult> {
    if (this.disposed) return { status: 'SCYS_MCP_UNAVAILABLE' }
    if (mode !== 'recent' && mode !== 'hot' && mode !== 'digested') return { status: 'SCYS_FEED_QUERY_UNSUPPORTED' }
    const now = Date.now()
    const cached = this.feedCache.get(mode)
    if (!refresh && cached !== undefined && cached.expiresAt > now) return cached.result
    const active = this.feedRequests.get(mode)
    if (active !== undefined) return await active
    const request = this.fetchFeed(mode, cached?.result)
    this.feedRequests.set(mode, request)
    try {
      return await request
    } finally {
      if (this.feedRequests.get(mode) === request) this.feedRequests.delete(mode)
    }
  }

  private async fetchFeed(mode: ScysFeedMode, previous: CachedScysFeed | undefined): Promise<ScysFeedQueryResult> {
    return this.withConnection(async connection => {
      const tool = chooseTool(connection.tools, ['searchTopic'])
      if (tool === undefined) return { status: 'SCYS_FEED_QUERY_UNSUPPORTED' as const }
      const windowEndSeconds = Math.floor(Date.now() / 1_000)
      const windowStartSeconds = windowEndSeconds - SCYS_FEED_WINDOW_SECONDS
      const rows: Record<string, unknown>[] = []
      let pagesRead = 0
      let mayHaveMore = false
      for (let pageIndex = 1; pageIndex <= SCYS_FEED_MAX_PAGES; pageIndex += 1) {
        const args = feedQueryArguments(tool, mode, windowStartSeconds, windowEndSeconds, pageIndex)
        if (args === undefined) return { status: 'SCYS_FEED_QUERY_UNSUPPORTED' as const }
        const result = await callAllowedScysTool(connection.client, tool.name, args, SCYS_FEED_TOOL_TIMEOUT_MS)
        if (result === undefined) return { status: 'SCYS_FEED_QUERY_ERROR' as const }
        const pageRows = findScysRows(result)
        rows.push(...pageRows)
        pagesRead += 1
        if (pageRows.length < SCYS_FEED_PAGE_SIZE) break
        mayHaveMore = pageIndex === SCYS_FEED_MAX_PAGES
      }
      const items = deduplicateScysTopics(rows.map(mapScysContent), windowStartSeconds, windowEndSeconds)
        .map(projectFeedItem)
        .slice(0, SCYS_FEED_PAGE_SIZE * SCYS_FEED_MAX_PAGES)
      const query: ScysFeedQueryInfo = {
        mode,
        windowStart: new Date(windowStartSeconds * 1_000).toISOString(),
        windowEnd: new Date(windowEndSeconds * 1_000).toISOString(),
        fetchedAt: new Date().toISOString(),
        stale: false,
        refreshErrorCode: null,
        pagesRead,
        mayHaveMore,
        serverFilterAccepted: true,
        itemMarkerEvidence: markerEvidence(mode, items),
      }
      const result: CachedScysFeed = items.length === 0 ? { status: 'empty', query } : { status: 'ready', query, items }
      if (!this.disposed) this.feedCache.set(mode, { result, expiresAt: Date.now() + SCYS_FEED_CACHE_TTL_MS })
      return result
    }, failure => ({ status: failure }))
      .then(result => {
        if (result.status !== 'SCYS_NOT_CONNECTED' && result.status !== 'SCYS_AUTH_EXPIRED'
          && result.status !== 'SCYS_MCP_UNAVAILABLE' && result.status !== 'SCYS_FEED_QUERY_UNSUPPORTED'
          && result.status !== 'SCYS_FEED_QUERY_ERROR') return result
        if (previous === undefined) return result
        return {
          ...previous,
          query: { ...previous.query, stale: true, refreshErrorCode: result.status },
        }
      })
      .catch(() => previous === undefined
        ? { status: 'SCYS_FEED_QUERY_ERROR' as const }
        : { ...previous, query: { ...previous.query, stale: true, refreshErrorCode: 'SCYS_FEED_QUERY_ERROR' } })
  }

  /** Read one selected SCYS topic through topicDetail. @param identity - Source-provided entity type and id from search. @returns Normalized content detail or an identity error. */
  async getContentDetail(identity: ScysTopicIdentity): Promise<ScysContentDetailResult> {
    if (!validTopicIdentity(identity)) return { status: 'SCYS_TOPIC_IDENTITY_MISSING' }
    return this.withConnection(async connection => {
      const tool = chooseTool(connection.tools, ['topicDetail'])
      const args = tool === undefined ? undefined : topicIdentityArguments(tool, identity)
      if (tool === undefined || args === undefined) return { status: 'SCYS_DETAIL_ERROR' }
      const result = await callAllowedScysTool(connection.client, tool.name, args)
      const row = result === undefined ? undefined : findDetail(result)
      return row === undefined ? { status: 'SCYS_DETAIL_ERROR' } : { status: 'ready', item: mapScysContent(row) }
    }, failure => ({ status: failure === 'SCYS_NOT_CONNECTED' || failure === 'SCYS_AUTH_EXPIRED' ? failure : 'SCYS_DETAIL_ERROR' }))
  }

  /** Search SCYS project cases through the fixed project-search allowlist. @param keyword - User-entered query. @returns Normalized project cards or safe failure. */
  async searchProjects(keyword: string): Promise<ScysProjectSearchResult> {
    const trimmed = keyword.trim()
    if (trimmed.length === 0 || trimmed.length > 100) return { status: 'SCYS_PROJECT_ERROR' }
    return this.withConnection(async connection => {
      const tool = chooseTool(connection.tools, ['searchProjectCases', 'projectLibSearch'])
      const args = tool === undefined ? undefined : searchArguments(tool, trimmed)
      if (tool === undefined || args === undefined) return { status: 'SCYS_PROJECT_ERROR' }
      const result = await callAllowedScysTool(connection.client, tool.name, args)
      if (result === undefined) return { status: 'SCYS_PROJECT_ERROR' }
      const items = findScysRows(result).slice(0, MAX_ITEMS).map(mapScysProject)
      return items.length === 0 ? { status: 'empty' } : { status: 'ready', items }
    }, failure => ({ status: failure === 'SCYS_NOT_CONNECTED' || failure === 'SCYS_AUTH_EXPIRED' ? failure : 'SCYS_PROJECT_ERROR' }))
  }

  /** Read one selected project case through projectLibDetail. @param id - Source identifier from a prior project result. @returns Normalized project detail. */
  async getProjectDetail(id: string): Promise<ScysProjectDetailResult> {
    if (id.length === 0 || id.length > 200) return { status: 'SCYS_PROJECT_ERROR' }
    return this.withConnection(async connection => {
      const tool = chooseTool(connection.tools, ['projectLibDetail'])
      const args = tool === undefined ? undefined : idArguments(tool, id)
      if (tool === undefined || args === undefined) return { status: 'SCYS_PROJECT_ERROR' }
      const result = await callAllowedScysTool(connection.client, tool.name, args)
      const row = result === undefined ? undefined : findDetail(result)
      return row === undefined ? { status: 'SCYS_PROJECT_ERROR' } : { status: 'ready', item: mapScysProject(row) }
    }, failure => ({ status: failure === 'SCYS_NOT_CONNECTED' || failure === 'SCYS_AUTH_EXPIRED' ? failure : 'SCYS_PROJECT_ERROR' }))
  }

  /** Load one explicit SCYS comment page; callers cannot request unbounded replies. @param identity - Source-provided entity type and id from search. @returns At most twenty normalized top-level comments or an identity error. */
  async loadComments(identity: ScysTopicIdentity): Promise<ScysCommentLoadResult> {
    if (!validTopicIdentity(identity)) return { status: 'SCYS_TOPIC_IDENTITY_MISSING' }
    return this.withConnection(async connection => {
      const tool = chooseTool(connection.tools, ['pageTopicComment'])
      const args = tool === undefined ? undefined : topicIdentityArguments(tool, identity, MAX_COMMENTS)
      if (tool === undefined || args === undefined) return { status: 'SCYS_COMMENT_ERROR' }
      const result = await callAllowedScysTool(connection.client, tool.name, args)
      if (result === undefined) return { status: 'SCYS_COMMENT_ERROR' }
      const comments = findScysRows(result).slice(0, MAX_COMMENTS).map(mapScysComment)
      return comments.length === 0 ? { status: 'empty' } : { status: 'ready', comments, hasMore: hasMore(result) }
    }, failure => ({ status: failure === 'SCYS_NOT_CONNECTED' || failure === 'SCYS_AUTH_EXPIRED' ? failure : 'SCYS_COMMENT_ERROR' }))
  }

  /** Close an in-memory MCP connection when the Host plugin is disposed. @returns Nothing. */
  async dispose(): Promise<void> {
    this.disposed = true
    this.feedCache.clear()
    const connection = this.connection
    this.connection = undefined
    clearGrantSnapshot(connection?.grantSnapshot)
    await connection?.client.close().catch(() => undefined)
  }

  private async withConnection<T, F extends { readonly status: string }>(
    action: (connection: ActiveConnection) => Promise<T>,
    mapFailure: (failure: SourceFailure) => F,
  ): Promise<T | F> {
    try {
      const connection = await this.ensureConnection()
      return await action(connection)
    } catch (error) {
      if (error instanceof UnauthorizedError || isHttpAuthorizationFailure(error)) {
        this.status = 'expired'
        await this.closeConnection()
        return mapFailure('SCYS_AUTH_EXPIRED')
      }
      if (error instanceof Error && error.message === 'SCYS_NOT_CONNECTED') return mapFailure('SCYS_NOT_CONNECTED')
      this.status = 'error'
      await this.closeConnection()
      return mapFailure('SCYS_MCP_UNAVAILABLE')
    }
  }

  private async ensureConnection(): Promise<ActiveConnection> {
    if (this.connection !== undefined) return this.connection
    const grantSnapshot = await this.readGrantSnapshot()
    if (grantSnapshot.grant?.tokens === undefined) {
      this.status = 'disconnected'
      throw new Error('SCYS_NOT_CONNECTED')
    }
    return this.connectWithSavedGrant(grantSnapshot)
  }

  private async reconnectWithSavedGrant(): Promise<ScysSourceStatusResult> {
    const trace: ReconnectTrace = { stage: 'credential_read', httpObservations: [], tokensCallbackCallCount: 0, tokenCallbackObservations: [] }
    try {
      const grantSnapshot = await this.readGrantSnapshot((stage) => { trace.stage = stage })
      if (grantSnapshot.grant === undefined) {
        trace.stage = 'credential_read'
        this.status = 'disconnected'
        return { status: this.status, diagnostic: diagnosticResult(new Error('SCYS_CREDENTIAL_NOT_FOUND'), trace, trace.stage, 'SCYS_CREDENTIAL_NOT_FOUND', null, 'No saved SCYS authorization record exists.') }
      }
      if (grantSnapshot.grant.tokens === undefined) {
        this.status = 'disconnected'
        return { status: this.status, diagnostic: diagnosticResult(new Error('SCYS_CREDENTIAL_INCOMPLETE'), trace, 'credential_parse', 'SCYS_CREDENTIAL_INCOMPLETE', null, 'The saved SCYS authorization record has no tokens.') }
      }
      await this.connectWithSavedGrant(grantSnapshot, trace)
      this.status = 'connected'
      return { status: this.status }
    } catch (error) {
      const diagnostic = classifyScysReconnectError(error, trace)
      this.status = error instanceof UnauthorizedError || diagnostic.errorCode === 'SCYS_REAUTH_REQUIRED'
        || diagnostic.errorCode === 'SCYS_OAUTH_REDIRECT_MISSING' || diagnostic.errorCode === 'SCYS_OAUTH_REDIRECT_INVALID'
        || diagnostic.httpStatus === 401 || diagnostic.httpStatus === 403 ? 'expired' : 'error'
      return { status: this.status, diagnostic }
    }
  }

  private async connectWithSavedGrant(grantSnapshot: OAuthGrantSnapshot, trace?: ReconnectTrace): Promise<ActiveConnection> {
    if (trace !== undefined) trace.stage = 'oauth_redirect_check'
    const registeredUris = grantSnapshot.grant?.clientInformation
    if (registeredUris === undefined || !('redirect_uris' in registeredUris) || registeredUris.redirect_uris.length === 0) {
      throw new Error('SCYS_RECONNECT_REDIRECT_URI_MISSING')
    }
    const redirectUrl = registeredScysRedirectUrl(grantSnapshot.grant?.clientInformation)
    if (redirectUrl === undefined) throw new Error('SCYS_RECONNECT_REDIRECT_URI_INVALID')
    if (trace !== undefined) trace.stage = 'oauth_provider_create'
    const provider = await this.createProvider(redirectUrl, undefined, {
      grantSnapshot,
      allowAuthorizationFallback: false,
      allowCredentialInvalidation: false,
      ...(trace === undefined ? {} : { onStage: (stage: ScysReconnectDiagnostic['stage']) => { trace.stage = stage } }),
      ...(trace === undefined ? {} : { onFailurePoint: (failurePoint: ScysOAuthCheckFailurePoint | undefined) => {
        if (failurePoint === undefined) delete trace.failurePoint
        else trace.failurePoint = failurePoint
      } }),
      ...(trace === undefined ? {} : { onTokensCallbackCall: () => { trace.tokensCallbackCallCount += 1 } }),
      ...(trace === undefined ? {} : { onTokensCallbackObservation: observation => recordTokenCallbackObservation(trace, observation) }),
    })
    let initializationCompleted = false
    if (trace !== undefined) trace.stage = 'mcp_transport_create'
    const trackedFetch = trace === undefined ? undefined : createScysObservedFetch(fetch, trace, () => initializationCompleted)
    const transport = new StreamableHTTPClientTransport(new URL(SCYS_MCP_URL), { authProvider: provider, ...(trackedFetch === undefined ? {} : { fetch: trackedFetch }) })
    if (trace !== undefined) trace.stage = 'mcp_client_create'
    const client = new Client({ name: 'deepseek-harness-workbench-scys', version: '0.1.0' }) as unknown as McpClientLike
    try {
      if (trace !== undefined) trace.stage = 'mcp_initialize'
      await client.connect(transport)
      initializationCompleted = true
      if (trace !== undefined) trace.stage = 'mcp_list_tools'
      const tools = (await client.listTools()).tools
      const connection = { client, transport, tools, grantSnapshot }
      this.connection = connection
      this.status = 'connected'
      if (trace !== undefined) trace.stage = 'adapter_ready'
      return connection
    } catch (error) {
      clearGrantSnapshot(grantSnapshot)
      await client.close().catch(() => undefined)
      throw error
    }
  }

  private async runOAuthFlow(): Promise<void> {
    const grantSnapshot = await this.readGrantSnapshot()
    const server = createServer()
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address() as AddressInfo
    const redirectUrl = `http://127.0.0.1:${address.port}/scys/oauth/callback`
    let expectedState = ''
    let resolveCode: (code: string) => void = () => undefined
    let rejectCode: (error: Error) => void = () => undefined
    const codeResult = new Promise<string>((resolve, reject) => { resolveCode = resolve; rejectCode = reject })
    void codeResult.catch(() => undefined)
    const callbackTimeout = setTimeout(() => rejectCode(new Error('SCYS_OAUTH_TIMEOUT')), OAUTH_TIMEOUT_MS)
    server.on('request', (request, response) => {
      const remote = request.socket.remoteAddress ?? ''
      if (remote !== '127.0.0.1' && remote !== '::ffff:127.0.0.1' && remote !== '::1') {
        response.writeHead(403).end()
        return
      }
      const callback = new URL(request.url ?? '/', redirectUrl)
      if (callback.pathname !== '/scys/oauth/callback') {
        response.writeHead(404).end()
        return
      }
      const providerError = callback.searchParams.get('error')
      if (providerError !== null) {
        response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' }).end('Authorization was not completed. Return to Workbench.')
        rejectCode(new Error('SCYS_OAUTH_DENIED'))
      } else if (readOAuthCallbackCode(callback, expectedState) === undefined) {
        response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' }).end('Authorization response was invalid. Return to Workbench.')
        rejectCode(new Error('SCYS_OAUTH_STATE_INVALID'))
      } else {
        response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }).end('Authorization complete. Return to Workbench.')
        resolveCode(readOAuthCallbackCode(callback, expectedState)!)
      }
    })
    let oauthClient: McpClientLike | undefined
    try {
      const provider = await this.createProvider(redirectUrl, state => { expectedState = state }, { grantSnapshot })
      const transport = new StreamableHTTPClientTransport(new URL(SCYS_MCP_URL), { authProvider: provider })
      const client = new Client({ name: 'deepseek-harness-workbench-scys', version: '0.1.0' }) as unknown as McpClientLike
      oauthClient = client
      let connectedWithoutAuthorization = false
      try {
        await client.connect(transport)
        connectedWithoutAuthorization = true
      } catch (error) {
        if (!(error instanceof UnauthorizedError)) throw error
      }
      if (connectedWithoutAuthorization) {
        const tools = (await client.listTools()).tools
        this.connection = { client, transport, tools, grantSnapshot }
        this.status = 'connected'
        return
      }
      const code = await codeResult
      await transport.finishAuth(code)
      await client.connect(transport)
      const tools = (await client.listTools()).tools
      this.connection = { client, transport, tools, grantSnapshot }
      this.status = 'connected'
    } finally {
      if (this.connection?.grantSnapshot !== grantSnapshot) {
        clearGrantSnapshot(grantSnapshot)
        await oauthClient?.close().catch(() => undefined)
      }
      clearTimeout(callbackTimeout)
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  }

  private async createProvider(redirectUrl: string | undefined, stateChanged: ((state: string) => void) | undefined, options: ProviderOptions): Promise<OAuthClientProvider> {
    let verifier = ''
    let stateValue = ''
    const owner = this
    const metadata: OAuthClientMetadata = {
      redirect_uris: redirectUrl === undefined ? [] : [redirectUrl],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      client_name: 'DeepSeek Harness Workbench',
    }
    return {
      get redirectUrl() { return redirectUrl },
      clientMetadata: metadata,
      state: () => {
        options.onStage?.('oauth_authorization_fallback')
        stateValue = randomUUID()
        stateChanged?.(stateValue)
        return stateValue
      },
      clientInformation: () => {
        options.onStage?.('oauth_token_check')
        options.onFailurePoint?.('client_information_read')
        options.onFailurePoint?.(undefined)
        return options.grantSnapshot.grant?.clientInformation
      },
      saveClientInformation: async info => owner.updateGrant(options.grantSnapshot, { clientInformation: info }),
      tokens: () => {
        options.onStage?.('oauth_token_check')
        options.onFailurePoint?.('token_record_read')
        options.onTokensCallbackCall?.()
        return (async () => {
          const recordStage: TokenCallbackObservationRecorder = (stage, result, error) => {
            options.onTokensCallbackObservation?.(tokenCallbackObservation(stage, result, error))
          }
          try {
            options.onFailurePoint?.('token_mapping')
            let tokens: OAuthTokens | undefined
            try {
              tokens = options.grantSnapshot.grant?.tokens
              recordStage('token_mapping', 'pass')
            } catch (error) {
              recordStage('token_mapping', 'fail', error)
              throw error
            }
            options.onFailurePoint?.(undefined)
            recordStage('callback_return', 'pass')
            return tokens
          } catch (error) {
            recordStage('callback_return', 'fail', error)
            throw error
          }
        })()
      },
      saveTokens: async tokens => {
        options.onStage?.('oauth_token_refresh')
        await owner.updateGrant(options.grantSnapshot, { tokens })
      },
      redirectToAuthorization: async url => {
        if (options.allowAuthorizationFallback === false) {
          options.onStage?.('oauth_authorization_fallback')
          throw new Error('SCYS_RECONNECT_AUTHORIZATION_DISABLED')
        }
        await openSystemBrowser(url.toString())
      },
      saveCodeVerifier: value => { verifier = value },
      codeVerifier: () => verifier,
      invalidateCredentials: async scope => {
        if (options.allowCredentialInvalidation === false) {
          clearGrantSnapshotScopes(options.grantSnapshot, scope)
          options.onStage?.('oauth_authorization_fallback')
          throw new Error('SCYS_RECONNECT_CREDENTIAL_INVALIDATION_DISABLED')
        }
        if (scope === 'all' || scope === 'tokens') await owner.updateGrant(options.grantSnapshot, { clearTokens: true })
        if (scope === 'all' || scope === 'client') await owner.updateGrant(options.grantSnapshot, { clearClientInformation: true })
      },
    }
  }

  private async readGrant(recordStage?: CredentialReadRecorder): Promise<StoredOAuthGrant | undefined> {
    let record: CredentialRecord | undefined
    try {
      record = await this.credentials.readRecord(SCYS_CREDENTIAL_KEY)
      recordStage?.('credential_read', 'pass')
    } catch (error) {
      recordStage?.('credential_read', 'fail', error)
      throw error
    }
    try {
      if (record === undefined) {
        recordStage?.('credential_parse', 'pass')
        return undefined
      }
      if (record.kind !== 'grant' || !isRecord(record.payload) || record.payload.version !== 1) {
        throw new Error('SCYS_CREDENTIAL_RECORD_INVALID')
      }
      const grant = parseStoredOAuthGrant(record.payload)
      recordStage?.('credential_parse', 'pass')
      return grant
    } catch (error) {
      recordStage?.('credential_parse', 'fail', error)
      throw error
    }
  }

  private async readGrantSnapshot(recordStage?: CredentialReadRecorder): Promise<OAuthGrantSnapshot> {
    return { grant: await this.readGrant(recordStage) }
  }

  private async closeConnection(): Promise<void> {
    const connection = this.connection
    this.connection = undefined
    clearGrantSnapshot(connection?.grantSnapshot)
    await connection?.client.close().catch(() => undefined)
  }

  private async updateGrant(snapshot: OAuthGrantSnapshot, patch: Partial<StoredOAuthGrant> & { readonly clearTokens?: boolean; readonly clearClientInformation?: boolean }): Promise<void> {
    const committed = await this.credentials.modifyRecord(SCYS_CREDENTIAL_KEY, async current => {
      const existing = current === undefined
        ? { version: 1 as const }
        : current.kind === 'grant' && isRecord(current.payload) && current.payload.version === 1
          ? parseStoredOAuthGrant(current.payload)
          : (() => { throw new Error('SCYS_CREDENTIAL_RECORD_INVALID') })()
      const next: StoredOAuthGrant = {
        version: 1,
        ...(patch.clearTokens === true ? {} : patch.tokens === undefined ? existing.tokens === undefined ? {} : { tokens: existing.tokens } : { tokens: parseOAuthTokens(patch.tokens) }),
        ...(patch.clearClientInformation === true ? {} : patch.clientInformation === undefined ? existing.clientInformation === undefined ? {} : { clientInformation: existing.clientInformation } : { clientInformation: parseClientInformation(patch.clientInformation) }),
      }
      return { kind: 'grant', payload: next } satisfies GrantRecord as CredentialRecord
    })
    if (committed === undefined) throw new Error('SCYS_CREDENTIAL_WRITE_FAILED')
    const committedGrant = readGrantFromRecord(committed)
    snapshot.grant = committedGrant
  }

}

/** Observe SCYS reconnect fetch attempts without retaining URLs, headers, bodies, or exception text. @param fetchFn - Fetch implementation used by the transport. @param trace - One reconnect's in-memory observation record. @param initializationCompleted - Whether MCP initialization has returned. @returns A fetch wrapper that records bounded safe request outcomes. */
export function createScysObservedFetch(
  fetchFn: typeof fetch,
  trace: ReconnectTrace,
  initializationCompleted: () => boolean,
): typeof fetch {
  return async (input, init) => {
    const phase = reconnectRequestPhase(input, init, initializationCompleted())
    const observation: MutableScysHttpObservation = {
      phase,
      requestAttempted: true,
      httpStatus: null,
      errorType: null,
      errorCode: null,
    }
    if (trace.httpObservations.length < 12) trace.httpObservations.push(observation)
    const stage = stageForRequestPhase(phase)
    if (stage !== undefined) trace.stage = stage
    try {
      const response = await fetchFn(input, init)
      observation.httpStatus = response.status
      return response
    } catch (error) {
      observation.errorType = safeErrorType(error)
      observation.errorCode = safeErrorCode(error)
      throw error
    }
  }
}


/** Accept only a non-empty authorization code bound to the expected OAuth state. @param callback - Local callback URL. @param expectedState - In-memory state generated for this flow. @returns Code for the token exchange, or undefined when invalid. */
export function readOAuthCallbackCode(callback: URL, expectedState: string): string | undefined {
  const state = callback.searchParams.get('state')
  const code = callback.searchParams.get('code')
  return expectedState.length === 0 || callback.searchParams.has('error') || state === null || state !== expectedState || code === null || code.length === 0 ? undefined : code
}

/** Fixed Host facade constructor tied to Harness credentials; no MCP tools are registered globally. */
export function createScysRadarAdapter(ctx: Context): ScysRadarAdapter {
  return new ScysRadarAdapter(ctx.credentials)
}

/** Call one explicitly allowlisted upstream read tool; unknown names reject before transport use. @param client - Connected MCP client. @param name - Fixed tool name selected by the adapter. @param args - Host-built arguments matching the listed input fields. @returns Structured response fields, or undefined for an MCP error or invalid JSON text. @throws Error when the tool is outside the allowlist. */
export async function callAllowedScysTool(client: McpClientLike, name: string, args: Record<string, unknown>, timeoutMs?: number): Promise<Record<string, unknown> | undefined> {
  if (!isAllowedTool(name)) throw new Error('SCYS_TOOL_NOT_ALLOWED')
  const request = { name, arguments: args }
  const result = timeoutMs === undefined
    ? await client.callTool(request)
    : await client.callTool(request, undefined, { timeout: timeoutMs })
  if (result.isError === true) return undefined
  const structured = result.structuredContent
  if (isRecord(structured)) return structured
  const text = Array.isArray(result.content)
    ? result.content.filter(isRecord).filter(item => item.type === 'text').map(item => item.text).filter((item): item is string => typeof item === 'string').join('\n')
    : ''
  if (text.length === 0) return undefined
  try {
    const parsed: unknown = JSON.parse(text)
    return isRecord(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function chooseTool(tools: readonly ListedTool[], candidates: readonly string[]): ListedTool | undefined {
  return candidates.map(name => tools.find(tool => tool.name === name)).find((tool): tool is ListedTool => tool !== undefined && isAllowedTool(tool.name))
}

function isAllowedTool(name: string): boolean {
  return (SCYS_READONLY_TOOLS as readonly string[]).includes(name)
}

function searchArguments(tool: ListedTool, keyword: string): Record<string, unknown> | undefined {
  const properties = tool.inputSchema.properties ?? {}
  const field = ['keyword', 'query', 'searchQuery', 'searchTerm', 'searchText'].find(name => name in properties)
  if (field === undefined) return undefined
  const args: Record<string, unknown> = { [field]: keyword }
  if ('page' in properties) args.page = 1
  if ('pageNum' in properties) args.pageNum = 1
  if ('pageSize' in properties) args.pageSize = MAX_ITEMS
  if (tool.inputSchema.required?.some(name => !(name in args))) return undefined
  return args
}

function feedQueryArguments(tool: ListedTool, mode: ScysFeedMode, start: number, end: number, pageIndex: number): Record<string, unknown> | undefined {
  const properties = tool.inputSchema.properties ?? {}
  if (!hasNumberSchema(properties, 'gmtCreateStart') || !hasNumberSchema(properties, 'gmtCreateEnd')
    || !hasNumberSchema(properties, 'pageIndex') || !hasNumberSchema(properties, 'pageSize')) return undefined
  const args: Record<string, unknown> = {
    gmtCreateStart: start,
    gmtCreateEnd: end,
    pageIndex,
    pageSize: SCYS_FEED_PAGE_SIZE,
  }
  if (mode === 'hot') {
    if (!hasBooleanSchema(properties, 'isHot')) return undefined
    args.isHot = true
  } else if (mode === 'digested') {
    if (!hasBooleanSchema(properties, 'isDigested')) return undefined
    args.isDigested = true
  }
  return tool.inputSchema.required?.some(name => !(name in args)) ? undefined : args
}

function hasNumberSchema(properties: Record<string, unknown>, name: string): boolean {
  const schema = properties[name]
  return isRecord(schema) && (schemaTypeIncludes(schema.type, 'number') || schemaTypeIncludes(schema.type, 'integer'))
}

function hasBooleanSchema(properties: Record<string, unknown>, name: string): boolean {
  const schema = properties[name]
  return isRecord(schema) && schemaTypeIncludes(schema.type, 'boolean')
}

function schemaTypeIncludes(value: unknown, expected: string): boolean {
  return value === expected || (Array.isArray(value) && value.includes(expected))
}

function deduplicateScysTopics(items: readonly ScysContentSummary[], start: number, end: number): ScysContentSummary[] {
  const unique = new Map<string, ScysContentSummary>()
  for (const item of items) {
    if (!validTopicIdentity(item)) continue
    const timestamp = publishedTime(item.publishedAt)
    if (timestamp < start * 1_000 || timestamp > end * 1_000) continue
    const key = `${item.entityType}:${item.entityId}`
    if (!unique.has(key)) unique.set(key, item)
  }
  return [...unique.values()].sort((left, right) => publishedTime(right.publishedAt) - publishedTime(left.publishedAt))
}

function publishedTime(value: string | null): number {
  if (value === null) return Number.NEGATIVE_INFINITY
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY
}

function projectFeedItem(item: ScysContentSummary): ScysContentSummary {
  return {
    ...item,
    title: boundedText(item.title, 500),
    summary: boundedText(item.summary, 1_200),
    content: null,
    author: boundedText(item.author, 200),
    url: item.url !== null && item.url.length <= 2_000 ? item.url : null,
  }
}

function boundedText(value: string | null, limit: number): string | null {
  return value === null ? null : value.slice(0, limit)
}

function markerEvidence(mode: ScysFeedMode, items: readonly ScysContentSummary[]): ScysFeedQueryInfo['itemMarkerEvidence'] {
  if (mode === 'recent') return 'not_applicable'
  if (items.length === 0) return 'missing'
  const marker = mode === 'hot' ? 'isHot' : 'isDigested'
  const values = items.map(item => item[marker])
  if (values.some(value => value === false)) return 'conflict'
  if (values.every(value => value === true)) return 'confirmed'
  return 'missing'
}

function idArguments(tool: ListedTool, id: string, limit?: number): Record<string, unknown> | undefined {
  const properties = tool.inputSchema.properties ?? {}
  const field = ['topicId', 'projectId', 'id', 'topic_id', 'project_id', 'entityId'].find(name => name in properties)
  if (field === undefined) return undefined
  const args: Record<string, unknown> = { [field]: id }
  if (limit !== undefined) {
    if ('pageSize' in properties) args.pageSize = limit
    if ('size' in properties) args.size = limit
    if ('limit' in properties) args.limit = limit
    if ('page' in properties) args.page = 1
    if ('pageNum' in properties) args.pageNum = 1
  }
  return tool.inputSchema.required?.some(name => !(name in args)) ? undefined : args
}

function validTopicIdentity(value: ScysTopicIdentity): value is { readonly entityType: 'xq_topic' | 'forum_topic'; readonly entityId: string } {
  if (typeof value !== 'object' || value === null) return false
  return (value.entityType === 'xq_topic' || value.entityType === 'forum_topic')
    && typeof value.entityId === 'string' && /^\d{1,200}$/u.test(value.entityId)
}

function topicIdentityArguments(tool: ListedTool, identity: ScysTopicIdentity, limit?: number): Record<string, unknown> | undefined {
  const properties = tool.inputSchema.properties ?? {}
  if (!('entityType' in properties) || !('entityId' in properties)) return undefined
  const args: Record<string, unknown> = { entityType: identity.entityType, entityId: identity.entityId }
  if (limit !== undefined && 'commentPageSize' in properties) args.commentPageSize = limit
  return tool.inputSchema.required?.some(name => !(name in args)) ? undefined : args
}

/** Find a bounded source list in common SCYS response envelopes. @param root - Parsed upstream result. @returns Record rows only. */
export function findScysRows(root: Record<string, unknown>): readonly Record<string, unknown>[] {
  const queue: { value: unknown; depth: number }[] = [{ value: root, depth: 0 }]
  let emptyRows: readonly Record<string, unknown>[] | undefined
  while (queue.length > 0) {
    const current = queue.shift()
    if (current === undefined || current.depth > 5) continue
    if (Array.isArray(current.value)) {
      const rows = current.value.filter(isRecord)
      if (rows.length > 0) return rows
      if (current.value.length === 0) emptyRows ??= rows
      continue
    }
    if (!isRecord(current.value)) continue
    for (const key of ['list', 'items', 'topics', 'records', 'results', 'projectCases', 'topicDetailDTO', 'data']) {
      if (key in current.value) queue.push({ value: current.value[key], depth: current.depth + 1 })
    }
  }
  return emptyRows ?? []
}

function findDetail(root: Record<string, unknown>): Record<string, unknown> | undefined {
  const rows = findScysRows(root)
  if (rows.length > 0) return rows[0]
  let current: unknown = root
  for (let depth = 0; depth < 5; depth++) {
    if (!isRecord(current)) return undefined
    const record = current
    if (isRecord(record.topicDTO)) return record
    const nested = ['topicDTO', 'topic', 'detail', 'data', 'project', 'projectCase'].map(key => record[key]).find(isRecord)
    if (nested === undefined) return current
    current = nested
  }
  return isRecord(current) ? current : undefined
}

/** Map known SCYS topic fields and discard all unrecognized source data. @param row - One source content record. @returns Normalized content with absent values kept null. */
export function mapScysContent(row: Record<string, unknown>): ScysContentSummary {
  const topic = recordAt(row, 'topicDTO') ?? row
  const author = recordAt(row, 'topicUserDTO') ?? recordAt(topic, 'topicUserDTO')
  return {
    source: 'scys',
    id: firstString(row, ['topicId', 'id', 'topic_id']) ?? firstString(topic, ['id', 'topicId', 'entityId']),
    entityType: firstString(topic, ['entityType']),
    entityId: firstString(topic, ['entityId']),
    contentType: firstString(row, ['type', 'entityType']) ?? firstString(topic, ['type', 'entityType']),
    title: firstString(topic, ['showTitle', 'title']) ?? firstString(row, ['showTitle', 'title']),
    summary: firstString(row, ['summary', 'excerpt', 'description']) ?? firstString(topic, ['summary', 'excerpt', 'description']),
    content: firstString(row, ['articleContentContainFeishuDoc', 'articleContent', 'content']) ?? firstString(topic, ['articleContentContainFeishuDoc', 'articleContent', 'content']),
    author: author === undefined ? firstString(row, ['author', 'nickname', 'userName']) : firstString(author, ['nickname', 'userName', 'name', 'showName']),
    publishedAt: scysPublishedAt(row) ?? scysPublishedAt(topic),
    url: safeHttpUrl(firstString(row, ['detailUrl', 'url']) ?? firstString(topic, ['detailUrl', 'url'])),
    isHot: firstBoolean(topic, ['isHot']) ?? firstBoolean(row, ['isHot']) ?? null,
    isDigested: firstBoolean(topic, ['isDigested']) ?? firstBoolean(row, ['isDigested']) ?? null,
    engagement: mapEngagement(row),
  }
}

function scysPublishedAt(row: Record<string, unknown>): string | null {
  const date = firstString(row, ['gmtCreate', 'publishedAt', 'createTime'])
  if (date !== null) return date
  const seconds = row.gmtCreate
  if (typeof seconds !== 'number' || !Number.isSafeInteger(seconds) || seconds <= 0 || seconds > 8_640_000_000_000) return null
  return new Date(seconds * 1_000).toISOString()
}

/** Map known SCYS project fields and discard all unrecognized source data. @param row - One source project record. @returns Normalized project with absent values kept null. */
export function mapScysProject(row: Record<string, unknown>): ScysProjectSummary {
  return {
    source: 'scys',
    id: firstString(row, ['projectId', 'id', 'project_id']),
    title: firstString(row, ['title', 'name', 'projectName']),
    summary: firstString(row, ['summary', 'excerpt']),
    description: firstString(row, ['description', 'content', 'detail']),
    publishedAt: firstString(row, ['gmtCreate', 'publishedAt', 'createTime']),
    url: safeHttpUrl(firstString(row, ['detailUrl', 'url'])),
    engagement: mapEngagement(row),
  }
}

/** Map known SCYS comment fields and discard all unrecognized source data. @param row - One source comment record. @returns Normalized comment with absent values kept null. */
export function mapScysComment(row: Record<string, unknown>): ScysComment {
  const user = recordAt(row, 'topicUserDTO') ?? recordAt(row, 'userInfo') ?? recordAt(row, 'user')
  return {
    source: 'scys',
    id: firstString(row, ['commentId', 'id']),
    text: firstString(row, ['content', 'text', 'commentContent']),
    author: user === undefined ? firstString(row, ['author', 'nickname', 'userName']) : firstString(user, ['nickname', 'userName', 'name', 'showName']),
    publishedAt: firstString(row, ['gmtCreate', 'createTime', 'publishedAt']),
    likeCount: firstNumber(row, ['likeCount', 'likeNum', 'likes']),
  }
}

function mapEngagement(row: Record<string, unknown>): ScysContentSummary['engagement'] {
  const detail = recordAt(row, 'topicDTO') ?? row
  return {
    likeCount: firstNumber(row, ['likeCount', 'likeNum', 'likeNumCount']) ?? firstNumber(detail, ['likeCount', 'likeNum', 'likeNumCount']),
    favoriteCount: firstNumber(row, ['favoriteCount', 'favoriteNum', 'collectCount']) ?? firstNumber(detail, ['favoriteCount', 'favoriteNum', 'collectCount']),
    coinCount: firstNumber(row, ['coinCount', 'coinNum', 'addCoinCount']) ?? firstNumber(detail, ['coinCount', 'coinNum', 'addCoinCount']),
    commentCount: firstNumber(row, ['commentCount', 'commentNum']) ?? firstNumber(detail, ['commentCount', 'commentNum']),
  }
}

function hasMore(root: Record<string, unknown>): boolean {
  const page = recordAt(root, 'pageInfo') ?? recordAt(root, 'data') ?? root
  return firstBoolean(page, ['hasMore', 'hasNext']) ?? false
}

function recordAt(source: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = source[key]
  return isRecord(value) ? value : undefined
}

function firstString(source: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) if (typeof source[key] === 'string' && source[key].length > 0) return source[key] as string
  return null
}

function firstBoolean(source: Record<string, unknown>, keys: readonly string[]): boolean | undefined {
  for (const key of keys) if (typeof source[key] === 'boolean') return source[key]
  return undefined
}

function firstNumber(source: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const key of keys) if (typeof source[key] === 'number' && Number.isFinite(source[key])) return source[key] as number
  return null
}

function safeHttpUrl(value: string | null): string | null {
  if (value === null) return null
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isHttpAuthorizationFailure(error: unknown): boolean {
  if (!isRecord(error) || error.name !== 'StreamableHTTPError' || typeof error.code !== 'number') return false
  return error.code === 401 || error.code === 403
}

function parseStoredOAuthGrant(value: Record<string, unknown>): StoredOAuthGrant {
  const tokens = value.tokens === undefined ? undefined : parseOAuthTokens(value.tokens)
  const clientInformation = value.clientInformation === undefined ? undefined : parseClientInformation(value.clientInformation)
  return {
    version: 1,
    ...(tokens === undefined ? {} : { tokens }),
    ...(clientInformation === undefined ? {} : { clientInformation }),
  }
}

function parseOAuthTokens(value: unknown): OAuthTokens {
  const result = OAuthTokensSchema.safeParse(value)
  if (!result.success) throw new Error('SCYS_CREDENTIAL_RECORD_INVALID')
  return result.data
}

function parseClientInformation(value: unknown): OAuthClientInformationMixed {
  if (!isRecord(value)) throw new Error('SCYS_CREDENTIAL_RECORD_INVALID')
  if ('redirect_uris' in value) {
    const full = OAuthClientInformationFullSchema.safeParse(value)
    if (!full.success) throw new Error('SCYS_CREDENTIAL_RECORD_INVALID')
    return full.data
  }
  const minimal = OAuthClientInformationSchema.safeParse(value)
  if (!minimal.success) throw new Error('SCYS_CREDENTIAL_RECORD_INVALID')
  return minimal.data
}

function registeredScysRedirectUrl(info: OAuthClientInformationMixed | undefined): string | undefined {
  if (info === undefined || !('redirect_uris' in info) || info.redirect_uris.length !== 1) return undefined
  const value = info.redirect_uris[0]
  if (value === undefined) return undefined
  let uri: URL
  try {
    uri = new URL(value)
  } catch {
    // The caller classifies malformed registered callbacks without returning their contents.
    return undefined
  }
  return uri.protocol === 'http:' && uri.hostname === '127.0.0.1' && uri.port !== ''
    && uri.pathname === '/scys/oauth/callback' && uri.username === '' && uri.password === ''
    && uri.search === '' && uri.hash === '' ? value : undefined
}

function readGrantFromRecord(record: CredentialRecord): StoredOAuthGrant {
  if (record.kind !== 'grant' || !isRecord(record.payload) || record.payload.version !== 1) {
    throw new Error('SCYS_CREDENTIAL_WRITE_FAILED')
  }
  return parseStoredOAuthGrant(record.payload)
}

function clearGrantSnapshot(snapshot: OAuthGrantSnapshot | undefined): void {
  if (snapshot !== undefined) snapshot.grant = undefined
}

function clearGrantSnapshotScopes(snapshot: OAuthGrantSnapshot, scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery'): void {
  const grant = snapshot.grant
  if (grant === undefined) return
  if (scope === 'all') {
    snapshot.grant = undefined
    return
  }
  if (scope !== 'client' && scope !== 'tokens') return
  snapshot.grant = {
    version: 1,
    ...(scope === 'tokens' ? {} : grant.tokens === undefined ? {} : { tokens: grant.tokens }),
    ...(scope === 'client' ? {} : grant.clientInformation === undefined ? {} : { clientInformation: grant.clientInformation }),
  }
}

function openSystemBrowser(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/open', [url], { stdio: 'ignore', detached: true })
    child.once('error', reject)
    child.once('spawn', () => { child.unref(); resolve() })
  })
}

/** Classify one reconnect failure without returning exception messages, URLs, or credential data. @param error - Caught SDK or Keychain error. @param trace - Observed request phases and current reconnect stage. @returns Safe diagnostic fields for the Workbench status view. */
export function classifyScysReconnectError(error: unknown, trace: ReconnectTrace): ScysReconnectDiagnostic {
  const record = isRecord(error) ? error : {}
  const cause = isRecord(record.cause) ? record.cause : {}
  const rawCode = typeof record.code === 'string' ? record.code : typeof cause.code === 'string' ? cause.code : undefined
  const lastFailedResponse = [...trace.httpObservations].reverse().find(item => item.httpStatus !== null && item.httpStatus >= 400)
  const httpStatus = record.name === 'StreamableHTTPError' && typeof record.code === 'number'
    ? record.code
    : lastFailedResponse?.httpStatus ?? null
  if (trace.stage === 'credential_read') {
    const helper = isRecord(record.diagnostic) ? record.diagnostic : undefined
    if (record.message === 'WORKBENCH_SCYS_KEYCHAIN_UNAVAILABLE') {
      return diagnosticResult(error, trace, trace.stage, 'SCYS_CREDENTIAL_ROUTER_UNAVAILABLE', null, 'The SCYS credential route has no Keychain backend.')
    }
    if (record.message === 'KEYCHAIN_READ_FAILED' && helper?.operation === 'read' && helper.message === 'CREDENTIAL_RECORD_PARSE_FAILED') {
      return diagnosticResult(error, trace, trace.stage, 'SCYS_CREDENTIAL_RECORD_PARSE_FAILED', null, 'The Keychain record could not be decoded.')
    }
    if (keychainNativeReadFailed(error)) {
      return diagnosticResult(error, trace, trace.stage, 'SCYS_KEYCHAIN_NATIVE_READ_FAILED', null, 'The macOS Keychain read failed.')
    }
    return diagnosticResult(error, trace, trace.stage, 'SCYS_CREDENTIAL_ROUTER_CALL_FAILED', null, 'The SCYS credential read call failed before a record was returned.')
  }
  if (trace.stage === 'credential_parse') {
    return diagnosticResult(error, trace, trace.stage, record.message === 'SCYS_CREDENTIAL_RECORD_INVALID'
      ? 'SCYS_CREDENTIAL_STRUCTURE_INVALID' : 'SCYS_CREDENTIAL_PARSE_FAILED', null, 'The saved SCYS authorization record could not be validated.')
  }
  if (record.message === 'SCYS_RECONNECT_REDIRECT_URI_MISSING') {
    return diagnosticResult(error, trace, 'oauth_redirect_check', 'SCYS_OAUTH_REDIRECT_MISSING', null, 'The saved client registration has no callback URI.')
  }
  if (record.message === 'SCYS_RECONNECT_REDIRECT_URI_INVALID') {
    return diagnosticResult(error, trace, 'oauth_redirect_check', 'SCYS_OAUTH_REDIRECT_INVALID', null, 'The saved client registration has no usable loopback callback URI.')
  }
  if (trace.stage === 'oauth_redirect_check' || trace.stage === 'oauth_provider_create'
    || trace.stage === 'mcp_transport_create' || trace.stage === 'mcp_client_create') {
    const errorCode = {
      oauth_redirect_check: 'SCYS_OAUTH_REDIRECT_CHECK_FAILED',
      oauth_provider_create: 'SCYS_OAUTH_PROVIDER_CREATE_FAILED',
      mcp_transport_create: 'SCYS_MCP_TRANSPORT_CREATE_FAILED',
      mcp_client_create: 'SCYS_MCP_CLIENT_CREATE_FAILED',
    }[trace.stage]
    return diagnosticResult(error, trace, trace.stage, errorCode, null, 'SCYS connection setup failed before MCP initialization.')
  }
  if (record.message === 'SCYS_RECONNECT_AUTHORIZATION_DISABLED' || record.message === 'SCYS_RECONNECT_CREDENTIAL_INVALIDATION_DISABLED') {
    return diagnosticResult(error, trace, 'oauth_authorization_fallback', 'SCYS_REAUTH_REQUIRED', httpStatus, 'Saved credentials were rejected; automatic authorization and credential deletion were blocked.')
  }
  if (httpStatus !== null && httpStatus >= 400) {
    const stage = trace.stage
    const label = stage === 'oauth_metadata_discovery' ? 'OAuth metadata discovery' : stage === 'oauth_token_refresh' ? 'OAuth token refresh' : stage === 'oauth_token_check' ? 'OAuth credential check' : stage === 'mcp_list_tools' ? 'MCP tool-list request' : 'MCP connection or initialization'
    return diagnosticResult(error, trace, stage, `SCYS_HTTP_${httpStatus}`, httpStatus, `${label} received HTTP ${httpStatus}.`)
  }
  const networkMessages: Record<string, string> = {
    ENOTFOUND: 'DNS lookup failed.', EAI_AGAIN: 'DNS lookup timed out.', ECONNREFUSED: 'The remote connection was refused.',
    ECONNRESET: 'The remote connection was reset.', ETIMEDOUT: 'The network request timed out.',
    UND_ERR_CONNECT_TIMEOUT: 'The network connection timed out.', UND_ERR_HEADERS_TIMEOUT: 'The server response timed out.',
    ERR_TLS_CERT_ALTNAME_INVALID: 'TLS certificate host validation failed.', CERT_HAS_EXPIRED: 'The remote TLS certificate has expired.',
    ABORT_ERR: 'The network request was aborted.',
  }
  if (rawCode !== undefined && networkMessages[rawCode] !== undefined) {
    return diagnosticResult(error, trace, trace.stage, `SCYS_NETWORK_${rawCode}`, null, networkMessages[rawCode]!)
  }
  if (record.name === 'InvalidGrantError') {
    return diagnosticResult(error, trace, trace.stage, 'SCYS_OAUTH_INVALID_GRANT', httpStatus, 'The authorization server rejected the saved refresh grant.')
  }
  if (record.name === 'McpError' && typeof record.code === 'number' && Number.isSafeInteger(record.code)) {
    return diagnosticResult(error, trace, trace.stage, `SCYS_MCP_PROTOCOL_${record.code}`, httpStatus, 'The MCP server returned a protocol error.')
  }
  if (record.name === 'StreamableHTTPError' && typeof record.code === 'number' && record.code >= 400) {
    return diagnosticResult(error, trace, trace.stage, `SCYS_HTTP_${record.code}`, record.code, 'The SCYS endpoint returned an HTTP error.')
  }
  if (error instanceof UnauthorizedError) {
    return diagnosticResult(error, trace, trace.stage, 'SCYS_UNAUTHORIZED', null, 'The SCYS authorization flow did not complete with the saved grant.')
  }
  if (record.message === 'SCYS_RECONNECT_CREDENTIAL_INVALIDATION_DISABLED') {
    return diagnosticResult(error, trace, trace.stage, 'SCYS_REAUTH_REQUIRED', null, 'The server requires authorization; automatic credential deletion was blocked.')
  }
  if (trace.stage === 'oauth_token_check') {
    const failurePoint = trace.failurePoint ?? 'oauth_token_validation'
    const failurePointCode = failurePoint.toUpperCase()
    const causeCode = oauthTokenCheckCauseCodes[rawCode ?? '']
    const causeType = oauthTokenCheckErrorTypes[typeof record.name === 'string' ? record.name : ''] ?? 'UNKNOWN_ERROR'
    return diagnosticResult(
      error,
      trace,
      trace.stage,
      causeCode === undefined
        ? `SCYS_OAUTH_TOKEN_CHECK_${failurePointCode}_${causeType}`
        : `SCYS_OAUTH_TOKEN_CHECK_${failurePointCode}_${causeCode}`,
      httpStatus,
      failurePoint === 'oauth_token_validation'
        ? 'The OAuth SDK rejected or could not process the saved client or token data.'
        : failurePoint === 'token_mapping'
          ? 'The saved OAuth token record could not be mapped for the reconnect.'
          : 'The saved OAuth credential record could not be read for the reconnect.',
    )
  }
  return diagnosticResult(error, trace, trace.stage, 'SCYS_RECONNECT_FAILED', httpStatus, 'The saved-grant MCP reconnect failed at this stage.')
}

function isRetryableSavedGrantFailure(result: ScysSourceStatusResult): boolean {
  const diagnostic = result.diagnostic
  if (result.status !== 'error' || diagnostic === undefined) return false
  if (diagnostic.httpStatus !== null
    && (diagnostic.httpStatus === 408 || diagnostic.httpStatus === 425 || diagnostic.httpStatus === 429
      || (diagnostic.httpStatus >= 500 && diagnostic.httpStatus <= 599))) return true
  if (diagnostic.errorCode.startsWith('SCYS_NETWORK_')) {
    return diagnostic.safeErrorCode !== null && SCYS_RECONNECT_TRANSIENT_NETWORK_CODES.has(diagnostic.safeErrorCode)
  }
  return false
}

function diagnosticResult(
  error: unknown,
  trace: ReconnectTrace,
  stage: ScysReconnectDiagnostic['stage'],
  errorCode: string,
  httpStatus: number | null,
  safeMessage: string,
): ScysReconnectDiagnostic {
  const source = sdkErrorSource(error)
  const keychainOsStatus = safeKeychainReadOsStatus(error)
  const tokenCallbackObservations = (trace.tokenCallbackObservations ?? []).map(item => ({ ...item }))
  if (
    source?.file === 'client/streamableHttp.js'
    && source.line === 61
    && tokenCallbackObservations.some(item => item.stage === 'callback_return' && item.result === 'pass')
  ) {
    tokenCallbackObservations.push(tokenCallbackObservation('sdk_token_usage', 'fail', error))
  }
  return {
    stage,
    errorCode,
    httpStatus,
    safeMessage,
    httpObservations: trace.httpObservations.map(item => ({ ...item })),
    errorType: safeErrorType(error),
    safeErrorCode: safeErrorCode(error),
    ...(keychainOsStatus === undefined ? {} : { keychainOsStatus }),
    sdkErrorSourceFile: source?.file ?? null,
    sdkErrorSourceLine: source?.line ?? null,
    ...((trace.tokensCallbackCallCount ?? 0) === 0 ? {} : {
      tokensCallbackCallCount: trace.tokensCallbackCallCount,
      tokenCallbackObservations,
    }),
  }
}

function keychainNativeReadFailed(error: unknown): boolean {
  if (!isRecord(error) || error.message !== 'KEYCHAIN_READ_FAILED' || !isRecord(error.diagnostic)) return false
  const diagnostic = error.diagnostic
  return diagnostic.operation === 'read' && diagnostic.helperReached === true
    && typeof diagnostic.osStatus === 'number' && Number.isInteger(diagnostic.osStatus) && diagnostic.osStatus !== 0
}

function safeKeychainReadOsStatus(error: unknown): number | undefined {
  if (!keychainNativeReadFailed(error) || !isRecord(error) || !isRecord(error.diagnostic)) return undefined
  const osStatus = error.diagnostic.osStatus
  return typeof osStatus === 'number' && ALLOWED_KEYCHAIN_READ_OSSTATUS.has(osStatus) ? osStatus : undefined
}

function safeErrorType(error: unknown): string {
  const name = isRecord(error) && typeof error.name === 'string' ? error.name : 'UnknownError'
  return [
    'Error', 'TypeError', 'SyntaxError', 'RangeError', 'ReferenceError', 'URIError', 'AbortError',
    'McpError', 'StreamableHTTPError', 'UnauthorizedError', 'InvalidGrantError', 'OAuthError',
  ].includes(name) ? name : 'UnknownError'
}

function safeErrorCode(error: unknown): string | null {
  const record = isRecord(error) ? error : {}
  const cause = isRecord(record.cause) ? record.cause : {}
  const code = typeof record.code === 'string' ? record.code : typeof cause.code === 'string' ? cause.code : undefined
  const safeCodes = new Set([
    'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_HEADERS_TIMEOUT', 'ERR_TLS_CERT_ALTNAME_INVALID', 'CERT_HAS_EXPIRED', 'ABORT_ERR',
    'CREDENTIAL_PARSE_FAILED', 'KEYCHAIN_READ_FAILED', 'ERR_INVALID_ARG_TYPE', 'ERR_INVALID_ARG_VALUE', 'ERR_INVALID_URL',
  ])
  if (code !== undefined && safeCodes.has(code)) return code
  if (record.name === 'StreamableHTTPError' && typeof record.code === 'number' && record.code >= 400 && record.code < 600) return `HTTP_${record.code}`
  return null
}

function tokenCallbackObservation(
  stage: TokenCallbackStage,
  result: 'pass' | 'fail',
  error?: unknown,
): ScysTokenCallbackObservation {
  return {
    stage,
    result,
    errorType: error === undefined ? null : safeErrorType(error),
    errorCode: error === undefined ? null : safeErrorCode(error),
  }
}

function recordTokenCallbackObservation(trace: ReconnectTrace, observation: ScysTokenCallbackObservation): void {
  if (trace.tokenCallbackObservations.length < 20) trace.tokenCallbackObservations.push(observation)
}

function sdkErrorSource(error: unknown): { file: string; line: number } | undefined {
  let current = error
  for (let depth = 0; depth < 3 && isRecord(current); depth += 1) {
    if (typeof current.stack === 'string') {
      for (const line of current.stack.split('\n')) {
        const match = /@modelcontextprotocol\/sdk\/dist\/esm\/([^:)]+):(\d+):\d+/.exec(line)
        if (match !== null) return { file: match[1]!, line: Number(match[2]) }
      }
    }
    current = current.cause
  }
  return undefined
}

const oauthTokenCheckCauseCodes: Readonly<Record<string, string>> = {
  CREDENTIAL_PARSE_FAILED: 'CREDENTIAL_PARSE_FAILED',
  KEYCHAIN_READ_FAILED: 'KEYCHAIN_READ_FAILED',
  ERR_INVALID_ARG_TYPE: 'INVALID_ARGUMENT_TYPE',
  ERR_INVALID_ARG_VALUE: 'INVALID_ARGUMENT_VALUE',
  ERR_INVALID_URL: 'INVALID_URL',
}

const oauthTokenCheckErrorTypes: Readonly<Record<string, string>> = {
  Error: 'ERROR',
  TypeError: 'TYPE_ERROR',
  SyntaxError: 'SYNTAX_ERROR',
  RangeError: 'RANGE_ERROR',
  ReferenceError: 'REFERENCE_ERROR',
  URIError: 'URI_ERROR',
}

function reconnectRequestPhase(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  initializationCompleted: boolean,
): ScysHttpBoundaryObservation['phase'] {
  const rawUrl = input instanceof Request ? input.url : input instanceof URL ? input.toString() : input
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
  try {
    const url = new URL(rawUrl)
    const path = url.pathname.toLowerCase()
    if (path.includes('/.well-known/')) return 'oauth_metadata_discovery'
    if (method === 'POST' && /(^|\/)token(?:\/|$)/.test(path)) return 'oauth_token_refresh'
    const mcpUrl = new URL(SCYS_MCP_URL)
    if (url.origin === mcpUrl.origin && url.pathname === mcpUrl.pathname && method === 'POST') {
      return initializationCompleted ? 'mcp_list_tools' : 'mcp_initialize'
    }
  } catch {
    return 'other'
  }
  return 'other'
}

function stageForRequestPhase(phase: ScysHttpBoundaryObservation['phase']): ScysReconnectDiagnostic['stage'] | undefined {
  if (phase === 'mcp_initialize' || phase === 'oauth_metadata_discovery' || phase === 'oauth_token_refresh' || phase === 'mcp_list_tools') return phase
  return undefined
}
