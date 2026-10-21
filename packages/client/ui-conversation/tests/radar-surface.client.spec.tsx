// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import * as workspaceIdentity from '@deepseek-ai/dsh-client-ui-primitives'
import { RadarSurface } from '../src/client/skeleton/RadarSurface.tsx'
import { RADAR_CATEGORIES, RADAR_PROJECT_FIXTURES, RADAR_SIGNAL_FIXTURES } from '../src/client/skeleton/radar-fixtures.ts'
import { WORK_FIXTURES } from '../src/client/skeleton/work-fixtures.ts'
import { clearRadarApiCache } from '../src/client/skeleton/aihot-radar-adapter.ts'
import type { LocalAIHOTIntelligenceItem, LocalAIHOTReview, LocalAIHOTReviewWriteRequest, ScysCommentLoadResult } from '@deepseek-ai/dsh-business-workbench/types'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); clearRadarApiCache(); delete (window as unknown as { __dshAipoju?: unknown }).__dshAipoju })

const localItems: readonly LocalAIHOTIntelligenceItem[] = [
  { articleId: 'article-keep', analysisId: '1', title: 'Keep signal', url: 'https://example.test/keep', source: 'OpenAI News', publishedAt: null, processingState: 'analyzed', reviewable: true, intelligenceState: 'kept', contentBasis: 'body', excerptPreview: 'Stored content', bodyStatus: 'ok', score: 8, selected: true, summary: 'A stored analysis', prefilterLabel: 'PASS', prefilterReason: null, category: 'tool', tags: [], topic: null, itemType: null, selectionReason: null },
  { articleId: 'article-maybe', analysisId: '2', title: 'Maybe signal', url: 'https://example.test/maybe', source: 'Hugging Face', publishedAt: null, processingState: 'analyzed', reviewable: true, intelligenceState: 'maybe', contentBasis: 'excerpt', excerptPreview: 'Feed excerpt', bodyStatus: 'ok', score: 5, selected: false, summary: 'Another analysis', prefilterLabel: 'PASS', prefilterReason: null, category: 'tool', tags: [], topic: null, itemType: null, selectionReason: null },
  { articleId: 'article-pending-review', analysisId: '3', title: 'Ready signal', url: 'https://example.test/ready', source: 'OpenAI News', publishedAt: null, processingState: 'analyzed', reviewable: true, intelligenceState: 'pending_review', contentBasis: 'body', excerptPreview: 'Ready excerpt', bodyStatus: 'ok', score: 7, selected: true, summary: 'A reviewable analysis', prefilterLabel: 'PASS', prefilterReason: null, category: 'tool', tags: [], topic: null, itemType: null, selectionReason: null },
  { articleId: 'article-pending', analysisId: null, title: 'Pending signal', url: 'https://example.test/pending', source: 'Simon Willison', publishedAt: null, processingState: 'new', reviewable: false, intelligenceState: 'pending_analysis', contentBasis: 'excerpt', excerptPreview: 'Pending feed excerpt', bodyStatus: 'pending', score: null, selected: null, summary: null, prefilterLabel: null, prefilterReason: null, category: null, tags: [], topic: null, itemType: null, selectionReason: null },
]

function mockPublicAPI(): void {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ schemaVersion: 1, count: 0, items: [] })))
}

function enterMyIntelligence(): void {
  fireEvent.click(screen.getByRole('button', { name: 'AI 情报中心' }))
  fireEvent.click(screen.getByRole('button', { name: '我的情报' }))
}

function makeReview(articleId: string, verdict: LocalAIHOTReview['verdict']): LocalAIHOTReview {
  return { articleId, analysisId: localItems.find(item => item.articleId === articleId)?.analysisId ?? null, verdict, reasons: [], note: '', reviewedAt: '2026-10-03T12:00:00.000Z', updatedAt: '2026-10-03T12:00:00.000Z' }
}

function makeReviewClient(options: { offline?: boolean } = {}) {
  let offline = options.offline ?? false
  const reviews = new Map<string, LocalAIHOTReview>([['article-keep', makeReview('article-keep', 'KEEP')], ['article-maybe', makeReview('article-maybe', 'MAYBE')]])
  const client = {
    list: vi.fn(async () => offline
      ? { status: 'unavailable' as const }
      : { status: 'available' as const, items: localItems, page: { limit: 20, nextCursor: null, hasMore: false }, counts: { articles: 4, analyses: 3 } }),
    detail: vi.fn(async (articleId: string) => offline
      ? { status: 'unavailable' as const }
      : { status: 'available' as const, item: { ...localItems.find(item => item.articleId === articleId)!, excerpt: 'Stored excerpt', bodyText: 'Stored body', contentTruncated: false, structure: null, analysisCreatedAt: null } }),
    reviews: vi.fn(async () => offline ? { status: 'unavailable' as const } : { status: 'available' as const, reviews: [...reviews.values()] }),
    review: vi.fn(async (articleId: string) => offline ? { status: 'unavailable' as const } : { status: 'available' as const, review: reviews.get(articleId) ?? null }),
    writeReview: vi.fn(async (request: LocalAIHOTReviewWriteRequest) => {
      if (offline) return { status: 'unavailable' as const }
      const item = localItems.find(candidate => candidate.articleId === request.articleId)
      if (!item?.reviewable) return { status: 'not_reviewable' as const }
      reviews.set(request.articleId, { ...makeReview(request.articleId, request.verdict), reasons: [...request.reasons], note: request.note })
      return { status: 'available' as const }
    }),
    processPending: vi.fn(async () => ({ status: 'available' as const, run: makePendingRun('running') })),
    pendingRun: vi.fn(async () => ({ status: 'available' as const, run: makePendingRun('running') })),
    pendingRuns: vi.fn(async () => ({ status: 'available' as const, runs: [] as readonly ReturnType<typeof makePendingRun>[] })),
    setOffline(value: boolean) { offline = value },
    storedReviews: reviews,
  }
  return client
}

function makePendingRun(status: 'running' | 'completed' | 'failed' | 'safety_stopped' | 'interrupted') {
  return {
    runId: 'f364ad98-f4a9-4b19-933b-0e391fe715e9', createdAt: '2026-10-04T09:00:00.000Z', startedAt: '2026-10-04T09:00:00.000Z',
    finishedAt: status === 'running' ? null : '2026-10-04T09:01:00.000Z', articleCap: 3 as const, articleCount: 1,
    requestedArticleIds: ['article-pending'], requestCap: 5, status, safetyStatus: status === 'running' ? 'pending' as const : 'passed' as const,
    requestAttempts: 2, processedCount: status === 'running' ? 0 : 1, pendingReviewCount: status === 'completed' ? 1 : 0,
    blockedCount: 0, failedCount: status === 'failed' ? 1 : 0, currentArticle: 1,
    items: [{ articleId: 'article-pending', title: 'Pending signal', status: status === 'running' ? 'analyzing' as const : status === 'completed' ? 'pending_review' as const : 'failed' as const }],
    errorCode: null,
  }
}

describe('Business Workbench Radar surface', () => {
  it('keeps XHS cards responsive and full-frame at a 3:4 ratio', () => {
    const styles = readFileSync('packages/client/ui-conversation/src/client/skeleton/RadarSurface.module.css', 'utf8')
    expect(styles).toContain('.xhsFeedList { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr))')
    expect(styles).toContain('@media (min-width: 1440px)')
    expect(styles).toContain('.xhsFeedList { grid-template-columns: repeat(4, minmax(0, 1fr))')
    expect(styles).toContain('@media (max-width: 900px)')
    expect(styles).toContain('.xhsFeedList { grid-template-columns: repeat(2, minmax(0, 1fr))')
    expect(styles).toContain('@media (max-width: 460px)')
    expect(styles).toContain('.xhsFeedList { grid-template-columns: minmax(0, 1fr)')
    expect(styles).toContain('aspect-ratio: 3 / 4')
    expect(styles).toContain('object-fit: contain')
  })

  it('keeps cover-fetch diagnostics out of the production Radar UI', async () => {
    vi.stubEnv('DEV', false)
    mockPublicAPI()
    const xhsRadar = {
      getSourceStatus: vi.fn(async () => ({ status: 'connected' as const })),
      search: vi.fn(async () => ({ status: 'empty' as const, count: 0 })),
      detail: vi.fn(),
    }
    render(<RadarSurface xhsRadar={xhsRadar} />)
    fireEvent.click(screen.getByRole('button', { name: '小红书雷达' }))
    await screen.findByText('已登录')
    fireEvent.click(screen.getByRole('button', { name: '今日信号' }))
    fireEvent.click(screen.getByRole('button', { name: '更新小红书情报' }))
    await waitFor(() => expect(xhsRadar.search).toHaveBeenCalledTimes(5))
    fireEvent.click(screen.getByRole('button', { name: '爆文观察' }))
    expect(screen.queryByText('临时封面链路诊断（仅汇总计数）')).toBeNull()
  })

  it('shows only safe SCYS reconnect HTTP boundaries', async () => {
    mockPublicAPI()
    const diagnostic = {
      stage: 'mcp_initialize' as const,
      errorCode: 'SCYS_HTTP_401',
      httpStatus: 401,
      safeMessage: 'MCP connection or initialization received HTTP 401.',
      httpObservations: [{ phase: 'mcp_initialize' as const, requestAttempted: true, httpStatus: 401, errorType: null, errorCode: null }],
      errorType: 'StreamableHTTPError',
      safeErrorCode: 'HTTP_401',
      sdkErrorSourceFile: 'client/streamableHttp.js',
      sdkErrorSourceLine: 512,
    }
    const scysRadar = {
      getSourceStatus: vi.fn(async () => ({ status: 'error' as const, diagnostic })),
      connect: vi.fn(async () => ({ status: 'error' as const, diagnostic })),
      searchContent: vi.fn(), contentDetail: vi.fn(), searchProjects: vi.fn(), projectDetail: vi.fn(), loadComments: vi.fn(),
    }
    render(<RadarSurface scysRadar={scysRadar} />)
    fireEvent.click(screen.getByRole('button', { name: '生财有术' }))

    expect(await screen.findByText(/HTTP 边界：mcp_initialize · Fetch 已调用 · HTTP 401/)).toBeTruthy()
    expect(screen.getByText(/SDK client\/streamableHttp\.js:512/)).toBeTruthy()
    expect(scysRadar.connect).not.toHaveBeenCalled()
  })

  it('uses the selected SCYS entity identity for article detail and comments', async () => {
    mockPublicAPI()
    const item = {
      source: 'scys' as const, id: 'card-id', entityType: 'xq_topic', entityId: '123456789012345678',
      contentType: 'talk', title: '真实文章', summary: '摘要', content: null, author: '作者',
      publishedAt: '2026-10-13T00:00:00.000Z', url: null,
      isHot: null, isDigested: null,
      engagement: { likeCount: 3, favoriteCount: 2, coinCount: 1, commentCount: 1 },
    }
    let finishCommentLoad: ((result: Extract<ScysCommentLoadResult, { readonly status: 'ready' }>) => void) | undefined
    const commentLoad = new Promise<Extract<ScysCommentLoadResult, { readonly status: 'ready' }>>(resolve => { finishCommentLoad = resolve })
    const scysRadar = {
      getSourceStatus: vi.fn(async () => ({ status: 'connected' as const })), connect: vi.fn(),
      searchContent: vi.fn(async () => ({ status: 'ready' as const, items: [item] })),
      contentDetail: vi.fn(async () => ({ status: 'ready' as const, item: { ...item, content: '<p>完整正文</p><script>alert("x")</script>' } })),
      searchProjects: vi.fn(), projectDetail: vi.fn(),
      loadComments: vi.fn(() => commentLoad),
    }
    render(<RadarSurface scysRadar={scysRadar} />)
    fireEvent.click(screen.getByRole('button', { name: '生财有术' }))
    await waitFor(() => expect(screen.getAllByText('已连接')).toHaveLength(2))
    fireEvent.click(screen.getByRole('button', { name: '内容搜索' }))
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    fireEvent.click(await screen.findByRole('button', { name: /真实文章/u }))
    await screen.findByText('完整正文')
    expect(screen.getByText('2026-10-13 08:00')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '加载评论' }))
    expect(screen.getByRole('button', { name: '正在加载评论…' })).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('正在读取评论')
    finishCommentLoad?.({ status: 'ready', comments: [{ source: 'scys', id: '1', text: '<p>真实评论</p>', author: '读者', publishedAt: null, likeCount: 0 }], hasMore: false })
    await screen.findByText('真实评论')
    expect(screen.getByText('完整正文').textContent).toBe('完整正文')
    expect(screen.getByText('真实评论').textContent).toBe('真实评论')
    expect(document.querySelector('script')).toBeNull()
    expect(screen.getByRole('heading', { name: '评论' })).toBeTruthy()
    expect(screen.getByText('1 条')).toBeTruthy()
    expect(screen.getByRole('button', { name: '重新加载评论' })).toBeTruthy()
    const identity = { entityType: 'xq_topic', entityId: '123456789012345678' }
    expect(scysRadar.contentDetail).toHaveBeenCalledWith(identity)
    expect(scysRadar.loadComments).toHaveBeenCalledWith(identity)
  })

  it('formats SCYS search dates in Shanghai time and localizes known topic types', async () => {
    mockPublicAPI()
    const item = {
      source: 'scys' as const, id: 'card-id', entityType: 'xq_topic', entityId: '123456789012345678',
      contentType: 'talk', title: '真实文章标题', summary: '真实文章标题：这里是没有重复标题的正文摘要。', content: null, author: '作者',
      publishedAt: '2026-10-13T00:00:00.000Z', url: null,
      isHot: null, isDigested: null,
      engagement: { likeCount: 3, favoriteCount: 2, coinCount: 1, commentCount: 1 },
    }
    const scysRadar = {
      getSourceStatus: vi.fn(async () => ({ status: 'connected' as const })), connect: vi.fn(),
      searchContent: vi.fn(async () => ({ status: 'ready' as const, items: [item] })),
      contentDetail: vi.fn(), searchProjects: vi.fn(), projectDetail: vi.fn(), loadComments: vi.fn(),
    }
    render(<RadarSurface scysRadar={scysRadar} />)
    fireEvent.click(screen.getByRole('button', { name: '生财有术' }))
    await screen.findAllByText('已连接')
    fireEvent.click(screen.getByRole('button', { name: '内容搜索' }))
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))

    const result = await screen.findByRole('button', { name: /真实文章标题/u })
    expect(result.textContent).toContain('2026-10-13 08:00')
    expect(result.textContent).toContain('文章')
    expect(result.textContent).toContain('这里是没有重复标题的正文摘要。')
    expect(result.textContent).not.toContain('2026-10-13T00:00:00.000Z')
    expect(result.textContent).not.toContain('真实文章标题：真实文章标题')
  })

  it('renders the automatic SCYS feed as text-first cards without empty image placeholders', async () => {
    mockPublicAPI()
    const item = {
      source: 'scys', id: 'topic-1', entityType: 'xq_topic', entityId: 'topic-1', contentType: 'talk',
      title: '一篇值得阅读的真实文章', summary: '一篇值得阅读的真实文章：作者分享了完整的实操过程和验证结果。',
      content: null, author: '真实作者', publishedAt: '2026-10-14T06:00:00.000Z', url: 'https://scys.com/article/1',
      isHot: null, isDigested: null,
      engagement: { likeCount: 8, favoriteCount: 3, coinCount: 1, commentCount: 2 },
    }
    const queryInfo = (mode: 'recent' | 'hot' | 'digested') => ({
      mode, windowStart: '2026-10-07T00:00:00.000Z', windowEnd: '2026-10-14T00:00:00.000Z',
      fetchedAt: '2026-10-14T07:00:00.000Z', stale: false, refreshErrorCode: null,
      pagesRead: 1, mayHaveMore: false, serverFilterAccepted: true, itemMarkerEvidence: 'missing',
    })
    Object.defineProperty(window, '__dshAipoju', {
      configurable: true,
      value: { request: vi.fn(async (operation: string) => ({
        requestId: 'test-request', ok: true,
        result: { status: 'ready', query: queryInfo(operation === 'scys.recent' ? 'recent' : operation === 'scys.hot' ? 'hot' : 'digested'), items: [item] },
      })) },
    })
    const scysRadar = {
      getSourceStatus: vi.fn(async () => ({ status: 'connected' as const })), connect: vi.fn(),
      searchContent: vi.fn(), contentDetail: vi.fn(), searchProjects: vi.fn(), projectDetail: vi.fn(), loadComments: vi.fn(),
    }
    render(<RadarSurface scysRadar={scysRadar} />)
    fireEvent.click(screen.getByRole('button', { name: '生财有术' }))

    expect(await screen.findByRole('button', { name: /一篇值得阅读的真实文章/u })).toBeTruthy()
    expect(screen.getByText('作者分享了完整的实操过程和验证结果。')).toBeTruthy()
    expect(screen.getByText(/真实作者 · 2026-10-14 14:00/u)).toBeTruthy()
    expect(document.querySelector('.scysFeedFeaturedCard img')).toBeNull()
    expect(screen.getByRole('link', { name: /打开生财原文/u }).getAttribute('href')).toBe('https://scys.com/article/1')
    expect(screen.getByText(/未返回逐篇标记/u)).toBeTruthy()
  })

  it('searches only on submit and reads one selected feed detail through the product Host facade', async () => {
    mockPublicAPI()
    const feed = {
      id: 'feed-1', xsecToken: 'source-token', title: '真实搜索结果', author: '作者', coverAssetId: null,
      noteType: 'normal', likeCount: 10, collectCount: 3, commentCount: 1,
    }
    const xhsRadar = {
      getSourceStatus: vi.fn(async () => ({ status: 'connected' as const })),
      search: vi.fn(async () => ({ status: 'ready' as const, feeds: [feed], count: 1 })),
      detail: vi.fn(async () => ({ status: 'ready' as const, detail: {
        id: 'feed-1', title: '真实搜索结果', content: '来源正文', author: '作者', imageAssetIds: [],
        likeCount: 10, collectCount: 3, commentCount: 1,
        comments: [{ id: 'comment-1', content: '评论原文', author: '读者', likeCount: 2, createdAt: null }],
      } })),
      analyzeComments: vi.fn(async (request: { readonly noteId: string; readonly comments: readonly { readonly id: string | null; readonly content: string | null }[] }) => {
        expect(request.noteId).toBe('feed-1')
        expect(request.comments).toEqual([{ id: 'comment-1', content: '评论原文' }])
        return {
          status: 'ready' as const, cacheHit: false,
          insights: [{ category: 'question' as const, insight: '用户在询问具体做法。', evidenceRefs: ['C01'], confidence: 'low' as const }],
          trace: { validEvidenceRefCount: 1, invalidEvidenceRefCount: 0, ungroundedInsightCount: 0 },
        }
      }),
    }
    render(<RadarSurface xhsRadar={xhsRadar} />)
    fireEvent.click(screen.getByRole('button', { name: '小红书雷达' }))
    expect(await screen.findByText('已连接')).toBeTruthy()
    expect(await screen.findByText('已登录')).toBeTruthy()
    expect(xhsRadar.search).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    expect(await screen.findByRole('button', { name: '真实搜索结果' })).toBeTruthy()
    expect(xhsRadar.search).toHaveBeenCalledOnce()
    expect(xhsRadar.search).toHaveBeenCalledWith({ keyword: '设计', sortBy: '综合' })
    expect(xhsRadar.detail).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '真实搜索结果' }))
    expect(await screen.findByText('来源正文')).toBeTruthy()
    expect(await screen.findByText('评论原文')).toBeTruthy()
    expect(xhsRadar.detail).toHaveBeenCalledWith({ id: 'feed-1', xsecToken: 'source-token' })
    expect(screen.getByText('分析将使用当前已加载评论调用配置的 AI 模型，不写入 Harness Session。')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '提炼需求' }))
    expect(await screen.findByText('用户在询问具体做法。')).toBeTruthy()
    expect(xhsRadar.analyzeComments).toHaveBeenCalledWith({
      noteId: 'feed-1', noteTitle: '真实搜索结果', noteText: '来源正文',
      comments: [{ id: 'comment-1', content: '评论原文' }],
    })
    fireEvent.click(screen.getByRole('button', { name: '查看对应评论' }))
    expect(document.querySelector('[data-comment-ref="C01"]')?.textContent).toContain('评论原文')
  })

  it('shows only sanitized analysis failure diagnostics in the existing detail area', async () => {
    mockPublicAPI()
    const feed = {
      id: 'feed-1', xsecToken: 'source-token', title: '真实搜索结果', author: '作者', coverAssetId: null,
      noteType: 'normal' as const, likeCount: 10, collectCount: 3, commentCount: 1,
    }
    const xhsRadar = {
      getSourceStatus: vi.fn(async () => ({ status: 'connected' as const })),
      search: vi.fn(async () => ({ status: 'ready' as const, feeds: [feed], count: 1 })),
      detail: vi.fn(async () => ({ status: 'ready' as const, detail: {
        id: 'feed-1', title: '真实搜索结果', content: '正文', author: '作者', imageAssetIds: [],
        likeCount: 10, collectCount: 3, commentCount: 1,
        comments: [{ id: 'comment-1', content: '真实评论隐私内容', author: '读者', likeCount: 2, createdAt: null }],
      } })),
      analyzeComments: vi.fn(async () => ({
        status: 'error' as const, errorCode: 'PROVIDER_HTTP_ERROR' as const,
        providerId: 'deepseek-official', modelId: 'deepseek-v4-flash', llmStreamCalled: true,
        providerRequestSent: 'confirmed' as const, providerResponseReceived: true,
        failureStage: 'provider_stream' as const, httpStatus: 503, durationMs: 840,
        streamEventCount: 1, responseCharacterCount: 0,
      })),
    }
    render(<RadarSurface xhsRadar={xhsRadar} />)
    fireEvent.click(screen.getByRole('button', { name: '小红书雷达' }))
    await screen.findByText('已登录')
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    fireEvent.click(await screen.findByRole('button', { name: '真实搜索结果' }))
    fireEvent.click(await screen.findByRole('button', { name: '提炼需求' }))

    const diagnostic = await screen.findByTestId('xhs-analysis-diagnostic')
    expect(diagnostic.textContent).toContain('PROVIDER_HTTP_ERROR')
    expect(diagnostic.textContent).toContain('provider_stream')
    expect(diagnostic.textContent).toContain('deepseek-official')
    expect(diagnostic.textContent).toContain('deepseek-v4-flash')
    expect(diagnostic.textContent).toContain('HTTP 503')
    expect(diagnostic.textContent).not.toContain('真实评论隐私内容')
  })

  it('passes the selected official sort to a fresh search and renders every returned first-batch row', async () => {
    mockPublicAPI()
    const feeds = Array.from({ length: 25 }, (_, index) => ({
      id: `feed-${index}`, xsecToken: `token-${index}`, title: `笔记 ${index}`, author: '作者', coverAssetId: null,
      noteType: 'normal' as const, likeCount: null, collectCount: null, commentCount: null,
    }))
    const xhsRadar = {
      getSourceStatus: vi.fn(async () => ({ status: 'connected' as const })),
      search: vi.fn(async () => ({ status: 'ready' as const, feeds, count: feeds.length })),
      detail: vi.fn(),
    }
    render(<RadarSurface xhsRadar={xhsRadar} />)
    fireEvent.click(screen.getByRole('button', { name: '小红书雷达' }))
    await screen.findByText('已登录')
    const sorting = screen.getByRole('combobox', { name: '小红书搜索排序' })
    expect((sorting as HTMLSelectElement).value).toBe('综合')
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    expect(await screen.findByRole('button', { name: '笔记 24' })).toBeTruthy()
    expect(xhsRadar.search).toHaveBeenNthCalledWith(1, { keyword: '设计', sortBy: '综合' })
    fireEvent.change(sorting, { target: { value: '最多点赞' } })
    await waitFor(() => expect(xhsRadar.search).toHaveBeenCalledTimes(2))
    expect(xhsRadar.search).toHaveBeenNthCalledWith(2, { keyword: '设计', sortBy: '最多点赞' })
    expect(screen.getAllByRole('button', { name: /^笔记 \d+$/u })).toHaveLength(25)
  })

  it('shows the safe Host search failure code, stage, duration, and HTTP status', async () => {
    mockPublicAPI()
    const xhsRadar = {
      getSourceStatus: vi.fn(async () => ({ status: 'connected' as const })),
      search: vi.fn(async () => ({
        status: 'search_error' as const,
        diagnostic: { errorCode: 'MCP_BROWSER_ERROR' as const, failureStage: 'mcp_search' as const, durationMs: 1245, httpStatus: 500 },
      })),
      detail: vi.fn(),
    }
    render(<RadarSurface xhsRadar={xhsRadar} />)
    fireEvent.click(screen.getByRole('button', { name: '小红书雷达' }))
    await screen.findByText('已登录')
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    expect(await screen.findByText(/MCP_BROWSER_ERROR · mcp_search · HTTP 500 · 1245 ms/u)).toBeTruthy()
    expect(screen.getByText(/小红书搜索浏览器处理失败/u)).toBeTruthy()
  })

  it('turns a rejected search Remote into a safe transport diagnostic', async () => {
    mockPublicAPI()
    const xhsRadar = {
      getSourceStatus: vi.fn(async () => ({ status: 'connected' as const })),
      search: vi.fn(async () => { throw new Error('private transport detail') }),
      detail: vi.fn(),
    }
    render(<RadarSurface xhsRadar={xhsRadar} />)
    fireEvent.click(screen.getByRole('button', { name: '小红书雷达' }))
    await screen.findByText('已登录')
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    expect(await screen.findByText(/REMOTE_TRANSPORT_ERROR · remote_transport/u)).toBeTruthy()
    expect(screen.getByText(/Workbench 与 Host 通信失败/u)).toBeTruthy()
    expect(screen.queryByText(/private transport detail/u)).toBeNull()
  })

  it('loads detail images only through Host image references and uses a quiet fallback on failure', async () => {
    mockPublicAPI()
    const feed = { id: 'feed-1', xsecToken: 'source-token', title: '多图笔记', author: '作者', coverAssetId: null, noteType: 'normal', likeCount: 1, collectCount: 1, commentCount: 0 }
    const xhsRadar = {
      getSourceStatus: vi.fn(async () => ({ status: 'connected' as const })),
      search: vi.fn(async () => ({ status: 'ready' as const, feeds: [feed], count: 1 })),
      detail: vi.fn(async () => ({ status: 'ready' as const, detail: {
        id: 'feed-1', title: '多图笔记', content: '正文', author: '作者', imageAssetIds: ['asset-detail', null],
        likeCount: 1, collectCount: 1, commentCount: 0, comments: [],
      } })),
      getCoverAsset: vi.fn(async () => ({ status: 'ready' as const, mimeType: 'image/webp', base64: 'AQID', cacheKey: 'asset-detail', cacheHit: false })),
    }
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:xhs-detail-test')
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const { container } = render(<RadarSurface xhsRadar={xhsRadar} />)
    fireEvent.click(screen.getByRole('button', { name: '小红书雷达' }))
    await screen.findByText('已登录')
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    fireEvent.click(await screen.findByRole('button', { name: '多图笔记' }))
    await waitFor(() => expect(xhsRadar.getCoverAsset).toHaveBeenCalledWith({ assetId: 'asset-detail' }))
    const detailImage = container.querySelector('img[alt="笔记图片 1"]')!
    expect(detailImage.getAttribute('src')).toBe('blob:xhs-detail-test')
    expect(screen.getByRole('img', { name: '笔记图片 2 暂不可用' })).toBeTruthy()
    expect(container.querySelectorAll('img[src^="http"]')).toHaveLength(0)
    fireEvent.load(detailImage)
    expect(createObjectUrl).toHaveBeenCalledOnce()
    cleanup()
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:xhs-detail-test')
  })

  it('keeps cover geometry stable and replaces unavailable cover delivery with a quiet placeholder', async () => {
    mockPublicAPI()
    const feeds = [
      { id: 'feed-1', xsecToken: 'source-token', title: '有封面', author: '作者', coverAssetId: 'asset-one', noteType: 'normal' as const, likeCount: 10, collectCount: 3, commentCount: 1 },
      { id: 'feed-2', xsecToken: 'source-token-2', title: '无封面', author: '作者', coverAssetId: null, noteType: 'normal' as const, likeCount: 1, collectCount: 0, commentCount: 0 },
    ]
    const xhsRadar = {
      getSourceStatus: vi.fn(async () => ({ status: 'connected' as const })),
      search: vi.fn(async () => ({ status: 'ready' as const, feeds, count: feeds.length })),
      detail: vi.fn(),
      getCoverAsset: vi.fn(async () => ({ status: 'error' as const })),
    }
    const { container } = render(<RadarSurface xhsRadar={xhsRadar} />)
    fireEvent.click(screen.getByRole('button', { name: '小红书雷达' }))
    await screen.findByText('已登录')
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    await screen.findByRole('button', { name: '有封面' })
    await waitFor(() => expect(xhsRadar.getCoverAsset).toHaveBeenCalledOnce())
    expect(container.querySelectorAll('img')).toHaveLength(0)
    expect(screen.getAllByRole('img', { name: '无封面' })).toHaveLength(2)
    expect(container.querySelectorAll('article')).toHaveLength(2)
  })

  it('loads comments only after the user asks when the default detail has none', async () => {
    mockPublicAPI()
    const feed = { id: 'feed-1', xsecToken: 'source-token', title: '真实搜索结果', author: '作者', coverAssetId: null, noteType: 'normal', likeCount: 10, collectCount: 3, commentCount: 5 }
    const xhsRadar = {
      getSourceStatus: vi.fn(async () => ({ status: 'connected' as const })),
      search: vi.fn(async () => ({ status: 'ready' as const, feeds: [feed], count: 1 })),
      detail: vi.fn(async (input: { readonly loadComments?: boolean }) => ({ status: 'ready' as const, detail: {
        id: 'feed-1', title: '真实搜索结果', content: '来源正文', author: '作者', imageAssetIds: [],
        likeCount: 10, collectCount: 3, commentCount: 5,
        comments: input.loadComments === true ? [{ id: 'comment-1', content: '用户点击后读取的评论', author: '评论作者', likeCount: 4, createdAt: null }] : [],
      } })),
    }
    render(<RadarSurface xhsRadar={xhsRadar} />)
    fireEvent.click(screen.getByRole('button', { name: '小红书雷达' }))
    await screen.findByText('已登录')
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    fireEvent.click(await screen.findByRole('button', { name: '真实搜索结果' }))
    expect(await screen.findByRole('button', { name: '加载评论' })).toBeTruthy()
    expect(xhsRadar.detail).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: '加载评论' }))
    expect(await screen.findByText('用户点击后读取的评论')).toBeTruthy()
    expect(screen.getByText('评论作者')).toBeTruthy()
    expect(screen.getByText('赞 4')).toBeTruthy()
    expect(xhsRadar.detail).toHaveBeenNthCalledWith(2, { id: 'feed-1', xsecToken: 'source-token', loadComments: true })
  })

  it('uses the MCP source status as the login state and disables search while logged out', async () => {
    mockPublicAPI()
    const xhsRadar = {
      getSourceStatus: vi.fn(async () => ({ status: 'logged_out' as const })),
      search: vi.fn(), detail: vi.fn(),
    }
    render(<RadarSurface xhsRadar={xhsRadar} />)
    fireEvent.click(screen.getByRole('button', { name: '小红书雷达' }))
    expect(await screen.findAllByText('未登录')).toHaveLength(2)
    expect(screen.getByText('小红书需要重新登录。')).toBeTruthy()
    expect(screen.getByRole('button', { name: '搜索' }).hasAttribute('disabled')).toBe(true)
    expect(xhsRadar.search).not.toHaveBeenCalled()
  })

  it('shows logged-in state from source status without requesting a QR', async () => {
    mockPublicAPI()
    const xhsRadar = {
      getSourceStatus: vi.fn(async () => ({ status: 'connected' as const })),
      search: vi.fn(), detail: vi.fn(),
    }
    render(<RadarSurface xhsRadar={xhsRadar} />)
    fireEvent.click(screen.getByRole('button', { name: '小红书雷达' }))
    expect(await screen.findByText('已登录')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '登录小红书' })).toBeNull()
  })

  it('refreshes at most five monitored keywords sequentially, isolates a keyword timeout, and derives current-sample signals', async () => {
    mockPublicAPI()
    const calls: string[] = []
    let releaseFirst: ((value: { status: 'ready'; feeds: readonly { id: string; xsecToken: string; title: string; author: string; coverAssetId: null; noteType: 'normal'; likeCount: number; collectCount: number; commentCount: number }[]; count: number }) => void) | undefined
    const firstResult = new Promise<{ status: 'ready'; feeds: readonly { id: string; xsecToken: string; title: string; author: string; coverAssetId: null; noteType: 'normal'; likeCount: number; collectCount: number; commentCount: number }[]; count: number }>(resolve => { releaseFirst = resolve })
    const xhsRadar = {
      getSourceStatus: vi.fn(async () => ({ status: 'connected' as const })),
      search: vi.fn(async ({ keyword }: { readonly keyword: string }) => {
        calls.push(keyword)
        if (keyword === 'AI设计') return firstResult
        if (keyword === 'AI工作流') return { status: 'search_timeout' as const }
        if (keyword === '设计审美') return { status: 'ready' as const, feeds: [], count: 0 }
        if (keyword === 'AI Agent') return { status: 'search_error' as const }
        return { status: 'ready' as const, feeds: [{
          id: 'shared-feed', xsecToken: 'private-token', title: '真实监控结果', author: '作者', coverAssetId: null, noteType: 'normal' as const,
          likeCount: 10, collectCount: 8, commentCount: 6,
        }], count: 1 }
      }),
      detail: vi.fn(),
    }
    render(<RadarSurface xhsRadar={xhsRadar} />)
    fireEvent.click(screen.getByRole('button', { name: '小红书雷达' }))
    await screen.findByText('已登录')
    fireEvent.click(screen.getByRole('button', { name: '今日信号' }))
    fireEvent.click(screen.getByRole('button', { name: '更新小红书情报' }))
    expect(await screen.findByText(/正在更新 1\/5/)).toBeTruthy()
    expect(calls).toEqual(['AI设计'])
    releaseFirst?.({ status: 'ready', feeds: [{
      id: 'shared-feed', xsecToken: 'private-token', title: '真实监控结果', author: '作者', coverAssetId: null, noteType: 'normal',
      likeCount: 10, collectCount: 8, commentCount: 6,
    }], count: 1 })
    await waitFor(() => expect(calls).toHaveLength(5))
    expect(calls).toEqual(['AI设计', '设计审美', 'AI工作流', 'AI Agent', '小红书运营'])
    expect(await screen.findByText('AI工作流 · 超时')).toBeTruthy()
    expect(screen.getByText('设计审美 · 无结果')).toBeTruthy()
    expect(screen.getByText('AI Agent · 失败')).toBeTruthy()
    expect(screen.getByRole('heading', { name: '同一笔记跨关键词重复出现' })).toBeTruthy()
    expect(within(screen.getByLabelText('今日信号')).getAllByRole('article')).toHaveLength(1)
    expect(screen.getByText('交叉信号 · 高互动内容')).toBeTruthy()
    expect(screen.queryByText('private-token')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '爆文观察' }))
    expect(screen.getByText('命中关键词：AI设计、小红书运营 · 高互动评分 44')).toBeTruthy()
    expect(screen.getByRole('button', { name: '真实监控结果' })).toBeTruthy()
  })

  it('shows only content-free cover audit counts and tracks image load outcomes', async () => {
    mockPublicAPI()
    const audit = { rawCoverPresent: true, urlDefaultPresent: true, urlPresent: false, urlPrePresent: false, infoListUrlPresent: false, hostMapped: true }
    const feeds = [
      { id: 'loaded-feed', xsecToken: 'private-1', title: '真实封面', author: '作者', coverAssetId: 'asset-loaded', coverAudit: audit, noteType: 'normal' as const, likeCount: 10, collectCount: 8, commentCount: 6 },
      { id: 'failed-feed', xsecToken: 'private-2', title: '加载失败封面', author: '作者', coverAssetId: 'asset-failed', coverAudit: { ...audit, urlDefaultPresent: false, urlPresent: true }, noteType: 'normal' as const, likeCount: 8, collectCount: 4, commentCount: 2 },
    ]
    const xhsRadar = {
      getSourceStatus: vi.fn(async () => ({ status: 'connected' as const })),
      search: vi.fn(async () => ({ status: 'ready' as const, feeds, count: feeds.length })),
      detail: vi.fn(),
      getCoverAsset: vi.fn(async ({ assetId }: { readonly assetId: string }) => assetId === 'asset-loaded'
        ? { status: 'ready' as const, mimeType: 'image/webp', base64: 'AQID', cacheKey: assetId, cacheHit: false }
        : { status: 'error' as const }),
    }
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:xhs-cover-test')
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    render(<RadarSurface xhsRadar={xhsRadar} />)
    fireEvent.click(screen.getByRole('button', { name: '小红书雷达' }))
    await screen.findByText('已登录')
    fireEvent.click(screen.getByRole('button', { name: '今日信号' }))
    fireEvent.click(screen.getByRole('button', { name: '更新小红书情报' }))
    await waitFor(() => expect(xhsRadar.search).toHaveBeenCalledTimes(5))
    fireEvent.click(screen.getByRole('button', { name: '爆文观察' }))
    const auditPanel = screen.getByText('临时封面链路诊断（仅汇总计数）').closest('details')!
    expect(within(auditPanel).getByText('TOTAL_FEEDS = 2')).toBeTruthy()
    expect(within(auditPanel).getByText('RAW_COVER_PRESENT = 2')).toBeTruthy()
    expect(within(auditPanel).getByText('HOST_MAPPED_COVER = 2')).toBeTruthy()
    expect(within(auditPanel).getByText('RENDERER_COVER_PRESENT = 2')).toBeTruthy()
    await waitFor(() => expect(xhsRadar.getCoverAsset).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(document.querySelectorAll('img')).toHaveLength(1))
    const image = document.querySelector('img')!
    expect(image.src).toBe('blob:xhs-cover-test')
    fireEvent.load(image)
    expect(createObjectUrl).toHaveBeenCalledOnce()
    expect(within(auditPanel).getByText('IMG_LOAD_SUCCESS = 1')).toBeTruthy()
    expect(within(auditPanel).getByText('IMG_LOAD_ERROR = 1')).toBeTruthy()
    expect(within(auditPanel).getByText('IMG_NOT_ATTEMPTED = 0')).toBeTruthy()
    expect(within(auditPanel).getByText('HOST_COVER_FETCH_SUCCESS = 1')).toBeTruthy()
    expect(within(auditPanel).getByText('HOST_COVER_FETCH_FAILED = 1')).toBeTruthy()
    expect(auditPanel.textContent).not.toContain('private-')
    expect(auditPanel.textContent).not.toContain('sns-webpic-qc.xhscdn.com')
    cleanup()
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:xhs-cover-test')
  })

  it('rejects more than five monitored topics instead of silently truncating the user selection', async () => {
    mockPublicAPI()
    const xhsRadar = {
      getSourceStatus: vi.fn(async () => ({ status: 'connected' as const })),
      search: vi.fn(), detail: vi.fn(),
    }
    render(<RadarSurface xhsRadar={xhsRadar} />)
    fireEvent.click(screen.getByRole('button', { name: '小红书雷达' }))
    await screen.findByText('已登录')
    fireEvent.click(screen.getByRole('button', { name: '今日信号' }))
    fireEvent.change(screen.getByLabelText(/监控关键词/), { target: { value: '一，二，三，四，五，六' } })
    expect(screen.getByText(/最多保留 5 个后才能更新/)).toBeTruthy()
    expect((screen.getByRole('button', { name: '更新小红书情报' }) as HTMLButtonElement).disabled).toBe(true)
    expect(xhsRadar.search).not.toHaveBeenCalled()
  })

  it('requires confirmation before starting a bounded pending run and reconnects its progress projection', async () => {
    mockPublicAPI()
    const client = makeReviewClient()
    render(<RadarSurface localAIHOT={client} />)
    enterMyIntelligence()
    expect(await screen.findByText('Pending signal')).toBeTruthy()
    fireEvent.click(within(screen.getByRole('navigation', { name: '情报状态筛选' })).getByRole('button', { name: '待分析' }))
    const checkbox = screen.getByRole('checkbox', { name: '选择待分析：Pending signal' })
    fireEvent.click(checkbox)
    fireEvent.click(screen.getByRole('button', { name: '处理待分析' }))
    expect(screen.getByText('处理 1 条待分析情报')).toBeTruthy()
    expect(client.processPending).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '开始处理' }))
    await waitFor(() => expect(client.processPending).toHaveBeenCalledWith(expect.objectContaining({ articleIds: ['article-pending'], idempotencyKey: expect.any(String) })))
    expect(screen.getByText('正在处理 1 / 1')).toBeTruthy()
    expect(screen.getByText('Pending signal · 正在分析')).toBeTruthy()
    expect(client.pendingRuns).toHaveBeenCalled()
  })

  it('filters persisted reviews without changing AIHOT analysis fields and reads a verdict back after write', async () => {
    mockPublicAPI()
    const client = makeReviewClient()
    render(<RadarSurface localAIHOT={client} />)
    await waitFor(() => expect(client.list).toHaveBeenCalled())
    enterMyIntelligence()
    expect(await screen.findByText('Keep signal')).toBeTruthy()
    fireEvent.click(within(screen.getByRole('navigation', { name: '情报状态筛选' })).getByRole('button', { name: '一般' }))
    expect(screen.getByText('Maybe signal')).toBeTruthy()
    expect(screen.queryByText('Keep signal')).toBeNull()
    fireEvent.click(within(screen.getByRole('navigation', { name: '情报状态筛选' })).getByRole('button', { name: '待分析' }))
    expect(screen.getByText('Pending signal')).toBeTruthy()
    expect(screen.queryByText('Maybe signal')).toBeNull()
    fireEvent.click(within(screen.getByRole('navigation', { name: '情报状态筛选' })).getByRole('button', { name: '全部' }))
    const pendingRow = screen.getByText('Pending signal').closest('article')!
    expect(within(pendingRow).queryByRole('button', { name: '保留' })).toBeNull()
    const reviewableRow = screen.getByText('Ready signal').closest('article')!
    fireEvent.click(within(reviewableRow).getByRole('button', { name: '保留' }))
    await waitFor(() => expect(reviewableRow.textContent).toContain('我的判断 · 保留'))
    expect(client.writeReview).toHaveBeenCalledWith({ articleId: 'article-pending-review', verdict: 'KEEP', reasons: [], note: '' })
    expect(client.review).toHaveBeenCalledWith('article-pending-review')
    expect(localItems[3]?.selected).toBeNull()
    expect(localItems[3]?.score).toBeNull()
  })

  it('shows stale local rows as offline and disables judgment writes until refresh recovers', async () => {
    mockPublicAPI()
    const client = makeReviewClient()
    render(<RadarSurface localAIHOT={client} />)
    await waitFor(() => expect(client.list).toHaveBeenCalled())
    enterMyIntelligence()
    expect(await screen.findByText('Keep signal')).toBeTruthy()
    client.setOffline(true)
    fireEvent.click(screen.getByRole('button', { name: '总览' }))
    enterMyIntelligence()
    const offlineNotice = await screen.findByRole('alert')
    expect(offlineNotice.textContent).toContain('本地 AI 情报暂不可用')
    expect(offlineNotice.textContent).toContain('上次成功读取的数据')
    expect(screen.getByText('Keep signal')).toBeTruthy()
    const keepRow = screen.getByText('Keep signal').closest('article')!
    expect((within(keepRow).getByRole('button', { name: '保留' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    expect((await screen.findByRole('alert')).textContent).toContain('本地 AI 情报暂不可用')
    client.setOffline(false)
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(screen.getByText('Keep signal')).toBeTruthy()
    expect((within(keepRow).getByRole('button', { name: '保留' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('keeps human judgment separate and disables writes when the review read endpoint is unavailable', async () => {
    mockPublicAPI()
    const client = makeReviewClient()
    client.reviews.mockResolvedValue({ status: 'unavailable' })
    client.review.mockResolvedValue({ status: 'unavailable' })
    render(<RadarSurface localAIHOT={client} />)
    await waitFor(() => expect(client.list).toHaveBeenCalled())
    enterMyIntelligence()
    const openButton = await screen.findByRole('button', { name: '打开本地情报：Keep signal' })
    fireEvent.click(openButton)
    expect(await screen.findByText('人工判断暂不可用。')).toBeTruthy()
    expect(screen.getByText('AIHOT 判断')).toBeTruthy()
    expect(screen.getByText('我的判断')).toBeTruthy()
    expect((screen.getByRole('button', { name: '丢弃' }) as HTMLButtonElement).disabled).toBe(true)
    expect(client.writeReview).not.toHaveBeenCalled()
  })

  it('does not show a saved verdict when write or read-back fails', async () => {
    mockPublicAPI()
    const client = makeReviewClient()
    client.writeReview.mockResolvedValue({ status: 'unavailable' })
    render(<RadarSurface localAIHOT={client} />)
    await waitFor(() => expect(client.list).toHaveBeenCalled())
    enterMyIntelligence()
    const reviewRow = (await screen.findByText('Ready signal')).closest('article')!
    fireEvent.click(within(reviewRow).getByRole('button', { name: '丢弃' }))
    expect((await within(reviewRow).findByRole('alert')).textContent).toContain('判断保存失败')
    expect(reviewRow.textContent).toContain('我的判断 · 待判断')
    expect(within(reviewRow).getByRole('button', { name: '丢弃' }).getAttribute('data-selected')).toBe('false')

    client.writeReview.mockResolvedValue({ status: 'available' })
    client.review.mockResolvedValue({ status: 'available', review: null })
    fireEvent.click(within(reviewRow).getByRole('button', { name: '保留' }))
    expect((await within(reviewRow).findByRole('alert')).textContent).toContain('判断保存失败')
    expect(reviewRow.textContent).toContain('我的判断 · 待判断')
    expect(within(reviewRow).getByRole('button', { name: '保留' }).getAttribute('data-selected')).toBe('false')
  })

  it('keeps signal examples in a separate fixture and filters only local examples', () => {
    expect(RADAR_CATEGORIES).toEqual(['全部', '小红书', 'AI', '设计', '商业', '生财'])
    expect(RADAR_SIGNAL_FIXTURES).toHaveLength(4)
    expect(RADAR_PROJECT_FIXTURES).toHaveLength(4)
    for (const signal of RADAR_SIGNAL_FIXTURES) {
      expect(signal.signal_id).toBeTruthy()
      expect(signal.source_name).toBeTruthy()
      expect(signal.source_url).toContain('example.invalid')
      expect(signal.evidence.original_title).toBeTruthy()
      expect(signal.summary).toBeTruthy()
      expect(signal.analysis).toBeTruthy()
    }

    render(<RadarSurface mode="fixture" />)
    const radar = within(screen.getByRole('main', { name: 'Radar' }))
    expect(radar.getByRole('heading', { name: 'Radar' })).toBeTruthy()
    expect(radar.getByRole('heading', { name: '今日值得关注' })).toBeTruthy()
    expect(radar.getByRole('button', { name: /小红书搜索流量出现新的/ })).toBeTruthy()
    fireEvent.click(radar.getByRole('button', { name: 'AI' }))
    expect(radar.getByRole('button', { name: /新的 AI 图像模型/ })).toBeTruthy()
    expect(radar.queryByRole('button', { name: /小红书搜索流量出现新的/ })).toBeNull()
  })

  it('opens a detail that distinguishes source evidence, AI summary, and analysis', () => {
    render(<RadarSurface mode="fixture" />)
    fireEvent.click(screen.getByRole('button', { name: /打开信号：小红书搜索流量出现新的/ }))
    const radar = within(screen.getByRole('main', { name: 'Radar' }))
    expect(radar.getByRole('heading', { name: '原始来源与 Evidence' })).toBeTruthy()
    expect(radar.getByRole('heading', { name: 'AI 摘要' })).toBeTruthy()
    expect(radar.getByRole('heading', { name: '为什么值得关注' })).toBeTruthy()
    expect(radar.getByText(/本地演示资料，不代表真实抓取/)).toBeTruthy()
    expect(radar.getByText(/判断与分析 · 不是来源原话/)).toBeTruthy()
  })

  it('saves Evidence locally with its linked fixture Project', () => {
    render(<RadarSurface mode="fixture" />)
    fireEvent.click(screen.getByRole('button', { name: /打开信号：小红书搜索流量出现新的/ }))
    fireEvent.click(screen.getByRole('button', { name: '保存为 Evidence' }))
    expect(screen.getByRole('button', { name: 'Evidence 已保存' })).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('小红书虚拟产品')
    expect(screen.getByText('已保存（示例）')).toBeTruthy()
  })

  it('requires a fixture Project before saving an unassociated Evidence', () => {
    render(<RadarSurface mode="fixture" />)
    fireEvent.click(screen.getByRole('button', { name: /打开信号：新的 AI 图像模型/ }))
    fireEvent.click(screen.getByRole('button', { name: '保存为 Evidence' }))
    const picker = screen.getByLabelText('选择示例 Project') as HTMLSelectElement
    fireEvent.change(picker, { target: { value: 'project-wechat-ip' } })
    expect(screen.getByRole('button', { name: 'Evidence 已保存' })).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('公众号 IP')
  })

  it('links a fixture Project and creates only a local demo Work state', () => {
    const initialFormalWorks = WORK_FIXTURES.map(work => work.work_id)
    render(<RadarSurface mode="fixture" />)
    fireEvent.click(screen.getByRole('button', { name: /打开信号：新的 AI 图像模型/ }))
    fireEvent.click(screen.getByRole('button', { name: '关联 Project' }))
    fireEvent.change(screen.getByLabelText('选择示例 Project'), { target: { value: 'project-xhs-virtual-product' } })
    expect(screen.getByRole('button', { name: '已关联 · 小红书虚拟产品' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '转成 Work' }))
    expect(screen.getByText('即将创建演示 Work')).toBeTruthy()
    expect(screen.getByText('研究“设计审美训练”搜索趋势')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '确认生成演示 Work' }))
    expect(screen.getByText('已生成演示 Work')).toBeTruthy()
    expect(screen.getByRole('button', { name: '前往 Work →' })).toBeTruthy()
    expect(WORK_FIXTURES.map(work => work.work_id)).toEqual(initialFormalWorks)
  })

  it('switches to the Work workspace only when the demo handoff is activated', () => {
    const select = vi.spyOn(workspaceIdentity, 'selectWorkspaceIdentity')
    render(<RadarSurface mode="fixture" />)
    fireEvent.click(screen.getByRole('button', { name: /打开信号：小红书搜索流量出现新的/ }))
    fireEvent.click(screen.getByRole('button', { name: '转成 Work' }))
    fireEvent.click(screen.getByRole('button', { name: '确认生成演示 Work' }))
    fireEvent.click(screen.getByRole('button', { name: '前往 Work →' }))
    expect(select).toHaveBeenCalledWith('work')
  })
})
