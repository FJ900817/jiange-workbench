import { RadarApiFailure } from './aihot-radar-adapter.ts'
import {
  loadAihotItems,
  type AihotItemsCursor,
  type AihotItemsQuery,
  type AihotPublicItem,
  type AihotPublicStory,
} from './aihot-public-api.ts'

const MAX_PIPELINE_PAGES = 10

/** Field-level origins retained by normalized public records. */
export interface AihotFieldSources {
  readonly identity: string
  readonly title: string
  readonly publishedAt: string
  readonly source: string
  readonly originalUrl: string
  readonly summary: string
  readonly category: string
  readonly statistics: string
  readonly updatedAt: string
  readonly storyId: string | null
}

/** Field-level origins retained by normalized public Stories. */
export interface AihotStoryFieldSources {
  readonly identity: 'GET /stories/{publicId}.story.publicId'
  readonly title: 'GET /stories/{publicId}.story.title'
  readonly status: 'GET /stories/{publicId}.story.status'
  readonly summary: 'GET /stories/{publicId}.story.latest and digest'
  readonly timeline: 'GET /stories/{publicId}.story.firstReportAt, latestAt, and reports'
  readonly sourceReports: 'GET /stories/{publicId}.story.reports'
  readonly statistics: 'GET /stories/{publicId}.story.sourceCount and reportCount'
  readonly updatedAt: null
}

/** One AIHOT item with source fields, official metrics, and observation time kept explicit. */
export interface AihotNormalizedItem {
  readonly itemId: string
  readonly storyId: string | null
  readonly title: string
  readonly originalTitle: string | null
  readonly publishedAt: string | null
  readonly sourceName: string
  readonly originalUrl: string | null
  readonly aihotUrl: string
  readonly summary: string | null
  readonly category: string | null
  readonly officialMetrics: {
    readonly score: { readonly value: number | null; readonly source: 'GET /items.items[].score'; readonly semantics: 'AIHOT field; comparative meaning is not defined by the public schema' }
    readonly selected: { readonly value: boolean; readonly source: 'GET /items.items[].selected' }
  }
  readonly reason: string | null
  readonly attribution: AihotPublicItem['attribution']
  readonly dataUpdatedAt: string
  readonly observedAt: string
  readonly fieldSources: AihotFieldSources
}

/** A normalized official Story and its source-report timeline. */
export interface AihotNormalizedStory {
  readonly storyId: string
  readonly title: string
  readonly status: AihotPublicStory['status']
  readonly latest: string
  readonly digest: string | null
  readonly firstReportAt: string
  readonly latestAt: string
  readonly aihotUrl: string
  readonly reports: AihotPublicStory['reports']
  readonly officialMetrics: {
    readonly sourceCount: { readonly value: number; readonly source: 'GET /stories/{publicId}.story.sourceCount' }
    readonly reportCount: { readonly value: number; readonly source: 'GET /stories/{publicId}.story.reportCount' }
  }
  readonly observedAt: string
  readonly fieldSources: AihotStoryFieldSources
}

/** A possible association supplied by a caller; it never assigns an official Story ID. */
export interface AihotPossibleAssociation {
  readonly itemId: string
  readonly storyId: string
  readonly basis: string
  readonly status: 'needs_review'
}

/** An official Item-to-Story correspondence established from a report identifier or exact source URL. */
export interface AihotConfirmedAssociation {
  readonly itemId: string
  readonly storyId: string
  readonly basis: 'official_report_id' | 'exact_original_url'
}

/** Standardized records, canonical article groups, and explicit official/possible links. */
export interface AihotProcessedDataset {
  readonly items: readonly AihotNormalizedItem[]
  readonly uniqueArticles: readonly AihotNormalizedItem[]
  readonly stories: readonly AihotNormalizedStory[]
  readonly confirmedAssociations: readonly AihotConfirmedAssociation[]
  readonly possibleAssociations: readonly AihotPossibleAssociation[]
  readonly ambiguousStoryItemIds: readonly string[]
  readonly duplicateCounts: { readonly itemId: number; readonly originalUrl: number }
}

/** A serializable in-memory checkpoint for resuming one query within its relative time window. */
export interface AihotCollectionCheckpoint {
  readonly queryKey: string
  readonly cursor: AihotItemsCursor | null
  readonly records: readonly AihotNormalizedItem[]
  readonly seenCursors: readonly string[]
  readonly pagesCompleted: number
  readonly duplicateItemIdCount: number
  readonly startedAt: number
  readonly lastRequestAt: number | null
  readonly cursorLoopDetected: boolean
}

/** Non-sensitive failure metadata returned without losing the successful-page checkpoint. */
export interface AihotCollectionFailure {
  readonly kind: RadarApiFailure['kind'] | 'aborted' | 'unknown' | 'cursor_loop' | 'checkpoint_mismatch' | 'checkpoint_expired'
  readonly status: number | null
  readonly retryAfterSeconds: number | null
}

/** Result of one bounded sequential page-collection run. */
export interface AihotCollectionResult {
  readonly status: 'complete' | 'page_limit' | 'failed' | 'interrupted'
  readonly records: readonly AihotNormalizedItem[]
  readonly pagesThisRun: number
  readonly pagesCompleted: number
  readonly hasMore: boolean
  readonly checkpoint: AihotCollectionCheckpoint
  readonly failure: AihotCollectionFailure | null
  readonly duplicateCounts: { readonly itemId: number; readonly originalUrl: number }
}

/** Collection controls; callers choose page, throttle, and checkpoint expiry limits for each run. */
export interface AihotCollectionOptions {
  readonly maxPages: number
  readonly minRequestIntervalMs: number
  readonly checkpointMaxAgeMs: number
  readonly checkpoint?: AihotCollectionCheckpoint
  readonly signal?: AbortSignal
  readonly fetcher?: typeof fetch
  readonly now?: () => number
  readonly wait?: (milliseconds: number, signal?: AbortSignal) => Promise<void>
}

/** A normalized snapshot used to compare successive bounded reads without implying deletions. */
export interface AihotDataSnapshot {
  readonly schemaVersion: 1
  readonly observedAt: string
  readonly items: readonly AihotNormalizedItem[]
  readonly stories: readonly AihotNormalizedStory[]
}

/** Counts additions, unchanged records, and field changes by official Item and Story identity. */
export interface AihotSnapshotDiff {
  readonly items: {
    readonly new: readonly AihotNormalizedItem[]
    readonly existing: readonly AihotNormalizedItem[]
    readonly updated: readonly AihotNormalizedItem[]
  }
  readonly stories: {
    readonly new: readonly AihotNormalizedStory[]
    readonly existing: readonly AihotNormalizedStory[]
    readonly updated: readonly AihotNormalizedStory[]
  }
}

/** Reads bounded sequential pages through A1, preserving successful data and a query-bound resume cursor. */
export async function collectAihotItems(query: AihotItemsQuery, options: AihotCollectionOptions): Promise<AihotCollectionResult> {
  if (!integer(options.maxPages, 1, MAX_PIPELINE_PAGES) || !integer(options.minRequestIntervalMs, 0, 3_600_000)
    || !integer(options.checkpointMaxAgeMs, 1, 86_400_000)) throw new TypeError('Invalid AIHOT collection limits.')

  const now = options.now ?? Date.now
  const wait = options.wait ?? waitForInterval
  const fetcher = options.fetcher ?? fetch
  const key = queryKey(query)
  const start = options.checkpoint ?? emptyCheckpoint(key, now())
  if (start.cursorLoopDetected) {
    return result('failed', start, 0, { kind: 'cursor_loop', status: null, retryAfterSeconds: null })
  }
  if (start.queryKey !== key || (start.cursor !== null && start.cursor.queryKey !== key)) {
    return result('failed', start, 0, { kind: 'checkpoint_mismatch', status: null, retryAfterSeconds: null })
  }
  if (now() - start.startedAt > options.checkpointMaxAgeMs) {
    return result('failed', start, 0, { kind: 'checkpoint_expired', status: null, retryAfterSeconds: null })
  }

  let checkpoint = start
  let pagesThisRun = 0
  for (; pagesThisRun < options.maxPages; pagesThisRun++) {
    if (options.signal?.aborted) return result('interrupted', checkpoint, pagesThisRun, { kind: 'aborted', status: null, retryAfterSeconds: null })
    const cursorToRead = checkpoint.cursor
    if (cursorToRead !== null && checkpoint.seenCursors.includes(cursorToRead.value)) {
      return result('failed', { ...checkpoint, cursorLoopDetected: true }, pagesThisRun, { kind: 'cursor_loop', status: null, retryAfterSeconds: null })
    }
    try {
      if (checkpoint.lastRequestAt !== null) {
        const remaining = options.minRequestIntervalMs - (now() - checkpoint.lastRequestAt)
        if (remaining > 0) await wait(remaining, options.signal)
      }
      if (options.signal?.aborted) return result('interrupted', checkpoint, pagesThisRun, { kind: 'aborted', status: null, retryAfterSeconds: null })
      const requestedAt = now()
      const page = await loadAihotItems(query, cursorToRead ?? undefined, fetcher)
      const normalized = page.items.map(item => normalizeAihotItem(item, new Date(requestedAt).toISOString()))
      const merged = mergeByItemId(checkpoint.records, normalized)
      const seenCursors = cursorToRead === null ? checkpoint.seenCursors : [...checkpoint.seenCursors, cursorToRead.value]
      const next = page.nextCursor
      const loops = next !== null && seenCursors.includes(next.value)
      checkpoint = {
        ...checkpoint,
        cursor: next,
        records: merged.records,
        seenCursors,
        pagesCompleted: checkpoint.pagesCompleted + 1,
        duplicateItemIdCount: checkpoint.duplicateItemIdCount + merged.duplicates,
        lastRequestAt: requestedAt,
        cursorLoopDetected: loops,
      }
      if (loops) return result('failed', checkpoint, pagesThisRun + 1, { kind: 'cursor_loop', status: null, retryAfterSeconds: null })
      if (next === null) return result('complete', checkpoint, pagesThisRun + 1, null)
    } catch (error) {
      const failedAt = now()
      checkpoint = { ...checkpoint, lastRequestAt: failedAt }
      if (options.signal?.aborted) return result('interrupted', checkpoint, pagesThisRun, { kind: 'aborted', status: null, retryAfterSeconds: null })
      return result('failed', checkpoint, pagesThisRun, safeFailure(error))
    }
  }
  return result(checkpoint.cursor === null ? 'complete' : 'page_limit', checkpoint, pagesThisRun, null)
}

/** Standardizes A1 records and joins Story reports only through official identifiers or exact URLs. */
export function normalizeAihotDataset(
  items: readonly AihotPublicItem[],
  stories: readonly AihotPublicStory[],
  observedAt: string,
  possibleAssociations: readonly AihotPossibleAssociation[] = [],
): AihotProcessedDataset {
  const normalizedStories = dedupeStories(stories.map(story => normalizeAihotStory(story, observedAt)))
  const normalizedItems = dedupeItems(items.map(item => normalizeAihotItem(item, observedAt)))
  const storyMatches = new Map<string, AihotConfirmedAssociation[]>()
  for (const item of normalizedItems.items) {
    for (const story of stories) {
      const report = story.reports.find(entry => entry.id === item.itemId
        || (item.originalUrl !== null && entry.originalUrl === item.originalUrl))
      if (report === undefined) continue
      const basis = report.id === item.itemId ? 'official_report_id' : 'exact_original_url'
      const matches = storyMatches.get(item.itemId) ?? []
      if (!matches.some(entry => entry.storyId === story.publicId)) matches.push({ itemId: item.itemId, storyId: story.publicId, basis })
      storyMatches.set(item.itemId, matches)
    }
  }
  const ambiguousStoryItemIds = [...storyMatches].filter(([, matches]) => matches.length > 1).map(([itemId]) => itemId)
  const confirmedAssociations = [...storyMatches.values()].flat().filter(link => !ambiguousStoryItemIds.includes(link.itemId))
  const storyByItem = new Map(confirmedAssociations.map(link => [link.itemId, link.storyId]))
  const itemsWithStories = normalizedItems.items.map(item => ({
    ...item,
    storyId: storyByItem.get(item.itemId) ?? null,
    fieldSources: { ...item.fieldSources, storyId: storyByItem.has(item.itemId) ? 'official Story report identity match' : null },
  }))
  const storiesById = new Set(normalizedStories.map(story => story.storyId))
  const itemIds = new Set(itemsWithStories.map(item => item.itemId))
  const checkedPossible = possibleAssociations.filter(link => itemIds.has(link.itemId) && storiesById.has(link.storyId))
  const uniqueArticles = dedupeByOriginalUrl(itemsWithStories)
  return {
    items: itemsWithStories,
    uniqueArticles: uniqueArticles.items,
    stories: normalizedStories,
    confirmedAssociations,
    possibleAssociations: checkedPossible,
    ambiguousStoryItemIds,
    duplicateCounts: {
      itemId: normalizedItems.duplicates,
      originalUrl: uniqueArticles.duplicates,
    },
  }
}

/** Creates an immutable comparison input; rolling-window omissions are not treated as deletions. */
export function createAihotSnapshot(dataset: AihotProcessedDataset, observedAt: string): AihotDataSnapshot {
  return { schemaVersion: 1, observedAt, items: dataset.items, stories: dataset.stories }
}

/** Compares official IDs and business fields, ignoring only local observation timestamps. */
export function diffAihotSnapshots(before: AihotDataSnapshot, after: AihotDataSnapshot): AihotSnapshotDiff {
  return {
    items: diffById(before.items, after.items, item => item.itemId, item => itemComparison(item)),
    stories: diffById(before.stories, after.stories, story => story.storyId, story => storyComparison(story)),
  }
}

function normalizeAihotItem(item: AihotPublicItem, observedAt: string): AihotNormalizedItem {
  return {
    itemId: item.id,
    storyId: null,
    title: item.title,
    originalTitle: item.originalTitle,
    publishedAt: item.publishedAt,
    sourceName: item.sourceName,
    originalUrl: item.originalUrl,
    aihotUrl: item.aihotUrl,
    summary: item.summary,
    category: item.category,
    officialMetrics: {
      score: { value: item.score, source: 'GET /items.items[].score', semantics: 'AIHOT field; comparative meaning is not defined by the public schema' },
      selected: { value: item.selected, source: 'GET /items.items[].selected' },
    },
    reason: item.reason,
    attribution: item.attribution,
    dataUpdatedAt: item.discoveredAt,
    observedAt,
    fieldSources: {
      identity: 'GET /items.items[].id',
      title: 'GET /items.items[].title and originalTitle',
      publishedAt: 'GET /items.items[].publishedAt',
      source: 'GET /items.items[].source.name',
      originalUrl: 'GET /items.items[].links.original',
      summary: 'GET /items.items[].summary',
      category: 'GET /items.items[].category',
      statistics: 'GET /items.items[].score and selected',
      updatedAt: 'GET /items.items[].discoveredAt; this is not an edit timestamp',
      storyId: null,
    },
  }
}

function normalizeAihotStory(story: AihotPublicStory, observedAt: string): AihotNormalizedStory {
  return {
    storyId: story.publicId,
    title: story.title,
    status: story.status,
    latest: story.latest,
    digest: story.digest,
    firstReportAt: story.firstReportAt,
    latestAt: story.latestAt,
    aihotUrl: story.aihotUrl,
    reports: story.reports,
    officialMetrics: {
      sourceCount: { value: story.sourceCount, source: 'GET /stories/{publicId}.story.sourceCount' },
      reportCount: { value: story.reportCount, source: 'GET /stories/{publicId}.story.reportCount' },
    },
    observedAt,
    fieldSources: {
      identity: 'GET /stories/{publicId}.story.publicId',
      title: 'GET /stories/{publicId}.story.title',
      status: 'GET /stories/{publicId}.story.status',
      summary: 'GET /stories/{publicId}.story.latest and digest',
      timeline: 'GET /stories/{publicId}.story.firstReportAt, latestAt, and reports',
      sourceReports: 'GET /stories/{publicId}.story.reports',
      statistics: 'GET /stories/{publicId}.story.sourceCount and reportCount',
      updatedAt: null,
    },
  }
}

function dedupeItems(items: readonly AihotNormalizedItem[]): { items: AihotNormalizedItem[]; duplicates: number } {
  const result = new Map<string, AihotNormalizedItem>()
  let duplicates = 0
  for (const item of items) {
    if (result.has(item.itemId)) duplicates++
    result.set(item.itemId, item)
  }
  return { items: [...result.values()], duplicates }
}

function dedupeStories(stories: readonly AihotNormalizedStory[]): AihotNormalizedStory[] {
  const result = new Map<string, AihotNormalizedStory>()
  for (const story of stories) result.set(story.storyId, story)
  return [...result.values()]
}

function dedupeByOriginalUrl(items: readonly AihotNormalizedItem[]): { items: AihotNormalizedItem[]; duplicates: number } {
  const firstByUrl = new Map<string, string>()
  const result: AihotNormalizedItem[] = []
  let duplicates = 0
  for (const item of items) {
    const key = item.originalUrl
    if (key === null) {
      result.push(item)
    } else if (!firstByUrl.has(key)) {
      firstByUrl.set(key, item.itemId)
      result.push(item)
    } else {
      duplicates++
    }
  }
  return { items: result, duplicates }
}

function mergeByItemId(
  existing: readonly AihotNormalizedItem[],
  incoming: readonly AihotNormalizedItem[],
): { records: AihotNormalizedItem[]; duplicates: number } {
  const values = new Map(existing.map(item => [item.itemId, item]))
  let duplicates = 0
  for (const item of incoming) {
    if (values.has(item.itemId)) duplicates++
    values.set(item.itemId, item)
  }
  return { records: [...values.values()], duplicates }
}

function result(
  status: AihotCollectionResult['status'],
  checkpoint: AihotCollectionCheckpoint,
  pagesThisRun: number,
  failure: AihotCollectionFailure | null,
): AihotCollectionResult {
  return {
    status,
    records: checkpoint.records,
    pagesThisRun,
    pagesCompleted: checkpoint.pagesCompleted,
    hasMore: checkpoint.cursor !== null,
    checkpoint,
    failure,
    duplicateCounts: { itemId: checkpoint.duplicateItemIdCount, originalUrl: dedupeByOriginalUrl(checkpoint.records).duplicates },
  }
}

function safeFailure(error: unknown): AihotCollectionFailure {
  if (error instanceof RadarApiFailure) return { kind: error.kind, status: error.status, retryAfterSeconds: error.retryAfterSeconds }
  return { kind: 'unknown', status: null, retryAfterSeconds: null }
}

function emptyCheckpoint(queryKey: string, startedAt: number): AihotCollectionCheckpoint {
  return {
    queryKey,
    cursor: null,
    records: [],
    seenCursors: [],
    pagesCompleted: 0,
    duplicateItemIdCount: 0,
    startedAt,
    lastRequestAt: null,
    cursorLoopDetected: false,
  }
}

function queryKey(query: AihotItemsQuery): string {
  const params = new URLSearchParams()
  params.set('mode', query.mode)
  params.set('window', query.window)
  params.set('by', query.by ?? 'timeline')
  if (query.category !== undefined) params.set('category', query.category)
  if (query.q !== undefined) params.set('q', query.q.trim())
  params.set('limit', String(query.limit ?? 50))
  return params.toString()
}

function diffById<T>(
  before: readonly T[],
  after: readonly T[],
  id: (value: T) => string,
  compare: (value: T) => string,
): { new: T[]; existing: T[]; updated: T[] } {
  const previous = new Map(before.map(value => [id(value), value]))
  const added: T[] = []
  const existing: T[] = []
  const updated: T[] = []
  for (const value of after) {
    const old = previous.get(id(value))
    if (old === undefined) added.push(value)
    else if (compare(old) === compare(value)) existing.push(value)
    else updated.push(value)
  }
  return { new: added, existing, updated }
}

function itemComparison(item: AihotNormalizedItem): string {
  const { observedAt: _observedAt, ...comparable } = item
  return JSON.stringify(comparable)
}

function storyComparison(story: AihotNormalizedStory): string {
  const { observedAt: _observedAt, ...comparable } = story
  return JSON.stringify(comparable)
}

function integer(value: number, minimum: number, maximum: number): boolean {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum
}

async function waitForInterval(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw signal.reason
  await new Promise<void>((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener('abort', abort)
      resolve()
    }
    const timer = setTimeout(finish, milliseconds)
    const abort = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      reject(new DOMException('Request interval wait was aborted.', 'AbortError'))
    }
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
  })
}
