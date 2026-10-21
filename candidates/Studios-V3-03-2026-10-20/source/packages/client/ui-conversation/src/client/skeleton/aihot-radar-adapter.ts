const AIHOT_API = 'https://aihot.news/api/v1'
const CACHE_FALLBACK_MS = 60_000
const REQUEST_TIMEOUT_MS = 12_000
const MAX_RESPONSE_CHARS = 2_000_000

/** A source report shown as evidence for a Radar signal. */
export interface RadarEvidence {
  readonly evidenceId: string
  readonly title: string
  readonly summary: string | null
  readonly sourceName: string
  readonly firstParty: boolean | null
  readonly publishedAt: string | null
  readonly originalUrl: string | null
  readonly aihotUrl: string
}

/** A read-only Radar projection of one published AIHOT Story or Item. */
export interface RadarSignal {
  readonly signalKey: string
  readonly kind: 'story' | 'item'
  readonly title: string
  readonly summary: string | null
  readonly publishedAt: string | null
  readonly sourceName: string
  readonly sourceNames: readonly string[]
  readonly originalUrl: string | null
  readonly aihotUrl: string
  readonly storyId: string | null
  readonly evidence: readonly RadarEvidence[]
  readonly ranking: number | null
  readonly sourceCount: number | null
  readonly reportCount: number | null
  readonly participationCount: number | null
  readonly selected: boolean | null
  readonly category: string | null
}

/** The error kind used to keep remote failures out of the Harness shell. */
export type RadarApiFailureKind = 'timeout' | 'offline' | 'http' | 'schema' | 'rate_limit' | 'snapshot_required'

/** A typed public-API failure safe for the Radar page to present. */
export class RadarApiFailure extends Error {
  constructor(readonly kind: RadarApiFailureKind, message: string, readonly status: number | null = null, readonly retryAfterSeconds: number | null = null) {
    super(message)
    this.name = 'RadarApiFailure'
  }
}

interface CacheEntry {
  readonly etag: string | null
  readonly expiresAt: number
  readonly value: unknown
}

interface HotTopic {
  readonly rank: number
  readonly id: string
  readonly title: string
  readonly sourceName: string
  readonly aihotUrl: string
  readonly originalUrl: string
  readonly storyUrl: string | null
  readonly sourceCount: number
  readonly signalCount: number
  readonly participantCount: number | null
  readonly sourceNames: readonly string[]
  readonly latestAt: string
}

interface Item {
  readonly id: string
  readonly title: string
  readonly summary: string | null
  readonly sourceName: string
  readonly aihotUrl: string
  readonly originalUrl: string
  readonly publishedAt: string | null
  readonly selected: boolean
  readonly category: string | null
}

interface Story {
  readonly publicId: string
  readonly title: string
  readonly firstReportAt: string
  readonly latestAt: string
  readonly latest: string
  readonly digest: string | null
  readonly sourceCount: number
  readonly reportCount: number
  readonly reports: readonly RadarEvidence[]
}

const responseCache = new Map<string, CacheEntry>()
const requestCooldown = new Map<string, { readonly until: number; readonly failure: RadarApiFailure }>()
const inFlightReads = new Map<string, Promise<unknown>>()

/** Fetches current public hot topics and selected items and projects them without writes. */
export async function loadRadarSignals(fetcher: typeof fetch = fetch, signal?: AbortSignal): Promise<readonly RadarSignal[]> {
  const hotTopics = await getJson(`${AIHOT_API}/hot-topics`, parseHotTopics, fetcher, signal)
  const itemFallbackTopics = hotTopics.filter(topic => topic.storyUrl === null)
  const items = itemFallbackTopics.length === 0
    ? []
    : await getJson(`${AIHOT_API}/items?mode=selected&window=24h&limit=50`, parseItems, fetcher, signal)
  const itemsById = new Map(items.map(item => [item.id, item]))

  const signals = new Map<string, RadarSignal>()
  for (const topic of hotTopics) {
    const item = itemsById.get(topic.id)
    const signal = topic.storyUrl === null ? mapItemFallback(topic, item) : mapStoryReference(topic)
    if (!signals.has(signal.signalKey)) signals.set(signal.signalKey, signal)
  }
  return [...signals.values()].sort((a, b) => (a.ranking ?? Number.MAX_SAFE_INTEGER) - (b.ranking ?? Number.MAX_SAFE_INTEGER))
}

/** Reads one Story after the user opens its Signal detail. */
export async function loadRadarStoryDetails(signal: RadarSignal, fetcher: typeof fetch = fetch, requestSignal?: AbortSignal): Promise<RadarSignal> {
  if (signal.kind !== 'story' || signal.storyId === null) throw new RadarApiFailure('schema', 'Signal has no verified Story identity.')
  const story = await getJson(`${AIHOT_API}/stories/${encodeURIComponent(signal.storyId)}`, parseStory, fetcher, requestSignal)
  if (story.publicId !== signal.storyId) throw new RadarApiFailure('schema', 'AIHOT Story identity did not match the requested Signal.')
  return mapStoryDetails(signal, story)
}

/** Clears the process-local API cache for deterministic isolation in tests. */
export function clearRadarApiCache(): void {
  responseCache.clear()
  requestCooldown.clear()
  inFlightReads.clear()
}

/** Reads one official JSON endpoint with conditional GET and a bounded in-memory cache. */
export async function readAihotJson<T>(url: string, parse: (value: unknown) => T, fetcher: typeof fetch = fetch, externalSignal?: AbortSignal): Promise<T> {
  if (!url.startsWith(`${AIHOT_API}/`)) throw new RadarApiFailure('schema', 'Unsupported AIHOT public API endpoint.')
  if (externalSignal !== undefined) return getJson(url, parse, fetcher, externalSignal)
  const existing = inFlightReads.get(url)
  if (existing !== undefined) return existing as Promise<T>
  const request = getJson(url, parse, fetcher)
  inFlightReads.set(url, request)
  try { return await request } finally { if (inFlightReads.get(url) === request) inFlightReads.delete(url) }
}

async function getJson<T>(url: string, parse: (value: unknown) => T, fetcher: typeof fetch, externalSignal?: AbortSignal): Promise<T> {
  const now = Date.now()
  const cached = responseCache.get(url)
  if (cached !== undefined && cached.expiresAt > now) return parse(cached.value)
  const cooldown = requestCooldown.get(url)
  if (cooldown !== undefined && cooldown.until > now) throw cooldown.failure

  const controller = new AbortController()
  const abortFromCaller = () => { controller.abort(externalSignal?.reason) }
  externalSignal?.addEventListener('abort', abortFromCaller, { once: true })
  const timer = setTimeout(() => { controller.abort(new DOMException('AIHOT request timed out', 'TimeoutError')) }, REQUEST_TIMEOUT_MS)
  try {
    const response = await fetcher(url, {
      method: 'GET',
      headers: { Accept: 'application/json', ...(cached?.etag === null || cached === undefined ? {} : { 'If-None-Match': cached.etag }) },
      signal: controller.signal,
    })
    if (response.status === 304 && cached !== undefined) {
      responseCache.set(url, { ...cached, expiresAt: Date.now() + cacheAge(response.headers.get('Cache-Control')) })
      return parse(cached.value)
    }
    if (response.status === 429 || response.status === 503) {
      const retryAfter = retryAfterSeconds(response.headers.get('Retry-After'))
      const failure = new RadarApiFailure(response.status === 429 ? 'rate_limit' : 'http', `AIHOT HTTP ${response.status}`, response.status, retryAfter)
      if (retryAfter !== null) requestCooldown.set(url, { until: Date.now() + retryAfter * 1000, failure })
      throw failure
    }
    if (response.status === 409) throw new RadarApiFailure('snapshot_required', 'AIHOT selected-data snapshot must be restarted.', 409)
    if (!response.ok) throw new RadarApiFailure('http', `HTTP ${response.status}`, response.status)
    const contentLength = response.headers.get('Content-Length')
    if (contentLength !== null && Number(contentLength) > MAX_RESPONSE_CHARS) throw new RadarApiFailure('schema', 'AIHOT response exceeds the reader size limit.')
    const body = await response.text()
    if (body.length > MAX_RESPONSE_CHARS) throw new RadarApiFailure('schema', 'AIHOT response exceeds the reader size limit.')
    let value: unknown
    try { value = JSON.parse(body) } catch { throw new RadarApiFailure('schema', 'AIHOT response is not valid JSON.') }
    let parsed: T
    try {
      parsed = parse(value)
    } catch (error) {
      if (error instanceof RadarApiFailure) throw error
      throw new RadarApiFailure('schema', 'AIHOT response did not match the public API schema.')
    }
    responseCache.set(url, {
      etag: response.headers.get('ETag'),
      expiresAt: Date.now() + cacheAge(response.headers.get('Cache-Control')),
      value,
    })
    requestCooldown.delete(url)
    return parsed
  } catch (error) {
    if (error instanceof RadarApiFailure) throw error
    if (controller.signal.aborted) {
      if (controller.signal.reason instanceof DOMException && controller.signal.reason.name === 'TimeoutError') {
        throw new RadarApiFailure('timeout', 'AIHOT request timed out.')
      }
      throw error
    }
    throw new RadarApiFailure('offline', 'AIHOT public API could not be reached.')
  } finally {
    clearTimeout(timer)
    externalSignal?.removeEventListener('abort', abortFromCaller)
  }
}

function parseHotTopics(value: unknown): readonly HotTopic[] {
  const root = record(value)
  if (root.schemaVersion !== 1 || !Array.isArray(root.items) || !integer(root.count)) return invalidSchema()
  return root.items.map(entry => {
    const topic = record(entry)
    const source = record(topic.source)
    const links = record(topic.links)
    if (!integer(topic.rank) || !text(topic.id) || !text(topic.title) || !text(source.name)
      || !url(links.aihot) || !url(links.original) || !integer(topic.sourceCount) || !integer(topic.signalCount)
      || !(topic.participantCount === undefined || integer(topic.participantCount)) || !textArray(topic.sourceNames) || !text(topic.latestAt)
      || !(links.story === undefined || url(links.story))) return invalidSchema()
    return {
      rank: topic.rank,
      id: topic.id,
      title: topic.title,
      sourceName: source.name,
      aihotUrl: links.aihot,
      originalUrl: links.original,
      storyUrl: typeof links.story === 'string' ? links.story : null,
      sourceCount: topic.sourceCount,
      signalCount: topic.signalCount,
      participantCount: typeof topic.participantCount === 'number' ? topic.participantCount : null,
      sourceNames: topic.sourceNames,
      latestAt: topic.latestAt,
    }
  })
}

function parseItems(value: unknown): readonly Item[] {
  const root = record(value)
  if (root.schemaVersion !== 1 || !Array.isArray(root.items) || !recordOrUndefined(root.page)) return invalidSchema()
  return root.items.map(entry => {
    const item = record(entry)
    const source = record(item.source)
    const links = record(item.links)
    if (!text(item.id) || !text(item.title) || !(item.summary === null || text(item.summary)) || !text(source.name)
      || !url(links.aihot) || !url(links.original) || !(item.publishedAt === null || text(item.publishedAt))
      || !text(item.discoveredAt) || !(item.category === null || text(item.category)) || !numberOrNull(item.score)
      || typeof item.selected !== 'boolean') return invalidSchema()
    return {
      id: item.id,
      title: item.title,
      summary: typeof item.summary === 'string' ? item.summary : null,
      sourceName: source.name,
      aihotUrl: links.aihot,
      originalUrl: links.original,
      publishedAt: typeof item.publishedAt === 'string' ? item.publishedAt : null,
      selected: item.selected,
      category: typeof item.category === 'string' ? item.category : null,
    }
  })
}

function parseStory(value: unknown): Story {
  const root = record(value)
  const story = record(root.story)
  if (root.schemaVersion !== 1 || !text(story.publicId) || !text(story.title) || !['active', 'settled'].includes(String(story.status))
    || !integer(story.sourceCount) || !integer(story.reportCount) || !text(story.firstReportAt) || !text(story.latestAt)
    || !text(story.latest) || !(story.digest === null || text(story.digest)) || !Array.isArray(story.reports)) return invalidSchema()
  const reports = story.reports.map(entry => {
    const report = record(entry)
    const source = record(report.source)
    const links = record(report.links)
    if (!text(report.id) || !text(report.title) || !(report.summary === null || text(report.summary)) || !text(source.name)
      || typeof source.firstParty !== 'boolean' || !text(report.publishedAt) || !url(links.aihot)
      || !(links.original === undefined || url(links.original))) return invalidSchema()
    return {
      evidenceId: report.id,
      title: report.title,
      summary: typeof report.summary === 'string' ? report.summary : null,
      sourceName: source.name,
      firstParty: source.firstParty,
      publishedAt: report.publishedAt,
      originalUrl: typeof links.original === 'string' ? links.original : null,
      aihotUrl: links.aihot,
    }
  })
  return {
    publicId: story.publicId,
    title: story.title,
    firstReportAt: story.firstReportAt,
    latestAt: story.latestAt,
    latest: story.latest,
    digest: typeof story.digest === 'string' ? story.digest : null,
    sourceCount: story.sourceCount,
    reportCount: story.reportCount,
    reports,
  }
}

function mapStoryReference(topic: HotTopic): RadarSignal {
  const storyId = topic.storyUrl === null ? null : storyIdFromPublicLink(topic.storyUrl)
  if (storyId === null) throw new RadarApiFailure('schema', 'AIHOT returned an unsupported Story link.')
  return {
    signalKey: `story:${storyId}`,
    kind: 'story',
    title: topic.title,
    summary: null,
    publishedAt: topic.latestAt,
    sourceName: topic.sourceName,
    sourceNames: topic.sourceNames,
    originalUrl: topic.originalUrl,
    aihotUrl: topic.aihotUrl,
    storyId,
    evidence: [],
    ranking: topic.rank,
    sourceCount: topic.sourceCount,
    reportCount: null,
    participationCount: topic.participantCount,
    selected: null,
    category: null,
  }
}

function mapStoryDetails(reference: RadarSignal, story: Story): RadarSignal {
  return {
    ...reference,
    title: story.title,
    summary: story.digest ?? story.latest,
    publishedAt: story.firstReportAt,
    originalUrl: story.reports.find(report => report.originalUrl !== null)?.originalUrl ?? reference.originalUrl,
    aihotUrl: story.reports[0]?.aihotUrl ?? reference.aihotUrl,
    evidence: story.reports,
    sourceCount: story.sourceCount,
    reportCount: story.reportCount,
  }
}

function mapItemFallback(topic: HotTopic, item: Item | undefined): RadarSignal {
  const evidence: RadarEvidence = item === undefined
    ? { evidenceId: topic.id, title: topic.title, summary: null, sourceName: topic.sourceName, firstParty: null, publishedAt: topic.latestAt, originalUrl: topic.originalUrl, aihotUrl: topic.aihotUrl }
    : { evidenceId: item.id, title: item.title, summary: item.summary, sourceName: item.sourceName, firstParty: null, publishedAt: item.publishedAt, originalUrl: item.originalUrl, aihotUrl: item.aihotUrl }
  return {
    signalKey: `item:${topic.id}`,
    kind: 'item',
    title: item?.title ?? topic.title,
    summary: item?.summary ?? null,
    publishedAt: item?.publishedAt ?? topic.latestAt,
    sourceName: item?.sourceName ?? topic.sourceName,
    sourceNames: [item?.sourceName ?? topic.sourceName],
    originalUrl: item?.originalUrl ?? topic.originalUrl,
    aihotUrl: item?.aihotUrl ?? topic.aihotUrl,
    storyId: null,
    evidence: [evidence],
    ranking: topic.rank,
    sourceCount: null,
    reportCount: null,
    participationCount: null,
    selected: item?.selected ?? null,
    category: item?.category ?? null,
  }
}

function storyIdFromPublicLink(value: string): string | null {
  try {
    const parsed = new URL(value)
    const match = parsed.pathname.match(/^\/story\/([A-Za-z0-9-]{1,128})\/?$/)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

function cacheAge(value: string | null): number {
  const match = value?.match(/(?:^|,)\s*s-maxage=(\d+)/i)
  return match === null || match === undefined ? CACHE_FALLBACK_MS : Number(match[1]) * 1000
}

function retryAfterSeconds(value: string | null): number | null {
  if (value === null) return null
  if (/^\d+$/.test(value)) return Number(value)
  const date = Date.parse(value)
  return Number.isFinite(date) ? Math.max(0, Math.ceil((date - Date.now()) / 1000)) : null
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return invalidSchema()
  return value as Record<string, unknown>
}

function recordOrUndefined(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function integer(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

function numberOrNull(value: unknown): boolean {
  return value === null || typeof value === 'number'
}

function textArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(text)
}

function url(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

function invalidSchema(): never {
  throw new RadarApiFailure('schema', 'AIHOT response did not match the public API schema.')
}
