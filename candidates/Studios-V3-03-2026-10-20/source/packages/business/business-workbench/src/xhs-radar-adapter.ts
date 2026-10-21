/** Fixed read-only Host facade for Xiaohongshu login, search, detail, and explicit comment reads. */

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { XhsCoverAudit, XhsFeedDetail, XhsFeedDetailResult, XhsFeedSummary, XhsSearchErrorCode, XhsSearchFailureDiagnostic, XhsSearchResult, XhsSearchSort, XhsSourceStatusResult } from './types.ts'
import { XhsCoverDelivery } from './xhs-cover-delivery.ts'

const MCP_URL = 'http://127.0.0.1:18060/mcp'
const SEARCH_URL = 'http://127.0.0.1:18060/api/v1/feeds/search'
const LOGIN_STATUS_TIMEOUT_MS = 35_000
const DETAIL_TIMEOUT_MS = 35_000
const SEARCH_TIMEOUT_MS = 75_000
const COMMENT_LOAD_TIMEOUT_MS = 120_000
const MAX_SEARCH_RESULTS = 40
const MAX_DETAIL_IMAGES = 30
const MAX_DETAIL_COMMENTS = 10
const xhsCoverDelivery = new XhsCoverDelivery()

interface McpCallResult {
  readonly isError?: boolean | undefined
  readonly structuredContent?: unknown
  readonly content?: readonly { readonly type?: string; readonly text?: string }[]
}

interface McpClient {
  connect(transport: unknown): Promise<void>
  callTool(params: { readonly name: string; readonly arguments: Record<string, unknown> }): Promise<McpCallResult>
  close(): Promise<void>
}

type ClientFactory = (timeoutMs: number) => { readonly client: McpClient; readonly transport: unknown }
type SearchTrace = {
  readonly httpStatus: number | null
  readonly upstreamSuccess: boolean
  readonly topLevelKeys: readonly string[]
  readonly dataKeys: readonly string[]
  readonly feedsCount: number
  readonly errorCode: XhsSearchDiagnosticCode | null
  readonly durationMs: number
  readonly errorType: string | null
}
type XhsSearchDiagnosticCode =
  | 'XHS_SEARCH_TIMEOUT'
  | 'XHS_SEARCH_UPSTREAM_ERROR'
  | 'XHS_SEARCH_UPSTREAM_5XX'
  | 'XHS_SEARCH_BROWSER_ERROR'
  | 'XHS_SEARCH_RESPONSE_INVALID'
  | 'XHS_SEARCH_NOT_AUTHENTICATED'
  | 'XHS_SEARCH_CONNECTION_ERROR'
  | 'XHS_SEARCH_UNKNOWN'
type SearchFetcher = typeof fetch

const createMcpClient: ClientFactory = timeoutMs => {
  const client = new Client({ name: 'business-workbench-xhs-radar', version: '0.1.1' })
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    requestInit: {
      signal: AbortSignal.timeout(timeoutMs),
    },
  })
  return { client: client as unknown as McpClient, transport }
}

/** Read the current login state through the one permitted MCP status tool. */
export async function getXhsSourceStatus(
  factory: ClientFactory = createMcpClient,
): Promise<XhsSourceStatusResult> {
  try {
    const result = await callMcpTool(factory, LOGIN_STATUS_TIMEOUT_MS, 'check_login_status', {})
    const payload = payloadOf(result)
    if (result.isError === true) return classifyLoginFailure(textOf(payload))
    const loggedIn = findBoolean(payload, ['is_logged_in', 'isLoggedIn', 'logged_in', 'loggedIn'])
    if (loggedIn !== undefined) return loggedIn ? { status: 'connected' } : { status: 'logged_out' }
    const text = textOf(payload).toLowerCase()
    if (text.includes('logged in') || text.includes('已登录')) return { status: 'connected' }
    if (text.includes('logged out') || text.includes('未登录')) return { status: 'logged_out' }
    return { status: 'source_offline' }
  } catch {
    return { status: 'source_offline' }
  }
}

/** Run one bounded, on-demand source search without retries or persistence. */
export async function searchXhsFeeds(
  input: { readonly keyword: string; readonly sortBy?: XhsSearchSort },
  fetcher: SearchFetcher = fetch,
  onTrace?: (trace: SearchTrace) => void,
): Promise<XhsSearchResult> {
  const keyword = input.keyword.trim()
  if (keyword.length === 0 || keyword.length > 100) return { status: 'search_error' }
  const startedAt = Date.now()
  let httpStatus: number | null = null
  try {
    const response = await fetcher(SEARCH_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ keyword, filters: { sort_by: input.sortBy ?? '综合' } }),
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    })
    httpStatus = response.status
    const payload: unknown = await response.json().catch(() => undefined)
    const envelope = isRecord(payload) ? payload : undefined
    const data = envelope !== undefined && isRecord(envelope.data) ? envelope.data : undefined
    const rows = data !== undefined && Array.isArray(data.feeds) && data.feeds.every(isRecord) ? data.feeds : undefined
    const count = data !== undefined && typeof data.count === 'number' && Number.isFinite(data.count)
      ? data.count
      : rows?.length ?? 0
    const upstreamSuccess = envelope?.success === true
    const trace = {
      httpStatus,
      upstreamSuccess,
      topLevelKeys: envelope === undefined ? [] : Object.keys(envelope).sort(),
      dataKeys: data === undefined ? [] : Object.keys(data).sort(),
      feedsCount: count,
    }
    if (response.status === 401 || response.status === 403) {
      emitSearchTrace(onTrace, trace, startedAt, 'XHS_SEARCH_NOT_AUTHENTICATED', null)
      return failedSearch('logged_out', 'MCP_SEARCH_ERROR', 'mcp_search', startedAt, httpStatus)
    }
    if (!response.ok || envelope?.success === false) {
      const message = searchErrorText(envelope)
      const errorCode = classifySearchDiagnostic(message, httpStatus)
      emitSearchTrace(onTrace, trace, startedAt, errorCode, 'HttpError')
      return searchFailureFromSource(errorCode, startedAt, httpStatus)
    }
    if (upstreamSuccess !== true || rows === undefined) {
      emitSearchTrace(onTrace, trace, startedAt, 'XHS_SEARCH_RESPONSE_INVALID', null)
      return failedSearch('search_error', 'RESULT_MAPPING_ERROR', 'result_mapping', startedAt, httpStatus)
    }
    let feeds: XhsFeedSummary[]
    try {
      feeds = rows.slice(0, MAX_SEARCH_RESULTS).map(mapFeedSummary)
    } catch {
      emitSearchTrace(onTrace, trace, startedAt, 'XHS_SEARCH_RESPONSE_INVALID', 'MappingError')
      return failedSearch('search_error', 'RESULT_MAPPING_ERROR', 'result_mapping', startedAt, httpStatus)
    }
    emitSearchTrace(onTrace, trace, startedAt, null, null)
    return count === 0 || feeds.length === 0
      ? { status: 'empty', count }
      : { status: 'ready', feeds, count }
  } catch (error) {
    const errorType = error instanceof Error ? safeSearchErrorType(error.name) : null
    const message = error instanceof Error ? error.message : ''
    emitSearchTrace(onTrace, {
      httpStatus,
      upstreamSuccess: false,
      topLevelKeys: [],
      dataKeys: [],
      feedsCount: 0,
    }, startedAt, classifySearchDiagnostic(message, httpStatus, errorType), errorType)
    return searchFailureFromSource(classifySearchDiagnostic(message, httpStatus, errorType), startedAt, httpStatus)
  }
}

function failedSearch(
  status: 'logged_out' | 'source_offline' | 'search_timeout' | 'search_error',
  errorCode: XhsSearchErrorCode,
  failureStage: XhsSearchFailureDiagnostic['failureStage'],
  startedAt: number,
  httpStatus: number | null,
): XhsSearchResult {
  return {
    status,
    diagnostic: { errorCode, failureStage, durationMs: Date.now() - startedAt, httpStatus },
  }
}

function searchFailureFromSource(
  sourceCode: XhsSearchDiagnosticCode,
  startedAt: number,
  httpStatus: number | null,
): XhsSearchResult {
  if (sourceCode === 'XHS_SEARCH_TIMEOUT') return failedSearch('search_timeout', 'MCP_TIMEOUT', 'mcp_search', startedAt, httpStatus)
  if (sourceCode === 'XHS_SEARCH_CONNECTION_ERROR') return failedSearch('source_offline', 'MCP_UNAVAILABLE', 'mcp_connect', startedAt, httpStatus)
  if (sourceCode === 'XHS_SEARCH_NOT_AUTHENTICATED') return failedSearch('logged_out', 'MCP_SEARCH_ERROR', 'mcp_search', startedAt, httpStatus)
  if (sourceCode === 'XHS_SEARCH_RESPONSE_INVALID') return failedSearch('search_error', 'RESULT_MAPPING_ERROR', 'result_mapping', startedAt, httpStatus)
  if (sourceCode === 'XHS_SEARCH_BROWSER_ERROR') return failedSearch('search_error', 'MCP_BROWSER_ERROR', 'mcp_search', startedAt, httpStatus)
  if (sourceCode === 'XHS_SEARCH_UPSTREAM_ERROR') return failedSearch('search_error', 'MCP_UPSTREAM_ERROR', 'mcp_search', startedAt, httpStatus)
  if (sourceCode === 'XHS_SEARCH_UNKNOWN') return failedSearch('search_error', 'UNKNOWN', 'unknown', startedAt, httpStatus)
  return failedSearch('search_error', 'MCP_SEARCH_ERROR', 'mcp_search', startedAt, httpStatus)
}

function emitSearchTrace(
  onTrace: ((trace: SearchTrace) => void) | undefined,
  trace: Omit<SearchTrace, 'errorCode' | 'durationMs' | 'errorType'>,
  startedAt: number,
  errorCode: XhsSearchDiagnosticCode | null,
  errorType: string | null,
): void {
  onTrace?.({ ...trace, errorCode, durationMs: Date.now() - startedAt, errorType })
}

function classifySearchDiagnostic(message: string, httpStatus: number | null, errorType: string | null = null): XhsSearchDiagnosticCode {
  const normalized = message.toLowerCase()
  if (httpStatus === 401 || httpStatus === 403 || /login|logged.?out|未登录|登录失效/u.test(normalized)) return 'XHS_SEARCH_NOT_AUTHENTICATED'
  if (errorType === 'AbortError' || errorType === 'TimeoutError' || /timeout|timed out|deadline exceeded|context canceled/u.test(normalized)) return 'XHS_SEARCH_TIMEOUT'
  if (/mustwait|browser|chromium|go-rod|rod\.page|navigation (?:failed|failure|error)|failed to navigate/u.test(normalized)) return 'XHS_SEARCH_BROWSER_ERROR'
  if (/upstream (?:response|request).{0,24}(?:failed|failure|error)|(?:failed|failure|error).{0,24}upstream (?:response|request)/u.test(normalized)) return 'XHS_SEARCH_UPSTREAM_ERROR'
  if (/fetch failed|connection refused|econnrefused|network|enotfound|eai_again/u.test(normalized)) return 'XHS_SEARCH_CONNECTION_ERROR'
  if (httpStatus !== null && httpStatus >= 500) return 'XHS_SEARCH_UPSTREAM_5XX'
  if (httpStatus !== null && httpStatus >= 400) return 'XHS_SEARCH_UPSTREAM_ERROR'
  return httpStatus === null ? 'XHS_SEARCH_UNKNOWN' : 'XHS_SEARCH_RESPONSE_INVALID'
}

function safeSearchErrorType(name: string): string {
  if (name === 'AbortError' || name === 'TimeoutError' || name === 'TypeError' || name === 'SyntaxError' || name === 'Error') return name
  return 'OtherError'
}

/** Read one selected result, loading comments from the fixed detail endpoint only when requested. */
export async function getXhsFeedDetail(
  input: { readonly id: string; readonly xsecToken: string; readonly loadComments?: boolean },
  factory: ClientFactory = createMcpClient,
  fetcher: SearchFetcher = fetch,
): Promise<XhsFeedDetailResult> {
  if (input.id.length === 0 || input.xsecToken.length === 0) return { status: 'detail_error' }
  if (input.loadComments === true) return loadXhsFeedComments(input.id, input.xsecToken, fetcher)
  try {
    const result = await callMcpTool(factory, DETAIL_TIMEOUT_MS, 'get_feed_detail', {
      feed_id: input.id,
      xsec_token: input.xsecToken,
    })
    const payload = payloadOf(result)
    if (result.isError === true) {
      const failure = classifyLoginFailure(textOf(payload))
      return failure.status === 'logged_out' ? failure : { status: 'detail_error' }
    }
    const detail = mapFeedDetail(payload)
    return detail === undefined ? { status: 'detail_error' } : { status: 'ready', detail }
  } catch {
    return { status: 'detail_error' }
  }
}

/** Deliver a previously registered search-result cover without exposing its source URL. */
export function getXhsCoverAsset(input: { readonly assetId: string }) {
  return xhsCoverDelivery.get(input.assetId)
}

/** Load at most ten top-level comments only after an explicit Client request. */
async function loadXhsFeedComments(id: string, xsecToken: string, fetcher: SearchFetcher): Promise<XhsFeedDetailResult> {
  try {
    const response = await fetcher('http://127.0.0.1:18060/api/v1/feeds/detail', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        feed_id: id,
        xsec_token: xsecToken,
        load_all_comments: true,
        comment_config: { click_more_replies: false, max_comment_items: 10, scroll_speed: 'normal' },
      }),
      signal: AbortSignal.timeout(COMMENT_LOAD_TIMEOUT_MS),
    })
    const payload: unknown = await response.json().catch(() => undefined)
    if (response.status === 401 || response.status === 403) return { status: 'logged_out' }
    if (!response.ok || !isRecord(payload) || payload.success !== true) return { status: 'detail_error' }
    const responseData = isRecord(payload.data) ? payload.data : undefined
    const detailPayload = responseData !== undefined && isRecord(responseData.data) ? responseData.data : undefined
    if (detailPayload === undefined) return { status: 'detail_error' }
    const detail = mapFeedDetail(detailPayload)
    return detail === undefined ? { status: 'detail_error' } : { status: 'ready', detail }
  } catch {
    return { status: 'detail_error' }
  }
}

async function callMcpTool(
  factory: ClientFactory,
  timeoutMs: number,
  name: 'check_login_status' | 'search_feeds' | 'get_feed_detail',
  args: Record<string, unknown>,
): Promise<McpCallResult> {
  const { client, transport } = factory(timeoutMs)
  try {
    await client.connect(transport)
    return await client.callTool({ name, arguments: args })
  } finally {
    await client.close().catch(() => undefined)
  }
}

function payloadOf(result: McpCallResult): unknown {
  if (result.structuredContent !== undefined) return result.structuredContent
  for (const block of result.content ?? []) {
    if (block.type !== 'text' || typeof block.text !== 'string') continue
    const parsed = parseJsonText(block.text)
    if (parsed !== undefined) return parsed
    return block.text
  }
  return undefined
}

function parseJsonText(text: string): unknown {
  try { return JSON.parse(text) as unknown } catch { /* MCP tools may wrap JSON in explanatory text. */ }
  const firstObject = text.indexOf('{')
  const lastObject = text.lastIndexOf('}')
  if (firstObject >= 0 && lastObject > firstObject) {
    try { return JSON.parse(text.slice(firstObject, lastObject + 1)) as unknown } catch { /* Keep unknown source text out of the UI. */ }
  }
  const firstArray = text.indexOf('[')
  const lastArray = text.lastIndexOf(']')
  if (firstArray >= 0 && lastArray > firstArray) {
    try { return JSON.parse(text.slice(firstArray, lastArray + 1)) as unknown } catch { /* Keep unknown source text out of the UI. */ }
  }
  return undefined
}

function mapFeedSummary(row: Record<string, unknown>): XhsFeedSummary {
  const card = firstRecord(row, ['noteCard', 'note_card', 'card']) ?? row
  const user = firstRecord(card, ['user', 'author']) ?? firstRecord(row, ['user', 'author'])
  const interaction = firstRecord(card, ['interactInfo', 'interact_info', 'interaction']) ?? firstRecord(row, ['interactInfo', 'interact_info', 'interaction'])
  const cover = firstValue(card, ['cover', 'coverImage', 'cover_image']) ?? firstValue(row, ['cover', 'coverImage', 'cover_image'])
  const coverUrl = resolveXhsCoverUrl(cover) ?? resolveXhsCoverUrl(firstString(row, ['cover_url', 'coverUrl', 'cover']))
  const coverAssetId = xhsCoverDelivery.register(coverUrl)
  return {
    id: firstString(row, ['feed_id', 'id', 'note_id', 'noteId']),
    xsecToken: firstString(row, ['xsec_token', 'xsecToken']),
    title: firstString(card, ['displayTitle', 'display_title', 'title']) ?? firstString(row, ['title']),
    author: authorName(user) ?? firstString(card, ['author']) ?? firstString(row, ['author']),
    coverAssetId,
    coverAudit: coverAudit(cover, coverAssetId),
    noteType: firstString(card, ['type', 'noteType', 'note_type']) ?? firstString(row, ['noteType', 'note_type', 'type']),
    likeCount: firstNumber(interaction, ['likedCount', 'liked_count', 'likeCount', 'like_count']) ?? firstNumber(row, ['likeCount', 'like_count', 'likedCount', 'liked_count']),
    collectCount: firstNumber(interaction, ['collectedCount', 'collected_count', 'collectCount', 'collect_count']) ?? firstNumber(row, ['collectCount', 'collect_count', 'collectedCount', 'collected_count']),
    commentCount: firstNumber(interaction, ['commentCount', 'comment_count']) ?? firstNumber(row, ['commentCount', 'comment_count']),
  }
}

function coverAudit(value: unknown, assetId: string | null): XhsCoverAudit {
  const record = isRecord(value) ? value : undefined
  const infoList = record !== undefined && Array.isArray(record.infoList) ? record.infoList : []
  return Object.freeze({
    rawCoverPresent: value !== undefined && value !== null,
    urlDefaultPresent: hasText(record?.urlDefault ?? record?.url_default),
    urlPresent: hasText(record?.url),
    urlPrePresent: hasText(record?.urlPre ?? record?.url_pre),
    infoListUrlPresent: infoList.some(item => isRecord(item) && hasText(item.url)),
    hostMapped: assetId !== null,
  })
}

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function mapFeedDetail(payload: unknown): XhsFeedDetail | undefined {
  const row = findDetailRecord(payload)
  if (row === undefined) return undefined
  const container = isRecord(payload) && isRecord(payload.note) ? payload : row
  const note = firstRecord(container, ['note']) ?? row
  const card = firstRecord(note, ['noteCard', 'note_card', 'feed', 'data']) ?? note
  const user = firstRecord(card, ['user', 'author']) ?? firstRecord(row, ['user', 'author'])
  const interaction = firstRecord(card, ['interactInfo', 'interact_info', 'interaction']) ?? firstRecord(row, ['interactInfo', 'interact_info', 'interaction'])
  const rawComments = commentRows(container) ?? commentRows(card) ?? commentRows(row) ?? []
  const rawImages = firstArray(card, ['images', 'imageList', 'image_list']) ?? firstArray(row, ['images', 'imageList', 'image_list']) ?? []
  return {
    id: firstString(row, ['feed_id', 'id', 'note_id', 'noteId']) ?? firstString(card, ['feed_id', 'id', 'note_id', 'noteId']),
    title: firstString(card, ['displayTitle', 'display_title', 'title']) ?? firstString(row, ['title']),
    content: firstString(card, ['desc', 'content', 'body', 'description']) ?? firstString(row, ['desc', 'content', 'body', 'description']),
    author: authorName(user) ?? firstString(card, ['author']) ?? firstString(row, ['author']),
    imageAssetIds: rawImages.slice(0, MAX_DETAIL_IMAGES).map(image => xhsCoverDelivery.register(imageUrl(image))),
    likeCount: firstNumber(interaction, ['likedCount', 'liked_count', 'likeCount', 'like_count']) ?? firstNumber(row, ['likeCount', 'like_count', 'likedCount', 'liked_count']),
    collectCount: firstNumber(interaction, ['collectedCount', 'collected_count', 'collectCount', 'collect_count']) ?? firstNumber(row, ['collectCount', 'collect_count', 'collectedCount', 'collected_count']),
    commentCount: firstNumber(interaction, ['commentCount', 'comment_count']) ?? firstNumber(row, ['commentCount', 'comment_count']),
    comments: rawComments.slice(0, MAX_DETAIL_COMMENTS).filter(isRecord).map(mapComment),
  }
}

function findDetailRecord(payload: unknown, depth = 0): Record<string, unknown> | undefined {
  if (!isRecord(payload) || depth > 5) return undefined
  if (['title', 'desc', 'content', 'body', 'noteCard', 'note_card'].some(key => Object.hasOwn(payload, key))) return payload
  for (const key of ['data', 'feed', 'note', 'result']) {
    const nested = findDetailRecord(payload[key], depth + 1)
    if (nested !== undefined) return nested
  }
  return undefined
}

function mapComment(row: Record<string, unknown>) {
  const user = firstRecord(row, ['userInfo', 'user_info', 'user', 'author'])
  return {
    id: firstString(row, ['id', 'comment_id', 'commentId']),
    content: firstString(row, ['content', 'text', 'desc']),
    author: authorName(user) ?? firstString(row, ['author']),
    likeCount: firstNumber(row, ['likeCount', 'like_count', 'likedCount', 'liked_count']),
    createdAt: firstString(row, ['createdAt', 'created_at', 'createTime', 'create_time', 'time']),
  }
}

function commentRows(value: Record<string, unknown>): readonly unknown[] | undefined {
  const comments = value.comments
  if (Array.isArray(comments)) return comments
  if (isRecord(comments) && Array.isArray(comments.list)) return comments.list
  return firstArray(value, ['commentList', 'comment_list'])
}

function imageUrl(value: unknown): string | null {
  if (typeof value === 'string') return safeUrl(value)
  if (!isRecord(value)) return null
  return safeUrl(firstString(value, ['urlDefault', 'url_default', 'url', 'urlPre', 'url_pre']))
}

function safeUrl(value: string | null): string | null {
  if (value === null) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? value : null
  } catch { return null }
}

function resolveXhsCoverUrl(cover: unknown): string | null {
  const candidates: unknown[] = []
  if (typeof cover === 'string') candidates.push(cover)
  if (isRecord(cover)) {
    candidates.push(cover.urlDefault, cover.url_default, cover.url, cover.urlPre, cover.url_pre)
    if (Array.isArray(cover.infoList)) {
      for (const item of cover.infoList) {
        if (isRecord(item)) candidates.push(item.url)
      }
    }
  }
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue
    const value = candidate.trim()
    if (value.length === 0) continue
    const normalized = value.startsWith('//') ? `https:${value}` : value
    try {
      const url = new URL(normalized)
      if ((url.protocol === 'https:' || url.protocol === 'http:') && url.hostname.length > 0) return normalized
    } catch { /* Ignore invalid cover candidates and try the next upstream field. */ }
  }
  return null
}

function searchErrorText(envelope: Record<string, unknown> | undefined): string {
  if (envelope === undefined) return ''
  const error = isRecord(envelope.error) ? envelope.error : undefined
  const errorMessage = typeof envelope.error === 'string' ? envelope.error : undefined
  return [envelope.code, errorMessage, envelope.details, error?.code, error?.message, error?.details]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
}

function classifyLoginFailure(message: string): XhsSourceStatusResult {
  return /login|logged.?out|未登录|登录失效/iu.test(message) ? { status: 'logged_out' } : { status: 'source_offline' }
}

function textOf(value: unknown): string {
  if (typeof value === 'string') return value
  if (isRecord(value)) {
    for (const key of ['message', 'error', 'text']) if (typeof value[key] === 'string') return value[key]
  }
  return ''
}

function findBoolean(value: unknown, keys: readonly string[], depth = 0): boolean | undefined {
  if (!isRecord(value) || depth > 4) return undefined
  for (const key of keys) if (typeof value[key] === 'boolean') return value[key]
  for (const key of ['data', 'result', 'status']) {
    const found = findBoolean(value[key], keys, depth + 1)
    if (found !== undefined) return found
  }
  return undefined
}

function firstRecord(value: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> | undefined {
  for (const key of keys) if (isRecord(value[key])) return value[key]
  return undefined
}

function firstValue(value: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) if (value[key] !== undefined && value[key] !== null) return value[key]
  return undefined
}

function firstArray(value: Record<string, unknown>, keys: readonly string[]): readonly unknown[] | undefined {
  for (const key of keys) if (Array.isArray(value[key])) return value[key]
  return undefined
}

function firstString(value: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) if (typeof value[key] === 'string') return value[key] as string
  return null
}

function firstNumber(value: Record<string, unknown> | undefined, keys: readonly string[]): number | null {
  if (value === undefined) return null
  for (const key of keys) {
    const candidate = value[key]
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate
    if (typeof candidate === 'string' && /^\d+$/u.test(candidate)) return Number(candidate)
  }
  return null
}

function authorName(value: Record<string, unknown> | undefined): string | null {
  if (value === undefined) return null
  return firstString(value, ['nickname', 'name', 'displayName', 'display_name'])
    ?? firstString(value, ['userName', 'user_name'])
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
