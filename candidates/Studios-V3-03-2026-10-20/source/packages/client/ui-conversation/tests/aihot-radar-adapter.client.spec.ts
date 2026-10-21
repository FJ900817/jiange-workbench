import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearRadarApiCache, loadRadarSignals, loadRadarStoryDetails } from '../src/client/skeleton/aihot-radar-adapter.ts'

afterEach(() => { clearRadarApiCache(); vi.restoreAllMocks(); vi.useRealTimers() })

describe('AIHOT Radar read-only adapter', () => {
  it('projects repeated hot entries for one Story as one Signal with actual reports as Evidence', async () => {
    const fetcher = vi.fn(fetchResponse([
      hotTopic({ id: 'item-a', rank: 1, story: 'story-a' }),
      hotTopic({ id: 'item-b', rank: 2, story: 'story-a' }),
    ], [item({ id: 'item-a' })], storyResponse('story-a')))

    const references = await loadRadarSignals(fetcher)
    expect(references).toHaveLength(1)
    const [reference] = references
    const result = await loadRadarStoryDetails(reference!, fetcher)

    expect(result).toMatchObject({
      signalKey: 'story:story-a',
      kind: 'story',
      title: '真实 Story 标题',
      ranking: 1,
      sourceCount: 3,
      participationCount: 5,
      evidence: [{ evidenceId: 'report-a', sourceName: '来源 A' }],
    })
    expect(fetcher.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(true)
    expect(fetcher.mock.calls.every(([input]) => String(input).startsWith('https://aihot.news/api/v1/'))).toBe(true)
  })

  it('uses an Item-level fallback only when the public hot response has no Story link', async () => {
    const fetcher = vi.fn(fetchResponse([hotTopic({ id: 'item-a', rank: 1 })], [item({ id: 'item-a' })]))

    const [result] = await loadRadarSignals(fetcher)

    expect(result).toMatchObject({
      signalKey: 'item:item-a',
      kind: 'item',
      title: '真实 Item 标题',
      summary: '真实来源摘要',
      storyId: null,
      selected: true,
      evidence: [{ evidenceId: 'item-a', originalUrl: 'https://source.example/item-a' }],
    })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('rejects an invalid response schema rather than substituting fixture data', async () => {
    const fetcher = vi.fn(async () => response({ schemaVersion: 1, count: 'ten', items: [] }))

    await expect(loadRadarSignals(fetcher)).rejects.toMatchObject({ kind: 'schema' })
  })

  it('reports HTTP failures without making any write request', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('{}', { status: 503 }))

    await expect(loadRadarSignals(fetcher)).rejects.toMatchObject({ kind: 'http' })
    expect(fetcher.mock.calls.every(([, init]) => init?.method === 'GET')).toBe(true)
  })

  it('aborts a slow public request at the adapter timeout', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => { reject(init.signal?.reason) }, { once: true })
    }))

    const request = loadRadarSignals(fetcher)
    const rejection = expect(request).rejects.toMatchObject({ kind: 'timeout' })
    await vi.advanceTimersByTimeAsync(12_000)
    await rejection
  })

  it('keeps cached public responses within the advertised short cache window', async () => {
    const fetcher = vi.fn(fetchResponse([hotTopic({ id: 'item-a', rank: 1 })], [item({ id: 'item-a' })]))
    await loadRadarSignals(fetcher)
    await loadRadarSignals(fetcher)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})

function hotTopic({ id, rank, story }: { id: string; rank: number; story?: string }) {
  return {
    rank,
    id,
    title: `热点 ${id}`,
    source: { name: '来源 A' },
    links: {
      aihot: `https://aihot.news/items/${id}`,
      original: `https://source.example/${id}`,
      ...(story === undefined ? {} : { story: `https://aihot.virxact.com/story/${story}` }),
    },
    sourceCount: 3,
    signalCount: 4,
    participantCount: 5,
    sourceNames: ['来源 A', '来源 B', '来源 C'],
    latestAt: '2026-10-01T00:00:00.000Z',
  }
}

function item({ id }: { id: string }) {
  return {
    id,
    title: '真实 Item 标题',
    originalTitle: null,
    summary: '真实来源摘要',
    source: { name: '来源 A' },
    links: { aihot: `https://aihot.news/items/${id}`, original: `https://source.example/${id}` },
    publishedAt: '2026-10-01T00:00:00.000Z',
    discoveredAt: '2026-10-01T00:01:00.000Z',
    category: 'ai-products',
    score: 70,
    selected: true,
  }
}

function storyResponse(publicId: string) {
  return {
    schemaVersion: 1,
    story: {
      publicId,
      title: '真实 Story 标题',
      status: 'active',
      sourceCount: 3,
      reportCount: 1,
      firstReportAt: '2026-10-01T00:00:00.000Z',
      latestAt: '2026-10-01T00:00:00.000Z',
      latest: '最新动态',
      digest: 'AIHOT 事件综述',
      digestUpdatedAt: null,
      links: { aihot: `https://aihot.news/story/${publicId}` },
      reports: [{
        id: 'report-a',
        title: '来源 A 报道',
        summary: 'Evidence 摘要',
        source: { name: '来源 A', firstParty: false },
        publishedAt: '2026-10-01T00:00:00.000Z',
        links: { aihot: 'https://aihot.news/items/report-a', original: 'https://source.example/report-a' },
      }],
      storyline: [],
      related: [],
    },
  }
}

function fetchResponse(hotItems: readonly unknown[], itemItems: readonly unknown[], story?: unknown): typeof fetch {
  return async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/hot-topics')) return response({ schemaVersion: 1, count: hotItems.length, items: hotItems })
    if (url.includes('/items?')) return response({ schemaVersion: 1, query: {}, items: itemItems, page: {} })
    if (url.includes('/stories/')) return response(story ?? storyResponse('story-a'))
    throw new Error(`Unexpected endpoint ${url}`)
  }
}

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=60', ETag: '"test"' },
  })
}
