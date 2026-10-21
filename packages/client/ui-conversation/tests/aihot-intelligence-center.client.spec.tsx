// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AihotIntelligenceCenter } from '../src/client/skeleton/AihotIntelligenceCenter.tsx'
import { clearRadarApiCache, type RadarSignal } from '../src/client/skeleton/aihot-radar-adapter.ts'

afterEach(() => { cleanup(); clearRadarApiCache(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

const noop = vi.fn()
const signals = [] as const

function signal(overrides: Partial<RadarSignal> = {}): RadarSignal {
  return { signalKey: 'story:focus', kind: 'story', title: 'Official focus headline', summary: null,
    publishedAt: '2026-10-17T08:00:00.000Z', sourceName: 'Official source', sourceNames: ['Official source'],
    originalUrl: 'https://publisher.example/focus', aihotUrl: 'https://aihot.news/story/focus', storyId: 'focus',
    evidence: [], ranking: 1, sourceCount: 3, reportCount: null, participationCount: 4, selected: null, category: null, ...overrides }
}

function item(id: string, title = `Title ${id}`) {
  return { id, title, originalTitle: null, summary: `Summary ${id}`, source: { name: 'Source' },
    links: { aihot: `https://aihot.news/items/${id}`, original: `https://source.example/${id}` },
    publishedAt: '2026-10-16T06:00:00.000Z', discoveredAt: '2026-10-16T06:01:00.000Z',
    category: 'ai-models', score: null, selected: true, reason: null, attribution: null }
}

function itemsResponse(entries: readonly object[], mode: string, options: { hasMore?: boolean; nextCursor?: string | null; window?: string; by?: string; category?: string | null; q?: string | null } = {}) {
  return response({ schemaVersion: 1, query: { mode, window: options.window ?? '7d', by: options.by ?? 'timeline', category: options.category ?? null, q: options.q ?? null, ordering: options.by === 'published' ? 'publishedAtDesc' : 'timelineDesc' },
    page: { count: entries.length, hasMore: options.hasMore ?? false, nextCursor: options.nextCursor ?? null }, items: entries })
}

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
}

function reportDetail(kind: 'daily' | 'weekly' | 'monthly') {
  return response({ schemaVersion: 1, report: { [kind === 'daily' ? 'date' : kind === 'weekly' ? 'week' : 'month']: kind === 'daily' ? '2026-10-16' : kind === 'weekly' ? '2026-W42' : '2026-10', generatedAt: '2026-10-16T08:00:00.000Z', headline: 'Official report', overview: 'Official overview', lead: null,
    windowStart: '2026-10-15T00:00:00.000Z', windowEnd: '2026-10-16T00:00:00.000Z', links: { aihot: 'https://aihot.news/reports/latest' }, sections: [], flashes: [] } })
}

function storyDetailResponse(title = 'Official focus headline') {
  return response({ schemaVersion: 1, story: { publicId: 'focus', title, status: 'active',
    sourceCount: 17, reportCount: 36, firstReportAt: '2026-10-17T08:00:00.000Z', latestAt: '2026-10-17T09:00:00.000Z',
    latest: 'Latest official update', digest: 'Verified official Story digest', digestUpdatedAt: null,
    links: { aihot: 'https://aihot.news/story/focus' }, reports: [
      { id: 'report-1', title: 'Latest official evidence', summary: 'Evidence summary', source: { name: 'Publisher A', firstParty: false },
        publishedAt: '2026-10-17T09:00:00.000Z', links: { aihot: 'https://aihot.news/items/report-1', original: 'https://publisher.example/report-1' } },
      { id: 'report-2', title: 'Earlier official evidence', summary: null, source: { name: 'Publisher B', firstParty: false },
        publishedAt: '2026-10-17T08:30:00.000Z', links: { aihot: 'https://aihot.news/items/report-2' } },
    ], storyline: [], related: [] } })
}

function openLibrary(): void {
  fireEvent.click(screen.getByRole('button', { name: '完整资讯库' }))
}

function openReports(): void {
  fireEvent.click(screen.getByRole('button', { name: '情报报告' }))
}

describe('AIHOT intelligence center', () => {
  it('renders the three-layer official homepage and opens the real focus Story through Radar', async () => {
    const onOpenSignal = vi.fn()
    const longTitle = 'Meta 开源 816B 模型 Muse Spark Open，Apple 演示 Mac Studio 本地运行'
    const focus = signal({ title: longTitle })
    const secondary = signal({ signalKey: 'story:secondary', title: 'Secondary hotspot', storyId: 'secondary', ranking: 2 })
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/stories/focus')) return storyDetailResponse(longTitle)
      throw new Error(`Unexpected path ${String(input)}`)
    }))

    render(<AihotIntelligenceCenter signals={[focus, secondary]} signalStatus="ready" signalFailure={null} onOpenSignal={onOpenSignal} myIntelligence={<div>Local-only</div>} />)

    expect(await screen.findByText('Verified official Story digest')).toBeTruthy()
    expect(screen.getByRole('heading', { name: longTitle }).textContent).toBe(longTitle)
    expect(await screen.findByText('36')).toBeTruthy()
    expect(screen.getByRole('heading', { name: '今天，AI 正在发生什么？' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '热点速览' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '继续探索' })).toBeTruthy()
    expect(screen.getByText('Latest official evidence')).toBeTruthy()
    expect(screen.getByText('17')).toBeTruthy()
    expect(screen.getByText('Story 来源数')).toBeTruthy()
    expect(screen.getByText('Story 报道数')).toBeTruthy()
    expect(screen.getByText('下方为 Story.reports 最新 2 条')).toBeTruthy()
    expect(screen.queryByText('官方精选资讯')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /阅读事件详情/ }))
    expect(onOpenSignal).toHaveBeenCalledWith(focus)
    fireEvent.click(screen.getByRole('button', { name: /Secondary hotspot/ }))
    expect(onOpenSignal).toHaveBeenLastCalledWith(secondary)
  })

  it('keeps original destinations and does not invent a Story when the official signal list is empty', async () => {
    render(<AihotIntelligenceCenter signals={signals} signalStatus="ready" signalFailure={null} onOpenSignal={noop} myIntelligence={<div>Local-only</div>} />)
    expect(await screen.findByText('AIHOT 官方当前没有可展示的 Story 焦点。')).toBeTruthy()
    expect(screen.getByText('当前没有其他可展示的官方热点。')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: /完整资讯库/ })[0]!)
    expect(await screen.findByRole('heading', { name: '完整资讯库' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '我的情报' }))
    expect(screen.getByText('Local-only')).toBeTruthy()
  })

  it('binds cursor paging to the active query and appends only new official items', async () => {
    const requests: URL[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input)); requests.push(url)
      if (url.pathname.endsWith('/items')) {
        const mode = url.searchParams.get('mode') ?? 'all'
        const cursor = url.searchParams.get('cursor')
        if (cursor === 'cursor-1') return itemsResponse([item('id-1'), item('id-2')], mode)
        if (url.searchParams.has('category')) return itemsResponse([item('filtered')], mode, { category: url.searchParams.get('category') })
        if (url.searchParams.has('q')) return itemsResponse([item('search')], mode, { q: url.searchParams.get('q') })
        return itemsResponse([item('id-1')], mode, { hasMore: true, nextCursor: 'cursor-1' })
      }
      throw new Error(`Unexpected path ${url.pathname}`)
    }))

    render(<AihotIntelligenceCenter signals={signals} signalStatus="ready" signalFailure={null} onOpenSignal={noop} myIntelligence={<div>Local-only</div>} />)
    openLibrary()
    await screen.findByRole('button', { name: '加载更多' })
    fireEvent.click(screen.getByRole('button', { name: '加载更多' }))
    expect(await screen.findByText(/2 条已加载/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Title id-1/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Title id-2/ })).toBeTruthy()
    expect(requests.some(url => url.searchParams.get('cursor') === 'cursor-1')).toBe(true)
    expect(screen.queryByText('Title id-1', { selector: 'strong' })).toBeTruthy()
  })

  it('passes category and search parameters to the public API without client-side filtering', async () => {
    const requests: URL[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input)); requests.push(url)
      if (url.pathname.endsWith('/items')) return itemsResponse([item(`result-${requests.length}`)], url.searchParams.get('mode') ?? 'all', { category: url.searchParams.get('category'), q: url.searchParams.get('q') })
      throw new Error(`Unexpected path ${url.pathname}`)
    }))

    render(<AihotIntelligenceCenter signals={signals} signalStatus="ready" signalFailure={null} onOpenSignal={noop} myIntelligence={<div>Local-only</div>} />)
    openLibrary()
    await screen.findByRole('heading', { name: '完整资讯库' })
    fireEvent.change(screen.getByLabelText('分类'), { target: { value: 'paper' } })
    await waitFor(() => expect(requests.some(url => url.searchParams.get('category') === 'paper')).toBe(true))
    fireEvent.change(screen.getByLabelText('搜索 AI 资讯'), { target: { value: 'Anthropic' } })
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    await waitFor(() => expect(requests.some(url => url.searchParams.get('q') === 'Anthropic' && url.searchParams.get('category') === 'paper')).toBe(true))
    expect(screen.getByText(/搜索：Anthropic/)).toBeTruthy()
  })

  it('distinguishes an empty weekly index with a readable latest detail from an ordinary empty month index', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/items')) return itemsResponse([], url.searchParams.get('mode') ?? 'all')
      if (url.pathname === '/api/v1/dailies') return response({ schemaVersion: 1, count: 0, items: [] })
      if (url.pathname === '/api/v1/dailies/latest') return response({ error: 'not_found' }, 404)
      if (url.pathname === '/api/v1/weeklies') return response({ schemaVersion: 1, count: 0, items: [] })
      if (url.pathname === '/api/v1/weeklies/latest') return reportDetail('weekly')
      if (url.pathname === '/api/v1/monthlies') return response({ schemaVersion: 1, count: 0, items: [] })
      if (url.pathname === '/api/v1/monthlies/latest') return response({ error: 'not_found' }, 404)
      throw new Error(`Unexpected path ${url.pathname}`)
    }))

    render(<AihotIntelligenceCenter signals={signals} signalStatus="ready" signalFailure={null} onOpenSignal={noop} myIntelligence={<div>Local-only</div>} />)
    openReports()
    fireEvent.click(screen.getByRole('tab', { name: '周报' }))
    expect(await screen.findByText(/索引返回空列表，但 latest 详情可读取/)).toBeTruthy()
    expect(await screen.findByRole('heading', { name: 'Official report' })).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: '月报' }))
    expect(await screen.findByText('官方索引当前没有可展示的月报期号。')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('does not present report-index network failure as an empty report list', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/items')) return itemsResponse([], url.searchParams.get('mode') ?? 'all')
      if (url.pathname === '/api/v1/dailies') return response({ schemaVersion: 1, count: 0, items: [] })
      if (url.pathname === '/api/v1/dailies/latest') return response({ error: 'not_found' }, 404)
      if (url.pathname === '/api/v1/weeklies') return response({ error: 'temporarily_unavailable' }, 503)
      if (url.pathname === '/api/v1/weeklies/latest') return response({ error: 'temporarily_unavailable' }, 503)
      throw new Error(`Unexpected path ${url.pathname}`)
    }))

    render(<AihotIntelligenceCenter signals={signals} signalStatus="ready" signalFailure={null} onOpenSignal={noop} myIntelligence={<div>Local-only</div>} />)
    openReports()
    fireEvent.click(screen.getByRole('tab', { name: '周报' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByText('官方索引当前没有可展示的周报期号。')).toBeNull()
  })
})
