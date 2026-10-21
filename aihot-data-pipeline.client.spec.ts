import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearRadarApiCache } from '../src/client/skeleton/aihot-radar-adapter.ts'
import {
  collectAihotItems,
  createAihotSnapshot,
  diffAihotSnapshots,
  normalizeAihotDataset,
} from '../src/client/skeleton/aihot-data-pipeline.ts'
import type { AihotItemsQuery, AihotPublicItem, AihotPublicStory } from '../src/client/skeleton/aihot-public-api.ts'

afterEach(() => { clearRadarApiCache(); vi.restoreAllMocks() })

const query: AihotItemsQuery = { mode: 'all', window: '7d', by: 'published', limit: 100, q: 'pipeline-test' }
const iso = '2026-10-16T01:00:00.000Z'

function item(id: string, overrides: Partial<AihotPublicItem> = {}): AihotPublicItem {
  return {
    id, title: `Title ${id}`, originalTitle: `Original ${id}`, summary: `Summary ${id}`, sourceName: 'Publisher',
    aihotUrl: `https://aihot.news/items/${id}`, originalUrl: `https://publisher.example/${id}`,
    publishedAt: iso, discoveredAt: iso, category: 'industry', score: 41, selected: true, reason: null,
    attribution: null, ...overrides,
  }
}

function officialItem(id: string, overrides: Partial<AihotPublicItem> = {}): Record<string, unknown> {
  const value = item(id, overrides)
  return {
    id: value.id, title: value.title, originalTitle: value.originalTitle, summary: value.summary,
    source: { name: value.sourceName }, links: { aihot: value.aihotUrl, original: value.originalUrl },
    publishedAt: value.publishedAt, discoveredAt: value.discoveredAt, category: value.category,
    score: value.score, selected: value.selected, reason: value.reason, attribution: value.attribution,
  }
}

function page(ids: readonly string[], nextCursor: string | null): Response {
  return json({ schemaVersion: 1, query: { mode: 'all', window: '7d', by: 'published', category: null, q: 'pipeline-test', ordering: 'publishedAtDesc' },
    items: ids.map(id => officialItem(id)), page: { count: ids.length, hasMore: nextCursor !== null, nextCursor } })
}

function json(value: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=60', ...headers } })
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

function story(id: string, reportId: string, originalUrl: string | null, overrides: Partial<AihotPublicStory> = {}): AihotPublicStory {
  return {
    publicId: id, title: `Story ${id}`, status: 'active', latest: 'Latest update', digest: null,
    firstReportAt: iso, latestAt: iso, sourceCount: 2, reportCount: 3,
    aihotUrl: `https://aihot.news/story/${id}`,
    reports: [{ id: reportId, title: `Report ${reportId}`, summary: null, sourceName: 'Publisher',
      publishedAt: iso, aihotUrl: `https://aihot.news/items/${reportId}`, originalUrl }],
    storyline: [], related: [], ...overrides,
  }
}

describe('AIHOT processing pipeline', () => {
  it('reads over 100 records through A1 cursors and reports identity and exact-URL duplicates', async () => {
    const firstIds = Array.from({ length: 100 }, (_, index) => `record-${index}`)
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (requestUrl(input).includes('cursor=page-2')) return page(['record-99', 'record-100'], null)
      const first = json({ schemaVersion: 1,
        query: { mode: 'all', window: '7d', by: 'published', category: null, q: 'pipeline-test', ordering: 'publishedAtDesc' },
        items: firstIds.map(id => officialItem(id, {
          originalUrl: id === 'record-98' ? 'https://publisher.example/shared' : `https://publisher.example/${id}`,
        })),
        page: { count: 100, hasMore: true, nextCursor: 'page-2' },
      })
      return first
    })
    const result = await collectAihotItems(query, {
      maxPages: 3, minRequestIntervalMs: 0, checkpointMaxAgeMs: 60_000, fetcher,
      now: () => 1_800_000_000_000,
    })
    expect(result.status).toBe('complete')
    expect(result.pagesCompleted).toBe(2)
    expect(result.records).toHaveLength(101)
    expect(result.duplicateCounts).toEqual({ itemId: 1, originalUrl: 0 })
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(requestUrl(fetcher.mock.calls[1]![0])).toContain('cursor=page-2')
  })

  it('returns a page-limit checkpoint and resumes from that cursor without rereading page one', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => requestUrl(input).includes('cursor=page-2')
      ? page(['second'], null)
      : page(['first'], 'page-2'))
    const limits = { maxPages: 1, minRequestIntervalMs: 0, checkpointMaxAgeMs: 60_000, fetcher, now: () => 1000 }
    const limited = await collectAihotItems(query, limits)
    expect(limited.status).toBe('page_limit')
    expect(limited.checkpoint.cursor?.value).toBe('page-2')
    const resumed = await collectAihotItems(query, { ...limits, maxPages: 2, checkpoint: limited.checkpoint, now: () => 1001 })
    expect(resumed.status).toBe('complete')
    expect(resumed.records.map(record => record.itemId)).toEqual(['first', 'second'])
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('preserves successful pages and safely resumes after an HTTP failure', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (requestUrl(input).includes('cursor=page-2')) return json({ error: 'unavailable' }, 503)
      return page(['first'], 'page-2')
    })
    const limits = { maxPages: 3, minRequestIntervalMs: 0, checkpointMaxAgeMs: 60_000, fetcher, now: () => 1000 }
    const failed = await collectAihotItems(query, limits)
    expect(failed).toMatchObject({ status: 'failed', failure: { kind: 'http', status: 503 }, pagesCompleted: 1 })
    expect(failed.records.map(record => record.itemId)).toEqual(['first'])
    clearRadarApiCache()
    fetcher.mockImplementationOnce(async () => page(['second'], null))
    const resumed = await collectAihotItems(query, { ...limits, maxPages: 2, checkpoint: failed.checkpoint, now: () => 1001 })
    expect(resumed.status).toBe('complete')
    expect(resumed.records.map(record => record.itemId)).toEqual(['first', 'second'])
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('stops cursor loops, rejects mismatched or expired checkpoints, and honors request throttling', async () => {
    const loopFetcher = vi.fn(async () => page(['same'], 'page-2'))
    const loop = await collectAihotItems(query, {
      maxPages: 4, minRequestIntervalMs: 0, checkpointMaxAgeMs: 60_000, fetcher: loopFetcher, now: () => 1000,
    })
    expect(loop).toMatchObject({ status: 'failed', failure: { kind: 'cursor_loop' }, pagesCompleted: 2 })
    expect(loopFetcher).toHaveBeenCalledTimes(2)
    const onePage = await collectAihotItems(query, { maxPages: 1, minRequestIntervalMs: 0, checkpointMaxAgeMs: 60_000,
      fetcher: vi.fn(async () => page(['one'], 'page-2')), now: () => 1000 })
    const mismatch = await collectAihotItems({ ...query, category: 'industry' }, {
      maxPages: 1, minRequestIntervalMs: 0, checkpointMaxAgeMs: 60_000, checkpoint: onePage.checkpoint, now: () => 1001,
    })
    const expired = await collectAihotItems(query, {
      maxPages: 1, minRequestIntervalMs: 0, checkpointMaxAgeMs: 10, checkpoint: onePage.checkpoint, now: () => 2000,
    })
    expect(mismatch.failure?.kind).toBe('checkpoint_mismatch')
    expect(expired.failure?.kind).toBe('checkpoint_expired')

    const waits: number[] = []
    let clock = 1000
    await collectAihotItems(query, { maxPages: 2, minRequestIntervalMs: 250, checkpointMaxAgeMs: 60_000,
      fetcher: vi.fn(async (input: RequestInfo | URL) => requestUrl(input).includes('cursor=page-2')
        ? page(['second'], null)
        : page(['first'], 'page-2')),
      now: () => clock, wait: async (milliseconds) => { waits.push(milliseconds); clock += milliseconds } })
    expect(waits).toEqual([250])
  })

  it('keeps cancellation distinct and does not make another request', async () => {
    const controller = new AbortController()
    const fetcher = vi.fn(async () => page(['one'], 'page-2'))
    const wait = async () => { controller.abort() }
    const result = await collectAihotItems(query, {
      maxPages: 3, minRequestIntervalMs: 1, checkpointMaxAgeMs: 60_000,
      signal: controller.signal, fetcher, now: () => 1000, wait,
    })
    expect(result.status).toBe('interrupted')
    expect(result.failure?.kind).toBe('aborted')
    expect(result.records.map(record => record.itemId)).toEqual(['one'])
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('normalizes official provenance, deduplicates IDs and URLs, and leaves title-only links unconfirmed', () => {
    const sameUrl = 'https://publisher.example/shared'
    const items = [
      item('one', { title: 'Shared title', originalUrl: sameUrl }),
      item('two', { title: 'Shared title', originalUrl: sameUrl }),
      item('three', { title: 'Same text, unrelated item', originalUrl: 'https://publisher.example/three' }),
      item('four', { originalUrl: 'https://publisher.example/four' }),
    ]
    const stories = [
      story('story-1', 'one', sameUrl),
      story('story-2', 'one', 'https://publisher.example/not-three'),
      story('story-3', 'four', 'https://publisher.example/different'),
    ]
    const possible = [{ itemId: 'three', storyId: 'story-2', basis: 'title/time candidate only', status: 'needs_review' as const }]
    const dataset = normalizeAihotDataset(items, stories, iso, possible)
    expect(dataset.items).toHaveLength(4)
    expect(dataset.uniqueArticles).toHaveLength(3)
    expect(dataset.duplicateCounts).toEqual({ itemId: 0, originalUrl: 1 })
    expect(dataset.confirmedAssociations).toEqual([
      { itemId: 'two', storyId: 'story-1', basis: 'exact_original_url' },
      { itemId: 'four', storyId: 'story-3', basis: 'official_report_id' },
    ])
    expect(dataset.ambiguousStoryItemIds).toEqual(['one'])
    expect(dataset.items.find(entry => entry.itemId === 'one')?.storyId).toBeNull()
    expect(dataset.items.find(entry => entry.itemId === 'two')?.storyId).toBe('story-1')
    expect(dataset.possibleAssociations).toEqual(possible)
    expect(dataset.items[0]?.dataUpdatedAt).toBe(iso)
    expect(dataset.items[0]?.observedAt).toBe(iso)
    expect(dataset.items[0]?.fieldSources.updatedAt).toContain('discoveredAt')
    expect(dataset.items[0]?.officialMetrics.score.semantics).toContain('not defined')
    expect(dataset.stories[0]?.officialMetrics).toEqual({
      sourceCount: { value: 2, source: 'GET /stories/{publicId}.story.sourceCount' },
      reportCount: { value: 3, source: 'GET /stories/{publicId}.story.reportCount' },
    })
    expect(dataset.stories[0]?.fieldSources.updatedAt).toBeNull()
  })

  it('diffs two snapshots into new, existing, and updated Items and Stories', () => {
    const beforeDataset = normalizeAihotDataset([item('keep'), item('update')], [story('stay', 'keep', item('keep').originalUrl), story('change', 'update', item('update').originalUrl)], iso)
    const afterDataset = normalizeAihotDataset([item('keep'), item('update', { title: 'Updated title' }), item('new')],
      [story('stay', 'keep', item('keep').originalUrl), story('change', 'update', item('update').originalUrl, { latest: 'Changed latest' }), story('new-story', 'new', item('new').originalUrl)], '2026-10-17T01:00:00Z')
    const before = createAihotSnapshot(beforeDataset, iso)
    const after = createAihotSnapshot(afterDataset, '2026-10-17T01:00:00Z')
    const diff = diffAihotSnapshots(before, after)
    expect(diff.items.new.map(entry => entry.itemId)).toEqual(['new'])
    expect(diff.items.existing.map(entry => entry.itemId)).toEqual(['keep'])
    expect(diff.items.updated.map(entry => entry.itemId)).toEqual(['update'])
    expect(diff.stories.new.map(entry => entry.storyId)).toEqual(['new-story'])
    expect(diff.stories.existing.map(entry => entry.storyId)).toEqual(['stay'])
    expect(diff.stories.updated.map(entry => entry.storyId)).toEqual(['change'])
  })
})
