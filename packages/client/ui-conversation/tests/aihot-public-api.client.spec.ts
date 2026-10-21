import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearRadarApiCache } from '../src/client/skeleton/aihot-radar-adapter.ts'
import { loadAihotItems, loadAihotItemsBatch, loadAihotReport, loadAihotReportIndex, loadAihotSelectedChanges, loadAihotSelectedSnapshot, loadAihotStory } from '../src/client/skeleton/aihot-public-api.ts'

afterEach(() => { clearRadarApiCache(); vi.restoreAllMocks() })

const item = (id: string) => ({
  id, title: `Title ${id}`, originalTitle: null, summary: 'Official summary', source: { name: 'Publisher' },
  links: { aihot: `https://aihot.news/items/${id}`, original: `https://publisher.example/${id}` },
  publishedAt: '2026-10-16T00:00:00Z', discoveredAt: '2026-10-16T01:00:00Z', category: 'industry', score: 50,
  selected: true, reason: 'Published reason', attribution: { name: 'AIHOT', url: 'https://aihot.news' },
})
const json = (value: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=60', ETag: '"etag-1"', ...headers },
})
const itemsResponse = (ids: readonly string[], nextCursor: string | null = null, category: string | null = null, q: string | null = null) => ({
  schemaVersion: 1, query: { mode: 'all', window: '7d', by: 'timeline', category, q, ordering: 'timelineDesc' },
  items: ids.map(item), page: { count: ids.length, hasMore: nextCursor !== null, nextCursor },
})

describe('AIHOT official public API', () => {
  it('preserves every category, query filter and query-bound cursor without cross-query reuse', async () => {
    const fetcher = vi.fn(async () => json(itemsResponse(['one'], 'next', 'industry', 'AI')))
    const query = { mode: 'all', window: '7d', category: 'industry', q: ' AI ' } as const
    const first = await loadAihotItems(query, undefined, fetcher)
    expect(first.items[0]).toMatchObject({ id: 'one', sourceName: 'Publisher', reason: 'Published reason', originalUrl: 'https://publisher.example/one' })
    expect(first.nextCursor).not.toBeNull()
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('category=industry')
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('q=AI')
    await loadAihotItems(query, first.nextCursor!, fetcher)
    expect(String(fetcher.mock.calls[1]?.[0])).toContain('cursor=next')
    await expect(loadAihotItems({ ...query, category: 'paper' }, first.nextCursor!, fetcher)).rejects.toMatchObject({ kind: 'schema' })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('supports all six official categories and rejects invalid search/limits', async () => {
    for (const category of ['ai-models', 'ai-products', 'industry', 'paper', 'tip', 'opinion'] as const) {
      const fetcher = vi.fn(async () => json(itemsResponse([], null, category)))
      await loadAihotItems({ mode: 'all', window: '7d', category }, undefined, fetcher)
    }
    await expect(loadAihotItems({ mode: 'all', window: '7d', q: 'A' })).rejects.toMatchObject({ kind: 'schema' })
    await expect(loadAihotItems({ mode: 'all', window: '7d', limit: 101 })).rejects.toMatchObject({ kind: 'schema' })
  })

  it('pages with the returned cursor and deduplicates IDs', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => json(String(input).includes('cursor=next')
      ? itemsResponse(['one', 'two']) : itemsResponse(['one'], 'next')))
    const result = await loadAihotItemsBatch({ mode: 'all', window: '7d' }, 2, fetcher)
    expect(result.map(entry => entry.id)).toEqual(['one', 'two'])
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('reuses ETag cache and handles 304 plus 429 without automatic retries', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => json(itemsResponse(['one'])))
    await loadAihotItems({ mode: 'all', window: '7d' }, undefined, fetcher)
    await loadAihotItems({ mode: 'all', window: '7d' }, undefined, fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 61_000)
    fetcher.mockImplementationOnce(async (_input, init) => {
      expect((init?.headers as Record<string, string>)['If-None-Match']).toBe('"etag-1"')
      return new Response(null, { status: 304, headers: { 'Cache-Control': 'public, s-maxage=60' } })
    })
    expect((await loadAihotItems({ mode: 'all', window: '7d' }, undefined, fetcher)).items).toHaveLength(1)
    clearRadarApiCache()
    const limited = vi.fn(async () => json({}, 429, { 'Retry-After': '120' }))
    await expect(loadAihotItems({ mode: 'all', window: '7d' }, undefined, limited)).rejects.toMatchObject({ kind: 'rate_limit', status: 429, retryAfterSeconds: 120 })
    expect(limited).toHaveBeenCalledTimes(1)
    await expect(loadAihotItems({ mode: 'all', window: '7d' }, undefined, limited)).rejects.toMatchObject({ kind: 'rate_limit' })
    expect(limited).toHaveBeenCalledTimes(1)
  })

  it('coalesces simultaneous reads of the same official query', async () => {
    const fetcher = vi.fn(async () => json(itemsResponse(['one'])))
    const query = { mode: 'all', window: '7d' } as const
    const [first, second] = await Promise.all([loadAihotItems(query, undefined, fetcher), loadAihotItems(query, undefined, fetcher)])
    expect(first.items[0]?.id).toBe(second.items[0]?.id)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('reads story reports, timeline and related events without writes', async () => {
    const fetcher = vi.fn(async () => json({ schemaVersion: 1, story: {
      publicId: 's1', title: 'Story', status: 'active', sourceCount: 1, reportCount: 1,
      firstReportAt: '2026-10-16T00:00:00Z', latestAt: '2026-10-16T01:00:00Z', latest: 'Latest', digest: 'Digest',
      links: { aihot: 'https://aihot.news/story/s1' }, reports: [{ id: 'i1', title: 'Report', summary: 'Summary',
        source: { name: 'Publisher', firstParty: false }, publishedAt: '2026-10-16T00:00:00Z',
        links: { aihot: 'https://aihot.news/items/i1', original: 'https://publisher.example/i1' } }],
      storyline: [{ publicId: 's0', title: 'Earlier', relation: 'previous', links: { aihot: 'https://aihot.news/story/s0', api: 'https://aihot.news/api/v1/stories/s0' } }], related: [],
    } }))
    const story = await loadAihotStory('s1', fetcher)
    expect(story.reports).toHaveLength(1)
    expect(story.storyline[0]?.publicId).toBe('s0')
    expect(fetcher.mock.calls[0]?.[1]?.method).toBe('GET')
  })

  it('reads daily, weekly and monthly indexes and details', async () => {
    for (const kind of ['daily', 'weekly', 'monthly'] as const) {
      const key = kind === 'daily' ? '2026-10-16' : kind === 'weekly' ? '2026-W42' : '2026-10'
      const index = vi.fn(async () => json({ schemaVersion: 1, count: 1, items: [{
        [kind === 'daily' ? 'date' : kind === 'weekly' ? 'week' : 'month']: key,
        generatedAt: '2026-10-16T00:00:00Z', leadTitle: 'Daily lead', headline: 'Period lead',
        periodStart: '2026-10-01', periodEnd: '2026-10-16', links: { aihot: 'https://aihot.news/' },
      }] }))
      expect(await loadAihotReportIndex(kind, 1, index)).toHaveLength(1)
      const detail = vi.fn(async () => json({ schemaVersion: 1, report: {
        [kind === 'daily' ? 'date' : kind === 'weekly' ? 'week' : 'month']: key,
        generatedAt: '2026-10-16T00:00:00Z', windowStart: '2026-10-15T00:00:00Z', windowEnd: '2026-10-16T00:00:00Z',
        links: { aihot: 'https://aihot.news/' }, lead: { title: 'Daily lead', leadParagraph: 'Overview' },
        headline: 'Period lead', overview: 'Overview', sections: [{ label: 'Section', summary: null, items: [{
          title: 'Item', summary: 'Summary', source: { name: 'Publisher' }, links: { aihot: null, original: 'https://publisher.example/i1' },
        }] }], flashes: [],
      } }))
      const result = await loadAihotReport(kind, 'latest', detail)
      expect(result.sections[0]?.items).toHaveLength(1)
      expect(result.sections[0]?.items[0]).toMatchObject({ originalUrl: 'https://publisher.example/i1', aihotUrl: null })
    }
  })

  it('reads bounded selected snapshot and changes, and reports a reset requirement', async () => {
    const snapshot = vi.fn(async () => json({ schemaVersion: 1, asOf: '2026-10-16T00:00:00Z', fields: 'default',
      cursor: 'sync', count: 1, hasMore: false, nextPage: null, items: [item('one')] }))
    expect((await loadAihotSelectedSnapshot(undefined, snapshot)).cursor).toBe('sync')
    const changes = vi.fn(async () => json({ schemaVersion: 1, fields: 'default', cursor: 'sync2', count: 2, hasMore: false,
      changes: [{ op: 'upsert', changedAt: '2026-10-16T00:00:00Z', item: item('one') }, { op: 'remove', changedAt: '2026-10-16T01:00:00Z', id: 'two' }] }))
    expect((await loadAihotSelectedChanges('sync', changes)).changes.map(change => change.op)).toEqual(['upsert', 'remove'])
    clearRadarApiCache()
    await expect(loadAihotSelectedChanges('sync', async () => json({}, 409))).rejects.toMatchObject({ kind: 'snapshot_required', status: 409 })
  })
})
