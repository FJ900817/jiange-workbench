import { RadarApiFailure, readAihotJson } from './aihot-radar-adapter.ts'

const API = 'https://aihot.news/api/v1'
const CATEGORIES = ['ai-models', 'ai-products', 'industry', 'paper', 'tip', 'opinion'] as const

/** Current AIHOT public-news categories. Unknown future response categories remain readable. */
export type AihotCategory = typeof CATEGORIES[number]

/** One item from AIHOT's official public publication layer, not local Article/Analysis data. */
export interface AihotPublicItem {
  readonly id: string
  readonly title: string
  readonly originalTitle: string | null
  readonly summary: string | null
  readonly sourceName: string
  readonly aihotUrl: string
  readonly originalUrl: string | null
  readonly publishedAt: string | null
  readonly discoveredAt: string
  readonly category: string | null
  readonly score: number | null
  readonly selected: boolean
  readonly reason: string | null
  readonly attribution: { readonly name: string; readonly url: string | null } | null
}

/** Filters whose canonical serialization binds a pagination cursor to one query. */
export interface AihotItemsQuery {
  readonly mode: 'selected' | 'all'
  readonly window: '24h' | '7d'
  readonly by?: 'timeline' | 'published'
  readonly category?: AihotCategory
  readonly q?: string
  readonly limit?: number
}

/** Opaque server cursor with a local query identity; never persist it across rolling windows. */
export interface AihotItemsCursor {
  readonly value: string
  readonly queryKey: string
}

/** One official, bounded items page. */
export interface AihotItemsPage {
  readonly items: readonly AihotPublicItem[]
  readonly count: number
  readonly hasMore: boolean
  readonly nextCursor: AihotItemsCursor | null
  readonly ordering: 'timelineDesc' | 'publishedAtDesc'
}

/** Reads selected or all public items with all six category filters, search, and query-bound cursor paging. */
export async function loadAihotItems(query: AihotItemsQuery, cursor?: AihotItemsCursor, fetcher: typeof fetch = fetch): Promise<AihotItemsPage> {
  const params = new URLSearchParams()
  params.set('mode', query.mode)
  params.set('window', query.window)
  params.set('by', query.by ?? 'timeline')
  if (query.category !== undefined) {
    if (!CATEGORIES.includes(query.category)) return badRequest()
    params.set('category', query.category)
  }
  if (query.q !== undefined) {
    const q = query.q.trim()
    const length = [...q].length
    if (length < 2 || length > 200) return badRequest()
    params.set('q', q)
  }
  const limit = query.limit ?? 50
  if (!boundedInteger(limit, 1, 100)) return badRequest()
  params.set('limit', String(limit))
  const queryKey = params.toString()
  if (cursor !== undefined) {
    if (cursor.queryKey !== queryKey || !nonempty(cursor.value)) return badRequest()
    params.set('cursor', cursor.value)
  }
  return readAihotJson(`${API}/items?${params}`, value => {
    const root = object(value)
    const queryResult = object(root.query)
    const page = object(root.page)
    if (root.schemaVersion !== 1 || !Array.isArray(root.items) || !boundedInteger(page.count, 0, 100)
      || typeof page.hasMore !== 'boolean' || !nullableString(page.nextCursor)
      || !['timelineDesc', 'publishedAtDesc'].includes(String(queryResult.ordering))) return invalid()
    if (queryResult.mode !== query.mode || queryResult.window !== query.window || queryResult.by !== (query.by ?? 'timeline')
      || queryResult.category !== (query.category ?? null) || queryResult.q !== (query.q?.trim() ?? null)) return invalid()
    if (page.count !== root.items.length || (page.hasMore && !nonempty(page.nextCursor))
      || (!page.hasMore && page.nextCursor !== null)) return invalid()
    return {
      items: root.items.map(entry => publicItem(entry, false)), count: page.count, hasMore: page.hasMore,
      nextCursor: page.hasMore ? { value: page.nextCursor as string, queryKey } : null,
      ordering: queryResult.ordering as AihotItemsPage['ordering'],
    }
  }, fetcher)
}

/** Reads at most five pages, stopping on repeated cursors and deduplicating by official item ID. */
export async function loadAihotItemsBatch(query: AihotItemsQuery, maxPages = 3, fetcher: typeof fetch = fetch): Promise<readonly AihotPublicItem[]> {
  if (!boundedInteger(maxPages, 1, 5)) return badRequest()
  const items = new Map<string, AihotPublicItem>()
  const seen = new Set<string>()
  let cursor: AihotItemsCursor | undefined
  for (let pageNumber = 0; pageNumber < maxPages; pageNumber++) {
    const page = await loadAihotItems(query, cursor, fetcher)
    for (const item of page.items) if (!items.has(item.id)) items.set(item.id, item)
    if (page.nextCursor === null) break
    if (seen.has(page.nextCursor.value)) return invalid()
    seen.add(page.nextCursor.value)
    cursor = page.nextCursor
  }
  return [...items.values()]
}

/** Full public hotspot detail including source reports, event timeline, and related events. */
export interface AihotPublicStory {
  readonly publicId: string
  readonly title: string
  readonly status: 'active' | 'settled'
  readonly latest: string
  readonly digest: string | null
  readonly firstReportAt: string
  readonly latestAt: string
  readonly sourceCount: number
  readonly reportCount: number
  readonly aihotUrl: string
  readonly reports: readonly { readonly id: string; readonly title: string; readonly summary: string | null; readonly sourceName: string; readonly publishedAt: string; readonly aihotUrl: string; readonly originalUrl: string | null }[]
  readonly storyline: readonly AihotStoryNeighbor[]
  readonly related: readonly AihotStoryNeighbor[]
}

/** Related official Story reference. */
export interface AihotStoryNeighbor {
  readonly publicId: string
  readonly title: string
  readonly relation: string
  readonly aihotUrl: string
  readonly apiUrl: string
}

/** Reads one public Story with its timeline and original-source reports. */
export async function loadAihotStory(publicId: string, fetcher: typeof fetch = fetch): Promise<AihotPublicStory> {
  if (!/^[A-Za-z0-9-]{1,128}$/.test(publicId)) return badRequest()
  return readAihotJson(`${API}/stories/${publicId}`, value => {
    const root = object(value)
    const story = object(root.story)
    const links = object(story.links)
    if (root.schemaVersion !== 1 || story.publicId !== publicId || !nonempty(story.title)
      || !['active', 'settled'].includes(String(story.status)) || !nonempty(story.latest)
      || !nullableString(story.digest) || !dateTime(story.firstReportAt) || !dateTime(story.latestAt)
      || !boundedInteger(story.sourceCount, 0, Number.MAX_SAFE_INTEGER) || !boundedInteger(story.reportCount, 0, Number.MAX_SAFE_INTEGER)
      || !httpsUrl(links.aihot) || !Array.isArray(story.reports) || !Array.isArray(story.storyline) || !Array.isArray(story.related)) return invalid()
    return {
      publicId, title: story.title, status: story.status as AihotPublicStory['status'], latest: story.latest,
      digest: story.digest as string | null, firstReportAt: story.firstReportAt, latestAt: story.latestAt,
      sourceCount: story.sourceCount, reportCount: story.reportCount, aihotUrl: links.aihot,
      reports: story.reports.map(entry => {
        const report = object(entry); const source = object(report.source); const reportLinks = object(report.links)
        if (!nonempty(report.id) || !nonempty(report.title) || !nullableString(report.summary) || !nonempty(source.name)
          || !dateTime(report.publishedAt) || !httpsUrl(reportLinks.aihot)
          || (reportLinks.original !== undefined && !httpsUrl(reportLinks.original))) return invalid()
        return { id: report.id, title: report.title, summary: report.summary as string | null, sourceName: source.name,
          publishedAt: report.publishedAt, aihotUrl: reportLinks.aihot, originalUrl: reportLinks.original as string | null ?? null }
      }),
      storyline: story.storyline.map(storyNeighbor), related: story.related.map(storyNeighbor),
    }
  }, fetcher)
}

/** One public daily, weekly, or monthly issue summary. */
export interface AihotReportEntry {
  readonly key: string
  readonly generatedAt: string
  readonly headline: string | null
  readonly periodStart: string | null
  readonly periodEnd: string | null
  readonly aihotUrl: string
}

/** Official report detail with structured sections and source links. */
export interface AihotReport {
  readonly kind: 'daily' | 'weekly' | 'monthly'
  readonly key: string
  readonly generatedAt: string
  readonly headline: string | null
  readonly overview: string | null
  readonly windowStart: string
  readonly windowEnd: string
  readonly aihotUrl: string
  readonly sections: readonly { readonly label: string; readonly summary: string | null; readonly items: readonly { readonly title: string; readonly summary: string; readonly sourceName: string; readonly publishedAt: string | null; readonly aihotUrl: string | null; readonly originalUrl: string }[] }[]
  readonly flashes: readonly { readonly title: string; readonly sourceName: string; readonly publishedAt: string; readonly aihotUrl: string | null; readonly originalUrl: string }[]
}

/** Lists official report issue indexes, bounded by the API's per-kind maximum. */
export async function loadAihotReportIndex(kind: AihotReport['kind'], limit = 12, fetcher: typeof fetch = fetch): Promise<readonly AihotReportEntry[]> {
  const max = kind === 'daily' ? 180 : 60
  if (!boundedInteger(limit, 1, max)) return badRequest()
  return readAihotJson(`${API}/${reportPath(kind)}?limit=${limit}`, value => {
    const root = object(value)
    if (root.schemaVersion !== 1 || !Array.isArray(root.items) || root.count !== root.items.length) return invalid()
    return root.items.map(entry => reportEntry(entry, kind))
  }, fetcher)
}

/** Reads the latest issue or one validated historical issue from the official API. */
export async function loadAihotReport(kind: AihotReport['kind'], key: string = 'latest', fetcher: typeof fetch = fetch): Promise<AihotReport> {
  const valid = key === 'latest' || (kind === 'daily' ? /^\d{4}-\d{2}-\d{2}$/.test(key) : kind === 'weekly' ? /^\d{4}-W\d{2}$/.test(key) : /^\d{4}-\d{2}$/.test(key))
  if (!valid) return badRequest()
  return readAihotJson(`${API}/${reportPath(kind)}/${key}`, value => {
    const root = object(value); const report = object(root.report); const links = object(report.links)
    const actualKey = report[reportKey(kind)]
    if (root.schemaVersion !== 1 || !nonempty(actualKey) || (key !== 'latest' && actualKey !== key)
      || !dateTime(report.generatedAt) || !dateTime(report.windowStart) || !dateTime(report.windowEnd)
      || !httpsUrl(links.aihot) || !Array.isArray(report.sections)
      || (kind === 'daily' && !Array.isArray(report.flashes))) return invalid()
    const lead = kind === 'daily' ? report.lead : null
    const headline = kind === 'daily' ? (lead === null ? null : object(lead).title) : report.headline
    const overview = kind === 'daily' ? (lead === null ? null : object(lead).leadParagraph) : report.overview
    if (!nullableString(headline) || !nullableString(overview)) return invalid()
    return {
      kind, key: actualKey, generatedAt: report.generatedAt, headline: headline as string | null, overview: overview as string | null,
      windowStart: report.windowStart, windowEnd: report.windowEnd, aihotUrl: links.aihot,
      sections: report.sections.map(entry => {
        const section = object(entry)
        if (!nonempty(section.label) || !Array.isArray(section.items) || (kind !== 'daily' && !nullableString(section.summary))) return invalid()
        return { label: section.label, summary: kind === 'daily' ? null : section.summary as string | null,
          items: section.items.map(reportContentItem) }
      }),
      flashes: kind === 'daily' ? (report.flashes as unknown[]).map(entry => {
        const flash = object(entry); const source = object(flash.source); const flashLinks = object(flash.links)
        if (!nonempty(flash.title) || !nonempty(source.name) || !dateTime(flash.publishedAt) || !httpsUrl(flashLinks.original)) return invalid()
        return { title: flash.title, sourceName: source.name, publishedAt: flash.publishedAt,
          aihotUrl: optionalHttps(flashLinks.aihot), originalUrl: flashLinks.original }
      }) : [],
    }
  }, fetcher)
}

/** One bounded selected-snapshot page; callers keep its cursor only after all pages complete. */
export interface AihotSnapshotPage {
  readonly asOf: string
  readonly cursor: string
  readonly items: readonly AihotPublicItem[]
  readonly hasMore: boolean
  readonly nextPage: string | null
}

/** Reads one official selected snapshot page without starting a bulk mirror. */
export async function loadAihotSelectedSnapshot(page?: string, fetcher: typeof fetch = fetch): Promise<AihotSnapshotPage> {
  if (page !== undefined && !nonempty(page)) return badRequest()
  const params = new URLSearchParams({ fields: 'default', limit: '100' })
  if (page !== undefined) params.set('page', page)
  return readAihotJson(`${API}/selected/snapshot?${params}`, value => {
    const root = object(value)
    if (root.schemaVersion !== 1 || root.fields !== 'default' || !dateTime(root.asOf) || !nonempty(root.cursor)
      || !boundedInteger(root.count, 0, 100) || !Array.isArray(root.items) || root.count !== root.items.length
      || typeof root.hasMore !== 'boolean' || !nullableString(root.nextPage)
      || (root.hasMore && !nonempty(root.nextPage)) || (!root.hasMore && root.nextPage !== null)) return invalid()
    return { asOf: root.asOf, cursor: root.cursor, items: root.items.map(entry => publicItem(entry, false)),
      hasMore: root.hasMore, nextPage: root.nextPage as string | null }
  }, fetcher)
}

/** One official incremental upsert or removal. */
export type AihotSelectedChange = { readonly op: 'upsert'; readonly changedAt: string; readonly item: AihotPublicItem } | { readonly op: 'remove'; readonly changedAt: string; readonly id: string }

/** Reads one bounded selected-change page; a 409 requires a fresh snapshot. */
export async function loadAihotSelectedChanges(cursor: string, fetcher: typeof fetch = fetch): Promise<{ readonly cursor: string; readonly hasMore: boolean; readonly changes: readonly AihotSelectedChange[] }> {
  if (!nonempty(cursor)) return badRequest()
  const params = new URLSearchParams({ cursor, limit: '100' })
  return readAihotJson(`${API}/selected/changes?${params}`, value => {
    const root = object(value)
    if (root.schemaVersion !== 1 || root.fields !== 'default' || !nonempty(root.cursor)
      || !boundedInteger(root.count, 0, 100) || !Array.isArray(root.changes) || root.count !== root.changes.length
      || typeof root.hasMore !== 'boolean') return invalid()
    return { cursor: root.cursor, hasMore: root.hasMore, changes: root.changes.map(entry => {
      const change = object(entry)
      if (!dateTime(change.changedAt)) return invalid()
      if (change.op === 'upsert') return { op: 'upsert', changedAt: change.changedAt, item: publicItem(change.item, false) }
      if (change.op === 'remove' && nonempty(change.id)) return { op: 'remove', changedAt: change.changedAt, id: change.id }
      return invalid()
    }) }
  }, fetcher)
}

function publicItem(value: unknown, minimal: boolean): AihotPublicItem {
  const item = object(value); const source = object(item.source); const links = object(item.links)
  if (!nonempty(item.id) || !nonempty(item.title) || !nonempty(source.name) || !httpsUrl(links.aihot)
    || (!minimal && !httpsUrl(links.original)) || !nullableDateTime(item.publishedAt) || !dateTime(item.discoveredAt)
    || !nullableString(item.category) || !nullableScore(item.score) || typeof item.selected !== 'boolean'
    || (!minimal && (!nullableString(item.originalTitle) || !nullableString(item.summary)))) return invalid()
  if (item.reason !== undefined && !nullableString(item.reason)) return invalid()
  const attribution = item.attribution === undefined || item.attribution === null ? null : (() => {
    const at = object(item.attribution)
    if (!nonempty(at.name) || !httpsUrl(at.url)) return invalid()
    return { name: at.name, url: at.url }
  })()
  return {
    id: item.id, title: item.title, originalTitle: minimal ? null : item.originalTitle as string | null,
    summary: minimal ? null : item.summary as string | null, sourceName: source.name,
    aihotUrl: links.aihot, originalUrl: minimal ? null : links.original as string,
    publishedAt: item.publishedAt as string | null, discoveredAt: item.discoveredAt,
    category: item.category as string | null, score: item.score as number | null, selected: item.selected,
    reason: nullableString(item.reason) ? item.reason as string | null : null,
    attribution,
  }
}

function storyNeighbor(value: unknown): AihotStoryNeighbor {
  const neighbor = object(value); const links = object(neighbor.links)
  if (!nonempty(neighbor.publicId) || !nonempty(neighbor.title) || !nonempty(neighbor.relation)
    || !httpsUrl(links.aihot) || !httpsUrl(links.api)) return invalid()
  return { publicId: neighbor.publicId, title: neighbor.title, relation: neighbor.relation, aihotUrl: links.aihot, apiUrl: links.api }
}

function reportEntry(value: unknown, kind: AihotReport['kind']): AihotReportEntry {
  const entry = object(value); const links = object(entry.links); const key = entry[reportKey(kind)]
  const headline = kind === 'daily' ? entry.leadTitle : entry.headline
  if (!nonempty(key) || !dateTime(entry.generatedAt) || !nullableString(headline) || !httpsUrl(links.aihot)
    || (kind !== 'daily' && (!nullableString(entry.periodStart) || !nullableString(entry.periodEnd)))) return invalid()
  return { key, generatedAt: entry.generatedAt, headline: headline as string | null, periodStart: kind === 'daily' ? key : entry.periodStart as string | null,
    periodEnd: kind === 'daily' ? key : entry.periodEnd as string | null, aihotUrl: links.aihot }
}

function reportContentItem(value: unknown): AihotReport['sections'][number]['items'][number] {
  const item = object(value); const source = object(item.source); const links = object(item.links)
  if (!nonempty(item.title) || typeof item.summary !== 'string' || !nonempty(source.name) || !httpsUrl(links.original)
    || (item.publishedAt !== undefined && !nullableDateTime(item.publishedAt))) return invalid()
  return { title: item.title, summary: item.summary as string, sourceName: source.name,
    publishedAt: item.publishedAt as string | null ?? null, aihotUrl: optionalHttps(links.aihot), originalUrl: links.original }
}

function reportPath(kind: AihotReport['kind']): string { return kind === 'daily' ? 'dailies' : kind === 'weekly' ? 'weeklies' : 'monthlies' }
function reportKey(kind: AihotReport['kind']): string { return kind === 'daily' ? 'date' : kind === 'weekly' ? 'week' : 'month' }
function object(value: unknown): Record<string, unknown> { if (typeof value !== 'object' || value === null || Array.isArray(value)) return invalid(); return value as Record<string, unknown> }
function nonempty(value: unknown): value is string { return typeof value === 'string' && value.length > 0 }
function nullableString(value: unknown): boolean { return value === null || typeof value === 'string' }
function nullableScore(value: unknown): boolean { return value === null || typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 }
function boundedInteger(value: unknown, min: number, max: number): value is number { return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max }
function dateTime(value: unknown): value is string { return nonempty(value) && Number.isFinite(Date.parse(value)) }
function nullableDateTime(value: unknown): boolean { return value === null || dateTime(value) }
function httpsUrl(value: unknown): value is string { if (!nonempty(value)) return false; try { return new URL(value).protocol === 'https:' } catch { return false } }
function optionalHttps(value: unknown): string | null { if (value === undefined || value === null) return null; if (!httpsUrl(value)) return invalid(); return value }
function invalid(): never { throw new RadarApiFailure('schema', 'AIHOT response did not match the public API schema.') }
function badRequest(): never { throw new RadarApiFailure('schema', 'Invalid AIHOT public API query.') }
