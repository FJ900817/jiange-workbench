// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { clearRadarApiCache } from '../src/client/skeleton/aihot-radar-adapter.ts'
import { RadarSurface } from '../src/client/skeleton/RadarSurface.tsx'
import type { LocalAIHOTPendingRunRequest } from '@deepseek-ai/dsh-business-workbench/types'

afterEach(() => { cleanup(); clearRadarApiCache(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

function enterAihotCenter(): void {
  fireEvent.click(screen.getByRole('button', { name: '进入AI 情报中心' }))
}

function enterMyIntelligence(): void {
  enterAihotCenter()
  fireEvent.click(screen.getByRole('button', { name: '我的情报' }))
}

describe('Radar Public API mode', () => {
  it('renders Aipoju HTML as readable text, keeps embedded markup inert, and shows separate topic images', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ schemaVersion: 1, count: 0, items: [] })))
    const topic = {
      topicId: '45548555825514558',
      title: 'AI 工作流实践',
      content: '<p>AI 工作流实践</p><p><strong>正文</strong> &amp; 更清晰</p>'
        + '<img src=x onerror="alert(1)"><script>window.__aipojuXss = true</script>',
      author: '作者甲',
      createdAt: '2026-10-12T09:00:00.000Z',
      sourceUrl: 'https://example.org/topic/1',
      images: ['https://images.example.org/topic-1.webp'],
      interactionCounts: { likes: 8 },
    }
    const request = vi.fn(async (operation: string, _args: Record<string, unknown>) => operation === 'topic.list'
      ? { requestId: 'list-1', ok: true, result: { featured: [topic], latest: [], candidateCount: 1, fetchedAt: '2026-10-12T09:00:00.000Z', stale: false, refreshErrorCode: null } }
      : { requestId: 'detail-1', ok: true, result: topic })
    Object.defineProperty(window, '__dshAipoju', { configurable: true, value: { request } })

    render(<RadarSurface />)
    fireEvent.click(screen.getByRole('button', { name: 'AI 破局俱乐部' }))
    expect(await screen.findByRole('heading', { name: '本周精选' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '最新动态' })).toBeTruthy()
    const topicRow = await screen.findByRole('button', { name: /AI 工作流实践/ })
    expect(topicRow.textContent).toContain('正文 & 更清晰')
    expect(topicRow.textContent).not.toContain('<p>')
    const homeImage = screen.getByRole('img', { name: 'AI 工作流实践配图' })
    fireEvent.error(homeImage)
    expect(screen.queryByRole('img', { name: 'AI 工作流实践无配图' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    await waitFor(() => expect(request.mock.calls.filter(([operation]) => operation === 'topic.list')).toHaveLength(2))
    expect(request).toHaveBeenLastCalledWith('topic.list', { refresh: true })
    fireEvent.click(topicRow)

    expect(await screen.findByRole('heading', { name: 'AI 工作流实践' })).toBeTruthy()
    const body = screen.getByLabelText('主题正文')
    expect(body.textContent).toContain('正文 & 更清晰')
    expect(body.textContent).not.toContain('<p>')
    expect(body.textContent).not.toContain('alert(1)')
    expect(body.textContent).not.toContain('window.__aipojuXss')
    expect(body.querySelector('img, script')).toBeNull()
    const image = screen.getByRole('img', { name: '主题图片 1' })
    expect(image.getAttribute('src')).toBe('https://images.example.org/topic-1.webp')
    fireEvent.error(image)
    expect(screen.getByRole('img', { name: '图片 1 无法加载' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /打开官网原文/ }).getAttribute('href')).toBe('https://example.org/topic/1')
    expect(request.mock.calls.map(([operation]) => operation)).toEqual(['topic.list', 'topic.list', 'topic.detail'])
    expect(request).toHaveBeenCalledWith('topic.list', { refresh: false })
  })

  it('uses text-first featured cards, omits missing thumbnails, and removes a repeated leading title from excerpts', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ schemaVersion: 1, count: 0, items: [] })))
    const makeTopic = (topicId: string, title: string, content: string) => ({
      topicId, title, content, author: '作者乙', createdAt: '2026-10-12T09:00:00.000Z',
      sourceUrl: 'https://example.org/topic/2', images: null, interactionCounts: { likes: 3, comments: 1 },
    })
    const featured = makeTopic('featured-text-only', '精选纯文字标题', '<p>精选纯文字标题</p><p>后续正文提供了不同的信息。</p>')
    const latest = makeTopic('latest-text-only', '最新纯文字标题', '<p>前导正文信息。</p><p>最新纯文字标题\u200b</p><p>最新纯文字标题</p><p>最新动态的有效摘要。</p>')
    const request = vi.fn(async () => ({ requestId: 'list-1', ok: true, result: {
      featured: [featured], latest: [latest], candidateCount: 2, fetchedAt: '2026-10-12T09:00:00.000Z', stale: false, refreshErrorCode: null,
    } }))
    Object.defineProperty(window, '__dshAipoju', { configurable: true, value: { request } })

    render(<RadarSurface />)
    fireEvent.click(screen.getByRole('button', { name: 'AI 破局俱乐部' }))
    const featuredCard = await screen.findByRole('button', { name: /精选纯文字标题/ })
    const latestRow = screen.getByRole('button', { name: /最新纯文字标题/ })
    expect(featuredCard.querySelector('img')).toBeNull()
    expect(latestRow.querySelector('img')).toBeNull()
    expect(featuredCard.textContent).not.toContain('无配图')
    expect(latestRow.textContent).not.toContain('无配图')
    expect(featuredCard.textContent?.match(/精选纯文字标题/gu)).toHaveLength(1)
    expect(featuredCard.textContent).toContain('后续正文提供了不同的信息。')
    expect(latestRow.textContent?.match(/最新纯文字标题/gu)).toHaveLength(1)
    expect(latestRow.textContent).toContain('前导正文信息。')
    expect(latestRow.textContent).toContain('最新动态的有效摘要。')

    const repeatedPrefix = makeTopic('featured-repeated-prefix', '这是一段较长的标题开头内容重复显示，并继续补充具体问题', '<p>这是一段较长的标题开头内容重复显示</p><p>重复标题之后的正文信息。</p>')
    request.mockResolvedValueOnce({ requestId: 'list-2', ok: true, result: {
      featured: [repeatedPrefix], latest: [], candidateCount: 1, fetchedAt: '2026-10-12T09:00:00.000Z', stale: false, refreshErrorCode: null,
    } })
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    const repeatedCard = await screen.findByRole('button', { name: /这是一段较长的标题开头内容重复显示/ })
    expect(repeatedCard.textContent).not.toContain('这是一段较长的标题开头内容重复显示，并继续补充具体问题这是一段较长的标题开头内容重复显示')
    expect(repeatedCard.textContent).toContain('重复标题之后的正文信息。')
  })

  it('renders eight featured and twelve distinct latest topics without changing feed counts', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ schemaVersion: 1, count: 0, items: [] })))
    const topic = (topicId: string) => ({
      topicId, title: `主题 ${topicId}`, content: `正文 ${topicId}`, author: '作者丙',
      createdAt: '2026-10-12T09:00:00.000Z', sourceUrl: null, images: null, interactionCounts: null,
    })
    const featured = Array.from({ length: 8 }, (_, index) => topic(`featured-${index}`))
    const latest = Array.from({ length: 12 }, (_, index) => topic(`latest-${index}`))
    const request = vi.fn(async () => ({ requestId: 'list-1', ok: true, result: {
      featured, latest, candidateCount: 50, fetchedAt: '2026-10-12T09:00:00.000Z', stale: false, refreshErrorCode: null,
    } }))
    Object.defineProperty(window, '__dshAipoju', { configurable: true, value: { request } })

    render(<RadarSurface />)
    fireEvent.click(screen.getByRole('button', { name: 'AI 破局俱乐部' }))
    const featuredHeading = await screen.findByRole('heading', { name: '本周精选' })
    const latestHeading = screen.getByRole('heading', { name: '最新动态' })
    const featuredSection = featuredHeading.closest('section')
    const latestSection = latestHeading.closest('section')
    expect(featuredSection?.querySelectorAll('button')).toHaveLength(8)
    expect(latestSection?.querySelectorAll('button')).toHaveLength(12)
    expect(screen.getByText(/首页共读取 50 条真实候选/)).toBeTruthy()
  })

  it('searches through only the fixed topic.search operation and distinguishes authentication failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ schemaVersion: 1, count: 0, items: [] })))
    const request = vi.fn(async (_operation: string, _args: Record<string, unknown>) => ({ requestId: 'search-1', ok: false, errorCode: 'AUTH_REQUIRED' }))
    Object.defineProperty(window, '__dshAipoju', { configurable: true, value: { request } })
    render(<RadarSurface />)
    fireEvent.click(screen.getByRole('button', { name: 'AI 破局俱乐部' }))
    await screen.findByText(/正在读取俱乐部主题/)
    const input = screen.getByLabelText('搜索主题')
    fireEvent.change(input, { target: { value: 'AI工作流' } })
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    expect(await screen.findByText(/官方 CLI 认证不可用/)).toBeTruthy()
    expect(request).toHaveBeenCalledWith('topic.search', { keyword: 'AI工作流' })
  })

  it('shows an isolated unavailable state and never substitutes fixtures on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network failure') }))

    render(<RadarSurface />)

    expect(await screen.findByText(/公共热点暂不可用/)).toBeTruthy()
    expect(screen.queryByText('小红书搜索流量出现新的“设计审美”表达趋势')).toBeNull()
    expect(screen.getByRole('main', { name: 'Radar' })).toBeTruthy()
  })

  it('renders the intelligence overview and opens public Story detail inside the public section', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/hot-topics')) return jsonResponse({ schemaVersion: 1, count: 1, items: [hotTopic()] })
      if (url.includes('/stories/story-real')) return jsonResponse(storyResponse())
      throw new Error(`Unexpected API request ${url}`)
    }))

    render(<RadarSurface />)
    expect(await screen.findByRole('heading', { name: 'Radar' })).toBeTruthy()
    expect(screen.getByText('外部情报与机会雷达')).toBeTruthy()
    expect(screen.getByRole('button', { name: '进入AI 情报中心' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '进入小红书雷达' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '进入生财有术' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '进入综合信号' })).toBeTruthy()
    enterAihotCenter()
    expect(screen.getByRole('heading', { name: 'AI 情报中心' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '热点事件' }))
    expect(screen.getByRole('heading', { name: '热点事件' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '我的情报' }))
    expect(screen.getByRole('heading', { name: '我的情报' })).toBeTruthy()
    expect(screen.getAllByText('本地 AI 情报暂不可用').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: '热点事件' }))
    fireEvent.click(await screen.findByRole('button', { name: /打开信号：代表文章标题/ }))

    expect(screen.getByRole('heading', { name: '来源与 Evidence' })).toBeTruthy()
    expect(await screen.findByRole('heading', { name: '来源报道 1' })).toBeTruthy()
    expect(screen.getByText('尚未运行分析')).toBeTruthy()
    expect(screen.queryByText(/示例资料/)).toBeNull()
  })

  it('shows local Article/Analysis through the Host bridge and keeps it separate from public signals', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/hot-topics')) return jsonResponse({ schemaVersion: 1, count: 1, items: [hotTopic()] })
      if (url.includes('/stories/story-real')) return jsonResponse(storyResponse())
      throw new Error(`Unexpected browser request ${url}`)
    }))
    const localAIHOT = {
      ...emptyReviewMethods(),
      list: vi.fn(async () => ({ status: 'available' as const, items: [localItem()], page: { limit: 20, nextCursor: null, hasMore: false }, counts: { articles: 18, analyses: 4 } })),
      detail: vi.fn(async () => ({ status: 'available' as const, item: { ...localItem(), excerpt: '持久化 Feed 摘录', bodyText: '持久化正文内容', contentTruncated: false, structure: { category: 'tool', tags: ['agent'], fact: { event: '持久化核心事实' } }, analysisCreatedAt: '2026-10-01T12:00:00.000Z' } })),
    }

    render(<RadarSurface localAIHOT={localAIHOT} />)
    expect(await screen.findByRole('heading', { name: 'Radar' })).toBeTruthy()
    enterMyIntelligence()
    expect(localAIHOT.list).toHaveBeenCalledWith({ limit: 20 })
    expect(await screen.findByRole('button', { name: '打开本地情报：持久化本地 AIHOT 文章' })).toBeTruthy()
    expect(screen.getByText('18 篇文章 · 4 条分析')).toBeTruthy()
    expect(screen.getByText('我的判断 · 待判断')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '打开本地情报：持久化本地 AIHOT 文章' }))
    expect(await screen.findByRole('heading', { name: 'AIHOT 摘要' })).toBeTruthy()
    expect(screen.getByText('来自数据库的持久化摘要')).toBeTruthy()
    expect(screen.getByText('tool')).toBeTruthy()
    expect(screen.getByRole('region', { name: '我的判断' })).toBeTruthy()
    expect(screen.getByText('PASS · 已通过预筛')).toBeTruthy()
    const technicalDetails = screen.getByText('技术详情')
    const technicalDisclosure = technicalDetails.closest('details')
    expect(technicalDisclosure?.open).toBe(false)
    expect(screen.getByText('Article ID').closest('details')).toBe(technicalDisclosure)
    fireEvent.click(technicalDetails)
    expect(technicalDisclosure?.open).toBe(true)
    expect(screen.getByText('Article ID')).toBeTruthy()
    expect(screen.getByText('Analysis ID')).toBeTruthy()
    const reviewPanel = screen.getByRole('region', { name: '我的判断' })
    for (const label of ['保留', '一般', '丢弃']) expect(screen.getAllByRole('button', { name: label }).some(button => reviewPanel.contains(button) && !button.hasAttribute('disabled'))).toBe(true)
    expect(screen.queryByText('代表文章标题')).toBeNull()
    expect(localAIHOT.list).toHaveBeenCalledWith({ limit: 20 })
    expect(localAIHOT.list).toHaveBeenCalledTimes(2)
    expect(localAIHOT.detail).toHaveBeenCalledWith('article-local-1')
  })

  it('keeps pending analysis separate from reviewable items and shows excerpt-only detail without review controls', async () => {
    const pending = {
      ...localItem(), articleId: 'article-pending', analysisId: null, title: '待分析文章', processingState: 'new' as const,
      reviewable: false, intelligenceState: 'pending_analysis' as const, contentBasis: 'excerpt' as const,
      excerptPreview: 'Feed 摘录预览', summary: null, score: null, selected: null,
    }
    const localAIHOT = {
      ...emptyReviewMethods(),
      list: vi.fn(async () => ({ status: 'available' as const, items: [pending, localItem()], page: { limit: 20, nextCursor: null, hasMore: false }, counts: { articles: 18, analyses: 4 } })),
      detail: vi.fn(async () => ({ status: 'available' as const, item: { ...pending, excerpt: '可阅读的真实 Feed 摘录内容。', bodyText: null, contentTruncated: false, structure: null, analysisCreatedAt: null } })),
    }
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ schemaVersion: 1, count: 0, items: [] })))

    render(<RadarSurface localAIHOT={localAIHOT} />)
    enterMyIntelligence()
    expect(await screen.findByRole('button', { name: '打开本地情报：待分析文章' })).toBeTruthy()
    expect(screen.queryByLabelText('人工判断：待分析文章')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '待分析' }))
    expect(screen.getByRole('button', { name: '打开本地情报：待分析文章' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /打开本地情报：持久化本地 AIHOT 文章/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '打开本地情报：待分析文章' }))

    expect(await screen.findByText('待分析 · 尚未完成 AIHOT 分析')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Feed 摘录' })).toBeTruthy()
    expect(screen.getByText('可阅读的真实 Feed 摘录内容。')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'AIHOT 判断' })).toBeNull()
    expect(screen.queryByRole('region', { name: '我的判断' })).toBeNull()
  })

  it('keeps the last successful list visible but labels it stale when local AIHOT goes offline', async () => {
    const localAIHOT = {
      ...emptyReviewMethods(),
      list: vi.fn().mockResolvedValueOnce(localListResult()).mockResolvedValueOnce({ status: 'unavailable' as const }),
      detail: vi.fn(async () => ({ status: 'unavailable' as const })),
    }
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ schemaVersion: 1, count: 0, items: [] })))

    render(<RadarSurface localAIHOT={localAIHOT} />)
    expect(await screen.findByRole('button', { name: /打开本地情报：持久化本地 AIHOT 文章/ })).toBeTruthy()
    enterMyIntelligence()

    expect(await screen.findAllByText('本地 AI 情报暂不可用')).toHaveLength(2)
    expect(await screen.findByText(/以下为上次成功读取的数据 ·/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /打开本地情报：持久化本地 AIHOT 文章/ })).toBeTruthy()
    expect(screen.queryByText('18 篇文章 · 4 条分析')).toBeNull()
    expect(localAIHOT.list).toHaveBeenCalledTimes(2)
  })

  it('refreshes when entering My Intelligence and again when returning to it from another Radar space', async () => {
    const localAIHOT = {
      ...emptyReviewMethods(),
      list: vi.fn().mockResolvedValueOnce(localListResult()).mockResolvedValueOnce(localListResult()).mockResolvedValueOnce({ status: 'unavailable' as const }),
      detail: vi.fn(async () => ({ status: 'unavailable' as const })),
    }
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ schemaVersion: 1, count: 0, items: [] })))

    render(<RadarSurface localAIHOT={localAIHOT} />)
    await screen.findByRole('heading', { name: 'Radar' })
    expect(await screen.findByRole('button', { name: /打开本地情报：持久化本地 AIHOT 文章/ })).toBeTruthy()
    enterMyIntelligence()
    expect(await screen.findByRole('button', { name: /打开本地情报：持久化本地 AIHOT 文章/ })).toBeTruthy()
    expect(localAIHOT.list).toHaveBeenCalledTimes(2)

    fireEvent.click(screen.getByRole('button', { name: '小红书雷达' }))
    fireEvent.click(screen.getByRole('button', { name: 'AI 情报中心' }))
    fireEvent.click(screen.getByRole('button', { name: '我的情报' }))
    expect(await screen.findAllByText('本地 AI 情报暂不可用')).toHaveLength(2)
    expect(await screen.findByText(/以下为上次成功读取的数据 ·/)).toBeTruthy()
    expect(localAIHOT.list).toHaveBeenCalledTimes(3)
  })

  it('revalidates once when the Radar workspace regains focus', async () => {
    const localAIHOT = {
      ...emptyReviewMethods(),
      list: vi.fn().mockResolvedValueOnce(localListResult()).mockResolvedValueOnce({ status: 'unavailable' as const }),
      detail: vi.fn(async () => ({ status: 'unavailable' as const })),
    }
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ schemaVersion: 1, count: 0, items: [] })))
    const view = render(<RadarSurface isActive={false} localAIHOT={localAIHOT} />)

    expect(localAIHOT.list).not.toHaveBeenCalled()
    view.rerender(<RadarSurface isActive localAIHOT={localAIHOT} />)
    expect(await screen.findByRole('button', { name: /打开本地情报：持久化本地 AIHOT 文章/ })).toBeTruthy()
    view.rerender(<RadarSurface isActive={false} localAIHOT={localAIHOT} />)
    view.rerender(<RadarSurface isActive localAIHOT={localAIHOT} />)
    expect((await screen.findByRole('alert')).textContent).toContain('本地 AI 情报暂不可用 · 上次读取')
    expect(localAIHOT.list).toHaveBeenCalledTimes(2)
  })

  it('recovers through the manual list refresh without affecting Public Hotspots', async () => {
    const localAIHOT = {
      ...emptyReviewMethods(),
      list: vi.fn().mockResolvedValueOnce(localListResult()).mockResolvedValueOnce({ status: 'unavailable' as const }).mockResolvedValueOnce(localListResult()),
      detail: vi.fn(async () => ({ status: 'unavailable' as const })),
    }
    const publicFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse({ schemaVersion: 1, count: 0, items: [] }))
    vi.stubGlobal('fetch', publicFetch)

    render(<RadarSurface localAIHOT={localAIHOT} />)
    expect(await screen.findByRole('button', { name: /打开本地情报：持久化本地 AIHOT 文章/ })).toBeTruthy()
    enterMyIntelligence()
    expect(await screen.findAllByText('本地 AI 情报暂不可用')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))

    expect(await screen.findByText('18 篇文章 · 4 条分析')).toBeTruthy()
    expect(screen.queryAllByText('本地 AI 情报暂不可用')).toHaveLength(0)
    expect(screen.getByRole('heading', { name: '我的情报' })).toBeTruthy()
    expect(localAIHOT.list).toHaveBeenCalledTimes(3)
    expect(publicFetch.mock.calls.filter(([input]) => String(input).endsWith('/hot-topics'))).toHaveLength(1)
    expect(localAIHOT.detail).not.toHaveBeenCalled()
  })

  it('keeps successful empty results distinct from offline state', async () => {
    const localAIHOT = {
      ...emptyReviewMethods(),
      list: vi.fn(async () => ({ status: 'available' as const, items: [], page: { limit: 20, nextCursor: null, hasMore: false }, counts: { articles: 0, analyses: 0 } })),
      detail: vi.fn(async () => ({ status: 'unavailable' as const })),
    }
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ schemaVersion: 1, count: 0, items: [] })))

    render(<RadarSurface localAIHOT={localAIHOT} />)
    enterMyIntelligence()
    expect(await screen.findByText('本地 AIHOT 暂无文章。')).toBeTruthy()
    expect(screen.queryAllByText('本地 AI 情报暂不可用')).toHaveLength(0)
    expect(localAIHOT.list).toHaveBeenCalledTimes(2)
  })

  it('preserves the local detail offline state', async () => {
    const localAIHOT = {
      ...emptyReviewMethods(),
      list: vi.fn().mockResolvedValueOnce(localListResult()).mockResolvedValueOnce({ status: 'unavailable' as const }).mockResolvedValueOnce(localListResult()),
      detail: vi.fn(async () => ({ status: 'unavailable' as const })),
    }
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ schemaVersion: 1, count: 0, items: [] })))

    render(<RadarSurface localAIHOT={localAIHOT} />)
    expect(await screen.findByRole('button', { name: /打开本地情报：持久化本地 AIHOT 文章/ })).toBeTruthy()
    enterMyIntelligence()
    expect(await screen.findAllByText('本地 AI 情报暂不可用')).toHaveLength(2)
    fireEvent.click(await screen.findByRole('button', { name: /打开本地情报：持久化本地 AIHOT 文章/ }))
    expect(await screen.findByText('本地情报详情暂不可用。')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '← 返回我的情报' }))
    fireEvent.click(screen.getByRole('button', { name: '我的情报' }))
    expect(await screen.findByText('18 篇文章 · 4 条分析')).toBeTruthy()
    expect(localAIHOT.list).toHaveBeenCalledTimes(3)
  })

  it('labels rejected local list requests as errors without discarding prior data', async () => {
    const localAIHOT = {
      ...emptyReviewMethods(),
      list: vi.fn().mockResolvedValueOnce(localListResult()).mockRejectedValueOnce(new Error('Host request failed')),
      detail: vi.fn(async () => ({ status: 'unavailable' as const })),
    }
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ schemaVersion: 1, count: 0, items: [] })))

    render(<RadarSurface localAIHOT={localAIHOT} />)
    expect(await screen.findByRole('button', { name: /打开本地情报：持久化本地 AIHOT 文章/ })).toBeTruthy()
    enterMyIntelligence()
    expect(await screen.findAllByText('本地 AI 情报读取失败')).toHaveLength(2)
    expect(await screen.findByText(/以下为上次成功读取的数据 ·/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /打开本地情报：持久化本地 AIHOT 文章/ })).toBeTruthy()
  })

  it('keeps public data separately available while local AIHOT is unavailable, without using it as local fallback', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/hot-topics')) return jsonResponse({ schemaVersion: 1, count: 1, items: [hotTopic()] })
      throw new Error(`Unexpected API request ${String(input)}`)
    }))
    render(<RadarSurface localAIHOT={{ ...emptyReviewMethods(), list: async () => ({ status: 'unavailable' }), detail: async () => ({ status: 'unavailable' }) }} />)
    enterAihotCenter()
    fireEvent.click(screen.getByRole('button', { name: '热点事件' }))
    expect(screen.getByRole('heading', { name: '热点事件' })).toBeTruthy()
    expect(await screen.findByRole('button', { name: /打开信号：代表文章标题/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '我的情报' }))
    expect(await screen.findAllByText('本地 AI 情报暂不可用')).toHaveLength(2)
  })

  it('starts one explicit bounded pending-analysis run and refreshes the local list on completion', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ schemaVersion: 1, count: 0, items: [] })))
    const pending = [1, 2, 3, 4].map(index => ({ ...localItem(), articleId: `pending-${index}`, analysisId: null, title: `待分析 ${index}`, processingState: 'new' as const, reviewable: false, intelligenceState: 'pending_analysis' as const, selected: null, score: null, summary: null }))
    const review = { ...localItem(), articleId: 'already-reviewable', title: '已待判断', intelligenceState: 'pending_review' as const }
    const run = {
      runId: '00000000-0000-4000-8000-000000000001', createdAt: '2026-10-04T00:00:00.000Z', startedAt: '2026-10-04T00:00:00.000Z', finishedAt: '2026-10-04T00:01:00.000Z',
      articleCap: 3 as const, articleCount: 3, requestedArticleIds: ['pending-1', 'pending-2', 'pending-3'], requestCap: 15,
      status: 'completed' as const, safetyStatus: 'passed' as const, requestAttempts: 9, pendingReviewCount: 2, blockedCount: 1, failedCount: 0,
      processedCount: 3, currentArticle: 3, items: pending.slice(0, 3).map(item => ({ articleId: item.articleId, title: item.title, status: 'pending_review' as const })), errorCode: null,
    }
    let listCalls = 0
    const localAIHOT = {
      ...emptyReviewMethods(),
      list: vi.fn(async () => { listCalls += 1; return { status: 'available' as const, items: [...pending, review], page: { limit: 20, nextCursor: null, hasMore: false }, counts: { articles: 5, analyses: 1 } } }),
      detail: vi.fn(async () => ({ status: 'unavailable' as const })),
      pendingRuns: vi.fn(async () => ({ status: 'available' as const, runs: [] })),
      processPending: vi.fn(async (_request: LocalAIHOTPendingRunRequest) => ({ status: 'available' as const, run })),
    }
    render(<RadarSurface localAIHOT={localAIHOT} />)
    enterMyIntelligence()
    expect(await screen.findByText('待分析 1')).toBeTruthy()
    expect(within(screen.getByText('已待判断').closest('article')!).queryByRole('checkbox')).toBeNull()
    fireEvent.click(within(screen.getByRole('navigation', { name: '情报状态筛选' })).getByRole('button', { name: '待分析' }))
    const checks = [1, 2, 3, 4].map(index => within(screen.getByText(`待分析 ${index}`).closest('article')!).getByRole('checkbox'))
    fireEvent.click(checks[0]!)
    fireEvent.click(checks[1]!)
    fireEvent.click(checks[2]!)
    expect((checks[3] as HTMLInputElement).disabled).toBe(true)
    expect(screen.getByText('已选择 3 条')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '处理待分析' }))
    expect(screen.getByText('处理 3 条待分析情报')).toBeTruthy()
    expect(localAIHOT.processPending).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '开始处理' }))
    await waitFor(() => expect(localAIHOT.processPending).toHaveBeenCalledTimes(1))
    const request = localAIHOT.processPending.mock.calls[0]![0]
    expect(request.articleIds).toEqual(['pending-1', 'pending-2', 'pending-3'])
    expect(Object.keys(request).sort()).toEqual(['articleIds', 'idempotencyKey'])
    expect(request.idempotencyKey).toMatch(/^[A-Za-z0-9_-]{16,100}$/u)
    expect(await screen.findByText('处理完成 · 2 条待判断 · 1 条阻断 · 0 条失败')).toBeTruthy()
    await waitFor(() => expect(listCalls).toBeGreaterThanOrEqual(2))
  })

  it('keeps Xiaohongshu isolated and opens the real read-only Shengcai source workspace', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/hot-topics')) return jsonResponse({ schemaVersion: 1, count: 0, items: [] })
      throw new Error(`Unexpected API request ${url}`)
    }))

    render(<RadarSurface />)
    await screen.findByText('当前没有可展示的公共热点。')

    fireEvent.click(screen.getByRole('button', { name: '小红书雷达' }))
    expect(screen.getByText('小红书数据源暂不可用')).toBeTruthy()
    expect(screen.getByText('发现平台内容、搜索与用户需求信号。')).toBeTruthy()
    for (const section of ['今日信号', '爆文观察', '搜索发现', '评论需求']) expect(screen.getAllByText(section).length).toBeGreaterThan(0)
    expect((screen.getByRole('searchbox', { name: '搜索小红书关键词' }) as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '搜索' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByText('小红书搜索流量出现新的“设计审美”表达趋势')).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: '生财有术' }))
    expect(screen.getByRole('heading', { name: '生财有术' })).toBeTruthy()
    expect(screen.getByText('生财有术来源状态')).toBeTruthy()
    expect(screen.getByRole('button', { name: '连接生财有术' })).toBeTruthy()
    for (const section of ['今日生财', '内容搜索', '项目机会', '评论观察']) expect(screen.getByRole('button', { name: section })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '综合信号' }))
    expect(screen.getByText('当前尚无跨来源 Signal Registry。')).toBeTruthy()
  })

  it('uses fixed SCYS Host methods for search, detail, projects, and explicit comment reading', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/hot-topics')) return jsonResponse({ schemaVersion: 1, count: 0, items: [] })
      throw new Error(`Unexpected browser request ${url}`)
    }))
    const content = {
      source: 'scys' as const, id: 'topic-1', entityType: 'xq_topic', entityId: '123456789012345678', contentType: 'article', title: '真实生财主题', summary: '真实摘要',
      content: '真实正文', author: '作者', publishedAt: '2026-10-07', url: null,
      isHot: null, isDigested: null,
      engagement: { likeCount: 3, favoriteCount: null, coinCount: null, commentCount: 1 },
    }
    const project = {
      source: 'scys' as const, id: 'project-1', title: '真实项目案例', summary: '项目摘要', description: '项目描述',
      publishedAt: null, url: null, engagement: { likeCount: null, favoriteCount: null, coinCount: null, commentCount: null },
    }
    const scysRadar = {
      getSourceStatus: vi.fn(async () => ({ status: 'connected' as const })), connect: vi.fn(),
      searchContent: vi.fn(async () => ({ status: 'ready' as const, items: [content] })),
      contentDetail: vi.fn(async () => ({ status: 'ready' as const, item: content })),
      searchProjects: vi.fn(async () => ({ status: 'ready' as const, items: [project] })),
      projectDetail: vi.fn(async () => ({ status: 'ready' as const, item: project })),
      loadComments: vi.fn(async () => ({ status: 'ready' as const, comments: [{ source: 'scys' as const, id: 'comment-1', text: '真实评论', author: '读者', publishedAt: null, likeCount: 1 }], hasMore: false })),
    }
    render(<RadarSurface scysRadar={scysRadar} />)
    await screen.findByRole('heading', { name: 'Radar' })
    fireEvent.click(screen.getByRole('button', { name: '生财有术' }))
    expect(await screen.findAllByText('已连接')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: '内容搜索' }))
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    fireEvent.click(await screen.findByRole('button', { name: /真实生财主题/ }))
    expect(await screen.findByText('真实正文')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '加载评论' }))
    expect(await screen.findByText('真实评论')).toBeTruthy()
    expect(scysRadar.searchContent).toHaveBeenCalledWith('AI')
    expect(scysRadar.contentDetail).toHaveBeenCalledWith({ entityType: 'xq_topic', entityId: '123456789012345678' })
    expect(scysRadar.loadComments).toHaveBeenCalledWith({ entityType: 'xq_topic', entityId: '123456789012345678' })
    fireEvent.click(screen.getByRole('button', { name: '项目机会' }))
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    fireEvent.click(await screen.findByRole('button', { name: /真实项目案例/ }))
    expect(await screen.findByText('项目描述')).toBeTruthy()
    expect(scysRadar.searchProjects).toHaveBeenCalledWith('AI')
    expect(scysRadar.projectDetail).toHaveBeenCalledWith('project-1')
    expect(scysRadar.getSourceStatus).toHaveBeenCalled()
  })

  it('loads the SCYS home through fixed private feed operations and deduplicates featured and latest articles', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ schemaVersion: 1, count: 0, items: [] })))
    const makeItem = (id: number) => ({
      source: 'scys', id: `topic-${id}`, entityType: 'xq_topic', entityId: String(id), contentType: 'article',
      title: `真实文章 ${id}`, summary: `<p>正文摘要 ${id}</p><script>window.__scysInjected = true</script>`, content: null,
      author: `作者 ${id}`, publishedAt: `2026-10-${String(14 - Math.floor((id - 1) / 24)).padStart(2, '0')}T${String((id - 1) % 24).padStart(2, '0')}:00:00.000Z`,
      url: `https://scys.com/topic/${id}`, isHot: null, isDigested: null,
      engagement: { likeCount: id, favoriteCount: null, coinCount: null, commentCount: null },
    })
    const makeResult = (mode: 'recent' | 'hot' | 'digested', items: ReturnType<typeof makeItem>[]) => ({
      status: items.length === 0 ? 'empty' : 'ready',
      query: { mode, windowStart: '2026-10-07T00:00:00.000Z', windowEnd: '2026-10-14T00:00:00.000Z', fetchedAt: '2026-10-14T00:00:00.000Z', stale: false, refreshErrorCode: null, pagesRead: 2, mayHaveMore: false, serverFilterAccepted: true, itemMarkerEvidence: 'missing' },
      ...(items.length === 0 ? {} : { items }),
    })
    const request = vi.fn(async (operation: string) => {
      const mode = operation.slice('scys.'.length) as 'recent' | 'hot' | 'digested'
      const items = mode === 'digested' ? Array.from({ length: 8 }, (_, index) => makeItem(index + 1))
        : mode === 'hot' ? Array.from({ length: 12 }, (_, index) => makeItem(index + 1))
          : Array.from({ length: 20 }, (_, index) => makeItem(index + 1))
      return { requestId: operation, ok: true, result: makeResult(mode, items) }
    })
    Object.defineProperty(window, '__dshAipoju', { configurable: true, value: { request } })
    const scysRadar = {
      getSourceStatus: vi.fn(async () => ({ status: 'connected' as const })), connect: vi.fn(),
      searchContent: vi.fn(), contentDetail: vi.fn(), searchProjects: vi.fn(), projectDetail: vi.fn(), loadComments: vi.fn(),
    }
    render(<RadarSurface scysRadar={scysRadar} />)
    fireEvent.click(screen.getByRole('button', { name: '生财有术' }))
    expect(await screen.findByRole('heading', { name: '值得关注' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '最新动态' })).toBeTruthy()
    expect(request.mock.calls.map(([operation]) => operation)).toEqual(['scys.digested', 'scys.hot', 'scys.recent'])
    const featured = screen.getByRole('heading', { name: '值得关注' }).closest('section')
    const latest = screen.getByRole('heading', { name: '最新动态' }).closest('section')
    expect(featured).not.toBeNull()
    expect(latest).not.toBeNull()
    expect(within(featured as HTMLElement).getAllByRole('button')).toHaveLength(8)
    expect(within(latest as HTMLElement).getAllByRole('button')).toHaveLength(12)
    expect(within(featured as HTMLElement).getByText('真实文章 1')).toBeTruthy()
    expect(within(latest as HTMLElement).getByText('真实文章 9')).toBeTruthy()
    expect(within(featured as HTMLElement).queryByText(/官方精华|官方热门/u)).toBeNull()
    expect(screen.getAllByRole('link', { name: '打开生财原文 ↗' })).toHaveLength(8)
    expect(screen.getAllByRole('link', { name: '打开原文 ↗' })).toHaveLength(12)
    expect(screen.queryByText(/window\.__scysInjected/u)).toBeNull()
    expect(scysRadar.searchContent).not.toHaveBeenCalled()
  })

  it('keeps development fixtures separate and does not request the public API', () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    render(<RadarSurface mode="fixture" />)

    expect(screen.getByText('开发 Fixture · 不会与真实 API 混排')).toBeTruthy()
    expect(fetch).not.toHaveBeenCalled()
  })
})

function hotTopic() {
  return {
    rank: 1,
    id: 'item-real',
    title: '代表文章标题',
    source: { name: 'AIHOT 来源' },
    links: {
      aihot: 'https://aihot.news/items/item-real',
      original: 'https://source.example/report-1',
      story: 'https://aihot.virxact.com/story/story-real',
    },
    sourceCount: 2,
    signalCount: 4,
    participantCount: 5,
    sourceNames: ['AIHOT 来源', '来源 B'],
    latestAt: '2026-10-01T00:00:00.000Z',
  }
}

function localItem() {
  return {
    articleId: 'article-local-1', analysisId: 'analysis-local-1', title: '持久化本地 AIHOT 文章', url: 'https://source.example/local-1',
    source: 'OpenAI News', publishedAt: '2026-10-01T09:00:00.000Z', processingState: 'analyzed' as const, reviewable: true, intelligenceState: 'pending_review' as const, contentBasis: 'body' as const, excerptPreview: 'Feed excerpt preview', bodyStatus: 'ok' as const,
    score: 8, selected: true, summary: '来自数据库的持久化摘要', prefilterLabel: 'PASS' as const, prefilterReason: '已通过预筛',
    category: 'tool', tags: ['agent'], topic: null, itemType: null, selectionReason: null,
  }
}

function localListResult() {
  return { status: 'available' as const, items: [localItem()], page: { limit: 20, nextCursor: null, hasMore: false }, counts: { articles: 18, analyses: 4 } }
}

function emptyReviewMethods() {
  return {
    reviews: vi.fn(async () => ({ status: 'available' as const, reviews: [] })),
    review: vi.fn(async () => ({ status: 'available' as const, review: null })),
    writeReview: vi.fn(async () => ({ status: 'available' as const })),
  }
}

function storyResponse() {
  return {
    schemaVersion: 1,
    story: {
      publicId: 'story-real',
      title: '真实 Story 标题',
      status: 'active',
      sourceCount: 2,
      reportCount: 1,
      firstReportAt: '2026-10-01T00:00:00.000Z',
      latestAt: '2026-10-01T00:00:00.000Z',
      latest: '最新动态',
      digest: '真实 AIHOT 摘要',
      digestUpdatedAt: null,
      links: { aihot: 'https://aihot.news/story/story-real' },
      reports: [{
        id: 'report-real',
        title: '来源报道 1',
        summary: '实际 Evidence 内容',
        source: { name: '来源 A', firstParty: false },
        publishedAt: '2026-10-01T00:00:00.000Z',
        links: { aihot: 'https://aihot.news/items/report-real', original: 'https://source.example/report-1' },
      }],
      storyline: [],
      related: [],
    },
  }
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=60', ETag: '"public-test"' },
  })
}
