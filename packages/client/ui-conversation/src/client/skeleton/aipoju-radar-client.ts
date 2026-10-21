/** Typed Renderer client for the native Shell's private Aipoju message bridge. */

import type { ScysContentSummary, ScysFeedMode, ScysFeedQueryResult } from '@deepseek-ai/dsh-business-workbench/types'

export interface AipojuTopic {
  readonly topicId: string
  readonly title: string
  readonly content: string | null
  readonly author: string | null
  readonly createdAt: string | null
  readonly sourceUrl: string | null
  readonly images: readonly string[] | null
  readonly interactionCounts: Readonly<Record<string, number>> | null
}

export interface AipojuHomeFeed {
  readonly featured: readonly AipojuTopic[]
  readonly latest: readonly AipojuTopic[]
  readonly candidateCount: number
  readonly fetchedAt: string
  readonly stale: boolean
  readonly refreshErrorCode: string | null
}

export type AipojuReadResult<T> =
  | { readonly status: 'ready'; readonly value: T }
  | { readonly status: 'empty' }
  | { readonly status: 'auth_required' }
  | { readonly status: 'unavailable'; readonly errorCode: string }

interface AipojuBridgeResponse {
  readonly requestId: string
  readonly ok: boolean
  readonly result?: unknown
  readonly errorCode?: string
}

declare global {
  interface Window {
    readonly __dshAipoju?: {
      request(operation: 'topic.list' | 'topic.search' | 'topic.detail' | 'scys.recent' | 'scys.hot' | 'scys.digested', args: Record<string, unknown>): Promise<AipojuBridgeResponse>
    }
  }
}

/** Use only the closed operations installed by the native Desktop Shell. */
export const aipojuRadarClient = Object.freeze({
  async list(refresh = false): Promise<AipojuReadResult<AipojuHomeFeed>> {
    const response = await request('topic.list', { refresh })
    if (!response.ok) return errorResult(response.errorCode)
    const feed = normalizeHomeFeed(response.result)
    return feed === undefined ? { status: 'unavailable', errorCode: 'BRIDGE_RESPONSE_ERROR' } : { status: 'ready', value: feed }
  },
  async search(keyword: string): Promise<AipojuReadResult<readonly AipojuTopic[]>> {
    const response = await request('topic.search', { keyword })
    return listResult(response)
  },
  async detail(topicId: string): Promise<AipojuReadResult<AipojuTopic>> {
    const response = await request('topic.detail', { topicId })
    if (!response.ok) return errorResult(response.errorCode)
    const topic = normalizeTopic(response.result)
    return topic === undefined
      ? { status: 'unavailable', errorCode: 'BRIDGE_RESPONSE_ERROR' }
      : { status: 'ready', value: topic }
  },
  async queryScysFeed(mode: ScysFeedMode, refresh = false): Promise<ScysFeedQueryResult> {
    const response = await request(`scys.${mode}`, refresh ? { refresh: true } : {})
    if (!response.ok) return { status: 'SCYS_MCP_UNAVAILABLE' }
    const result = normalizeScysFeed(response.result, mode)
    return result ?? { status: 'SCYS_FEED_QUERY_ERROR' }
  },
})

async function request(operation: 'topic.list' | 'topic.search' | 'topic.detail' | 'scys.recent' | 'scys.hot' | 'scys.digested', args: Record<string, unknown>): Promise<AipojuBridgeResponse> {
  const bridge = window.__dshAipoju
  if (bridge === undefined) return { requestId: '', ok: false, errorCode: 'HOST_UNAVAILABLE' }
  try {
    return await bridge.request(operation, args)
  } catch {
    return { requestId: '', ok: false, errorCode: 'HOST_UNAVAILABLE' }
  }
}

function normalizeScysFeed(value: unknown, expectedMode: ScysFeedMode): ScysFeedQueryResult | undefined {
  if (!isRecord(value) || (value.status !== 'ready' && value.status !== 'empty') || !isRecord(value.query)) return undefined
  const query = value.query
  if (query.mode !== expectedMode || typeof query.windowStart !== 'string' || typeof query.windowEnd !== 'string'
    || typeof query.fetchedAt !== 'string' || !Number.isFinite(Date.parse(query.fetchedAt)) || typeof query.stale !== 'boolean'
    || (query.refreshErrorCode !== null && !isScysFeedErrorCode(query.refreshErrorCode))
    || !Number.isSafeInteger(query.pagesRead) || typeof query.mayHaveMore !== 'boolean'
    || query.serverFilterAccepted !== true
    || !['not_applicable', 'confirmed', 'missing', 'conflict'].includes(String(query.itemMarkerEvidence))) return undefined
  const metadata = {
    mode: expectedMode,
    windowStart: query.windowStart,
    windowEnd: query.windowEnd,
    fetchedAt: query.fetchedAt,
    stale: query.stale,
    refreshErrorCode: query.refreshErrorCode as string | null,
    pagesRead: query.pagesRead as number,
    mayHaveMore: query.mayHaveMore,
    serverFilterAccepted: true as const,
    itemMarkerEvidence: query.itemMarkerEvidence as 'not_applicable' | 'confirmed' | 'missing' | 'conflict',
  }
  if (value.status === 'empty') return { status: 'empty', query: metadata }
  if (!Array.isArray(value.items)) return undefined
  const items = value.items.map(normalizeScysContent)
  if (items.some(item => item === undefined)) return undefined
  return items.length === 0 ? { status: 'empty', query: metadata } : { status: 'ready', query: metadata, items: items as ScysContentSummary[] }
}

function isScysFeedErrorCode(value: unknown): value is string {
  return value === 'SCYS_NOT_CONNECTED' || value === 'SCYS_AUTH_EXPIRED' || value === 'SCYS_MCP_UNAVAILABLE'
    || value === 'SCYS_FEED_QUERY_UNSUPPORTED' || value === 'SCYS_FEED_QUERY_ERROR'
}

function normalizeScysContent(value: unknown): ScysContentSummary | undefined {
  if (!isRecord(value) || value.source !== 'scys') return undefined
  const nullableStrings = ['id', 'entityType', 'entityId', 'contentType', 'title', 'summary', 'content', 'author', 'publishedAt', 'url']
  if (nullableStrings.some(key => value[key] !== null && typeof value[key] !== 'string')) return undefined
  if ((value.isHot !== null && typeof value.isHot !== 'boolean')
    || (value.isDigested !== null && typeof value.isDigested !== 'boolean')
    || !isRecord(value.engagement)) return undefined
  const engagement = value.engagement
  const countKeys = ['likeCount', 'favoriteCount', 'coinCount', 'commentCount']
  if (countKeys.some(key => engagement[key] !== null && (typeof engagement[key] !== 'number' || !Number.isFinite(engagement[key] as number)))) return undefined
  return value as unknown as ScysContentSummary
}

function listResult(response: AipojuBridgeResponse): AipojuReadResult<readonly AipojuTopic[]> {
  if (!response.ok) return errorResult(response.errorCode)
  if (!isRecord(response.result) || !Array.isArray(response.result.topics)) return { status: 'unavailable', errorCode: 'BRIDGE_RESPONSE_ERROR' }
  const topics = response.result.topics.map(normalizeTopic)
  if (topics.some(topic => topic === undefined)) return { status: 'unavailable', errorCode: 'BRIDGE_RESPONSE_ERROR' }
  const values = topics as AipojuTopic[]
  return values.length === 0
    ? { status: 'empty' }
    : { status: 'ready', value: values }
}

function errorResult(code: string | undefined): AipojuReadResult<never> {
  if (code === 'AUTH_REQUIRED') return { status: 'auth_required' }
  return { status: 'unavailable', errorCode: safeErrorCode(code) }
}

function safeErrorCode(value: string | undefined): string {
  return value !== undefined && /^[A-Z][A-Z0-9_]{0,40}$/u.test(value) ? value : 'UNKNOWN'
}

function normalizeTopic(value: unknown): AipojuTopic | undefined {
  if (!isRecord(value) || typeof value.topicId !== 'string' || (value.title !== undefined && typeof value.title !== 'string')) return undefined
  return {
    topicId: value.topicId,
    title: typeof value.title === 'string' ? value.title : '',
    content: nullableString(value.content),
    author: nullableString(value.author),
    createdAt: nullableString(value.createdAt),
    sourceUrl: safeHttpUrl(value.sourceUrl),
    images: safeUrlList(value.images),
    interactionCounts: safeCounts(value.interactionCounts),
  }
}

function normalizeHomeFeed(value: unknown): AipojuHomeFeed | undefined {
  if (!isRecord(value) || !Array.isArray(value.featured) || !Array.isArray(value.latest)
    || !Number.isSafeInteger(value.candidateCount) || typeof value.fetchedAt !== 'string'
    || typeof value.stale !== 'boolean' || (value.refreshErrorCode !== null && typeof value.refreshErrorCode !== 'string')) return undefined
  const featured = value.featured.map(normalizeTopic)
  const latest = value.latest.map(normalizeTopic)
  if (featured.some(topic => topic === undefined) || latest.some(topic => topic === undefined)) return undefined
  return {
    featured: featured as AipojuTopic[],
    latest: latest as AipojuTopic[],
    candidateCount: value.candidateCount as number,
    fetchedAt: value.fetchedAt,
    stale: value.stale,
    refreshErrorCode: typeof value.refreshErrorCode === 'string' ? safeErrorCode(value.refreshErrorCode) : null,
  }
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    const publicHost = host !== 'localhost' && !host.endsWith('.localhost') && !host.endsWith('.local')
      && !host.includes(':') && !/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(host)
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && url.username.length === 0 && url.password.length === 0 && publicHost ? url.href : null
  } catch {
    return null
  }
}

function safeUrlList(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) return null
  return value.map(safeHttpUrl).filter((item): item is string => item !== null)
}

function safeCounts(value: unknown): Readonly<Record<string, number>> | null {
  if (!isRecord(value)) return null
  const entries = Object.entries(value).filter(([key, count]) => /^[A-Za-z][A-Za-z0-9]{0,31}$/u.test(key)
    && typeof count === 'number' && Number.isFinite(count) && count >= 0)
  return entries.length === 0 ? null : Object.fromEntries(entries) as Record<string, number>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
