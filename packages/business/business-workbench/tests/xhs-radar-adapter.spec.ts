import { describe, expect, it, vi } from 'vitest'
import { getXhsFeedDetail, getXhsSourceStatus, searchXhsFeeds } from '../src/xhs-radar-adapter.ts'

function clientFactory(result: { readonly isError?: boolean; readonly structuredContent?: unknown; readonly content?: readonly { readonly type?: string; readonly text?: string }[] }) {
  const client = { connect: vi.fn(async () => undefined), callTool: vi.fn(async () => result), close: vi.fn(async () => undefined) }
  const requestedTimeouts: number[] = []
  const factory = ((timeoutMs: number) => {
    requestedTimeouts.push(timeoutMs)
    return { client, transport: {} }
  }) as NonNullable<Parameters<typeof getXhsSourceStatus>[0]>
  return { client, factory, requestedTimeouts }
}

function searchResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('Xiaohongshu Radar Host adapter', () => {
  it('uses only the login-status MCP tool and discards unrelated account data', async () => {
    const { client, factory, requestedTimeouts } = clientFactory({ structuredContent: { data: { is_logged_in: true, user_id: 'private' } } })
    await expect(getXhsSourceStatus(factory)).resolves.toEqual({ status: 'connected' })
    expect(client.callTool).toHaveBeenCalledWith({ name: 'check_login_status', arguments: {} })
    expect(requestedTimeouts).toEqual([35_000])
  })

  it('posts the fixed REST search contract and maps data.feeds/count with absent values as null', async () => {
    const fetcher = vi.fn(async () => searchResponse({ success: true, data: { count: 2, feeds: [{
      id: 'feed-1', xsecToken: 'source-token', noteCard: {
        displayTitle: '真实标题', user: { nickname: '作者' }, type: 'normal',
        cover: { urlDefault: 'https://sns-webpic-qc.xhscdn.com/cover.png' },
        interactInfo: { likedCount: '12', collectedCount: 4, commentCount: 2 },
      },
    }, {}] } }))
    const onTrace = vi.fn()
    const result = await searchXhsFeeds({ keyword: '设计', sortBy: '最多收藏' }, fetcher, onTrace)
    expect(result).toMatchObject({ status: 'ready', count: 2, feeds: [{
        id: 'feed-1', xsecToken: 'source-token', title: '真实标题', author: '作者',
        coverAssetId: expect.any(String), noteType: 'normal', likeCount: 12, collectCount: 4, commentCount: 2,
        coverAudit: { rawCoverPresent: true, urlDefaultPresent: true, urlPresent: false, urlPrePresent: false, infoListUrlPresent: false, hostMapped: true },
      }, {
        id: null, xsecToken: null, title: null, author: null, coverAssetId: null, noteType: null,
        coverAudit: { rawCoverPresent: false, urlDefaultPresent: false, urlPresent: false, urlPrePresent: false, infoListUrlPresent: false, hostMapped: false },
        likeCount: null, collectCount: null, commentCount: null,
      }],
    })
    expect(JSON.stringify(result)).not.toContain('sns-webpic-qc.xhscdn.com')
    expect(fetcher).toHaveBeenCalledOnce()
    expect(fetcher).toHaveBeenCalledWith('http://127.0.0.1:18060/api/v1/feeds/search', expect.objectContaining({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ keyword: '设计', filters: { sort_by: '最多收藏' } }),
    }))
    expect(onTrace).toHaveBeenCalledWith(expect.objectContaining({
      httpStatus: 200, upstreamSuccess: true, topLevelKeys: ['data', 'success'], dataKeys: ['count', 'feeds'], feedsCount: 2,
      errorCode: null, errorType: null, durationMs: expect.any(Number),
    }))
  })

  it('defaults to official combined sorting and preserves every returned row through twenty', async () => {
    const feeds = Array.from({ length: 25 }, (_, index) => ({ id: `feed-${index}` }))
    const fetcher = vi.fn(async () => searchResponse({ success: true, data: { count: feeds.length, feeds } }))
    const result = await searchXhsFeeds({ keyword: '设计' }, fetcher)
    expect(fetcher).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      body: JSON.stringify({ keyword: '设计', filters: { sort_by: '综合' } }),
    }))
    expect(result).toMatchObject({ status: 'ready', count: 25, feeds: expect.any(Array) })
    if (result.status === 'ready') expect(result.feeds).toHaveLength(25)
  })

  it('resolves cover candidates in upstream order and rejects non-web URLs', async () => {
    const fetcher = vi.fn(async () => searchResponse({ success: true, data: { count: 5, feeds: [
      { noteCard: { cover: { urlDefault: 'https://sns-webpic-qc.xhscdn.com/default', url: 'https://sns-webpic-qc.xhscdn.com/url' } } },
      { noteCard: { cover: { urlDefault: '', url: 'http://sns-webpic-qc.xhscdn.com/url', urlPre: 'https://sns-webpic-qc.xhscdn.com/pre' } } },
      { noteCard: { cover: { urlDefault: 'data:image/png,secret', urlPre: '//sns-webpic-qc.xhscdn.com/pre' } } },
      { noteCard: { cover: { infoList: [{ url: 'https://sns-webpic-qc.xhscdn.com/info' }] } } },
      { noteCard: { cover: { urlDefault: 'file:///tmp/image.png', infoList: [{ url: 'javascript:alert(1)' }] } } },
    ] } }))
    const result = await searchXhsFeeds({ keyword: '设计' }, fetcher)
    expect(result).toMatchObject({ status: 'ready', feeds: [
      { coverAssetId: expect.any(String), coverAudit: { rawCoverPresent: true, urlDefaultPresent: true, hostMapped: true } },
      { coverAssetId: expect.any(String), coverAudit: { rawCoverPresent: true, urlPresent: true, hostMapped: true } },
      { coverAssetId: expect.any(String), coverAudit: { rawCoverPresent: true, urlPrePresent: true, hostMapped: true } },
      { coverAssetId: expect.any(String), coverAudit: { rawCoverPresent: true, infoListUrlPresent: true, hostMapped: true } },
      { coverAssetId: null, coverAudit: { rawCoverPresent: true, hostMapped: false } },
    ] })
    expect(JSON.stringify(result)).not.toContain('sns-webpic-qc.xhscdn.com')
  })

  it('uses the dedicated 75-second search timeout', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => new AbortController().signal)
    const fetcher = vi.fn(async () => searchResponse({ success: true, data: { count: 0, feeds: [] } }))
    try {
      await expect(searchXhsFeeds({ keyword: '设计' }, fetcher)).resolves.toEqual({ status: 'empty', count: 0 })
      expect(timeout).toHaveBeenCalledOnce()
      expect(timeout).toHaveBeenCalledWith(75_000)
    } finally {
      timeout.mockRestore()
    }
  })

  it('maps detail with default returned comments and calls no expansion arguments', async () => {
    const { client, factory, requestedTimeouts } = clientFactory({ content: [{ type: 'text', text: JSON.stringify({ data: { note: {
      id: 'feed-1', title: '标题', desc: '正文', user: { nickname: '作者' },
      interactInfo: { likedCount: 3, collectedCount: 2, commentCount: 1 },
      images: [{ urlDefault: 'http://sns-img-qc.xhscdn.com/one.png' }],
      comments: [{ id: 'comment-1', content: '原始评论', user: { nickname: '评论者' }, likeCount: 1, created_at: '2026-10-01' }],
    } } }) }] })
    const result = await getXhsFeedDetail({ id: 'feed-1', xsecToken: 'source-token' }, factory)
    expect(result).toMatchObject({
      status: 'ready', detail: {
        id: 'feed-1', title: '标题', content: '正文', author: '作者',
        imageAssetIds: [expect.any(String)], likeCount: 3, collectCount: 2, commentCount: 1,
        comments: [{ id: 'comment-1', content: '原始评论', author: '评论者', likeCount: 1, createdAt: '2026-10-01' }],
      },
    })
    expect(JSON.stringify(result)).not.toContain('sns-img-qc.xhscdn.com')
    expect(client.callTool).toHaveBeenCalledWith({ name: 'get_feed_detail', arguments: { feed_id: 'feed-1', xsec_token: 'source-token' } })
    expect(requestedTimeouts).toEqual([35_000])
  })

  it('loads at most ten top-level comments only on an explicit request', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => new AbortController().signal)
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        feed_id: 'feed-1', xsec_token: 'source-token', load_all_comments: true,
        comment_config: { click_more_replies: false, max_comment_items: 10, scroll_speed: 'normal' },
      })
      return searchResponse({ success: true, data: { feed_id: 'feed-1', data: {
        note: { id: 'feed-1', title: '标题', desc: '正文', interactInfo: { commentCount: 5 } },
        comments: { list: [
          { id: 'c1', content: '评论内容', userInfo: { nickname: '评论作者' }, likeCount: 4, createTime: '2026-10-06', xsec_token: 'must-not-project' },
          { id: 'c2', content: '第二条评论', userInfo: {}, likeCount: 0 },
        ], cursor: 'internal-cursor', hasMore: true },
      } } })
    })
    try {
      const result = await getXhsFeedDetail({ id: 'feed-1', xsecToken: 'source-token', loadComments: true }, undefined, fetcher)
      expect(result).toMatchObject({
        status: 'ready', detail: { id: 'feed-1', title: '标题', content: '正文', commentCount: 5, comments: [
          { id: 'c1', content: '评论内容', author: '评论作者', likeCount: 4, createdAt: '2026-10-06' },
          { id: 'c2', content: '第二条评论', author: null, likeCount: 0, createdAt: null },
        ] },
      })
      expect(JSON.stringify(result)).not.toContain('xsec_token')
      expect(JSON.stringify(result)).not.toContain('internal-cursor')
      expect(fetcher).toHaveBeenCalledOnce()
      expect(fetcher.mock.calls[0]?.[0]).toBe('http://127.0.0.1:18060/api/v1/feeds/detail')
      expect(timeout).toHaveBeenCalledOnce()
      expect(timeout).toHaveBeenCalledWith(120_000)
    } finally {
      timeout.mockRestore()
    }
  })

  it('returns a ready detail with an empty comment list for the double-data response', async () => {
    const fetcher = vi.fn(async () => searchResponse({
      success: true,
      data: { feed_id: 'feed-1', data: { note: { id: 'feed-1', title: '标题' }, comments: { list: [], cursor: '', hasMore: false } } },
    }))
    await expect(getXhsFeedDetail({ id: 'feed-1', xsecToken: 'source-token', loadComments: true }, undefined, fetcher)).resolves.toMatchObject({
      status: 'ready', detail: { comments: [] },
    })
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('classifies upstream timeout details and empty REST results without retrying', async () => {
    const timeoutFetcher = vi.fn(async () => searchResponse({
      success: false, error: { code: 'BROWSER_TIMEOUT', message: 'context deadline exceeded: Page.MustWait' },
    }, 500))
    const onTrace = vi.fn()
    await expect(searchXhsFeeds({ keyword: '设计' }, timeoutFetcher, onTrace)).resolves.toMatchObject({
      status: 'search_timeout', diagnostic: { errorCode: 'MCP_TIMEOUT', failureStage: 'mcp_search', httpStatus: 500 },
    })
    expect(timeoutFetcher).toHaveBeenCalledOnce()
    expect(onTrace).toHaveBeenCalledWith(expect.objectContaining({
      httpStatus: 500, upstreamSuccess: false, topLevelKeys: ['error', 'success'], dataKeys: [], feedsCount: 0,
      errorCode: 'XHS_SEARCH_TIMEOUT', errorType: 'HttpError', durationMs: expect.any(Number),
    }))
    const emptyFetcher = vi.fn(async () => searchResponse({ success: true, data: { count: 0, feeds: [] } }))
    await expect(searchXhsFeeds({ keyword: '设计' }, emptyFetcher)).resolves.toEqual({ status: 'empty', count: 0 })
  })

  it('classifies the official top-level REST error envelope without exposing code or details', async () => {
    const privateDetail = 'context deadline exceeded: request carried private-token'
    const fetcher = vi.fn(async () => searchResponse({
      code: 'SEARCH_FEEDS_FAILED', error: '搜索Feeds失败', details: privateDetail,
    }, 500))
    const onTrace = vi.fn()
    const result = await searchXhsFeeds({ keyword: '设计' }, fetcher, onTrace)

    expect(result).toMatchObject({
      status: 'search_timeout',
      diagnostic: { errorCode: 'MCP_TIMEOUT', failureStage: 'mcp_search', httpStatus: 500 },
    })
    expect(onTrace).toHaveBeenCalledWith(expect.objectContaining({
      httpStatus: 500, errorCode: 'XHS_SEARCH_TIMEOUT', errorType: 'HttpError',
    }))
    expect(JSON.stringify(result)).not.toContain('SEARCH_FEEDS_FAILED')
    expect(JSON.stringify(result)).not.toContain(privateDetail)
    expect(JSON.stringify(onTrace.mock.calls)).not.toContain(privateDetail)
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('classifies navigation and upstream response failures while leaving unknown fetch failures unknown', async () => {
    const cases = [
      { details: 'navigation failure while opening search results', traceCode: 'XHS_SEARCH_BROWSER_ERROR', resultCode: 'MCP_BROWSER_ERROR' },
      { details: 'upstream response failure', traceCode: 'XHS_SEARCH_UPSTREAM_ERROR', resultCode: 'MCP_UPSTREAM_ERROR' },
    ] as const
    for (const testCase of cases) {
      const onTrace = vi.fn()
      const fetcher = vi.fn(async () => searchResponse({
        code: 'SEARCH_FEEDS_FAILED', error: '搜索Feeds失败', details: testCase.details,
      }, 500))
      const result = await searchXhsFeeds({ keyword: '设计' }, fetcher, onTrace)
      expect(result).toMatchObject({ status: 'search_error', diagnostic: { errorCode: testCase.resultCode, httpStatus: 500 } })
      expect(onTrace).toHaveBeenCalledWith(expect.objectContaining({ errorCode: testCase.traceCode }))
      expect(JSON.stringify(onTrace.mock.calls)).not.toContain(testCase.details)
    }
    const unknownFetcher = vi.fn(async () => { throw new Error('unrecognized internal failure') })
    const unknownTrace = vi.fn()
    await expect(searchXhsFeeds({ keyword: '设计' }, unknownFetcher, unknownTrace)).resolves.toMatchObject({
      status: 'search_error', diagnostic: { errorCode: 'UNKNOWN', failureStage: 'unknown', httpStatus: null },
    })
    expect(unknownTrace).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 'XHS_SEARCH_UNKNOWN' }))

    const unknownBodyTrace = vi.fn()
    const unknownBodyFetcher = vi.fn(async () => searchResponse({
      code: 'SEARCH_FEEDS_FAILED', error: '搜索Feeds失败', details: 'unrecognized private failure text',
    }, 500))
    await expect(searchXhsFeeds({ keyword: '设计' }, unknownBodyFetcher, unknownBodyTrace)).resolves.toMatchObject({
      status: 'search_error', diagnostic: { errorCode: 'MCP_SEARCH_ERROR', httpStatus: 500 },
    })
    expect(unknownBodyTrace).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 'XHS_SEARCH_UPSTREAM_5XX' }))
    expect(JSON.stringify(unknownBodyTrace.mock.calls)).not.toContain('unrecognized private failure text')
  })

  it('returns safe search failure diagnostics without exposing raw error text', async () => {
    const cases: readonly [Response | Error, string, number | null][] = [
      [searchResponse({ success: false, error: { message: 'temporary upstream issue' } }, 503), 'XHS_SEARCH_UPSTREAM_5XX', 503],
      [searchResponse({ success: false, error: { message: 'login expired' } }, 401), 'XHS_SEARCH_NOT_AUTHENTICATED', 401],
      [searchResponse({ success: true, data: { feeds: 'invalid' } }), 'XHS_SEARCH_RESPONSE_INVALID', 200],
      [new TypeError('fetch failed: private network detail'), 'XHS_SEARCH_CONNECTION_ERROR', null],
      [new Error('private unexpected message'), 'XHS_SEARCH_UNKNOWN', null],
    ]
    for (const [failure, errorCode, httpStatus] of cases) {
      const fetcher = vi.fn(async () => {
        if (failure instanceof Error) throw failure
        return failure
      })
      const onTrace = vi.fn()
      const result = await searchXhsFeeds({ keyword: '设计' }, fetcher, onTrace)
      expect(result.status).not.toBe('ready')
      expect(result.status).not.toBe('empty')
      if (result.status === 'ready' || result.status === 'empty') throw new Error('expected a search failure')
      expect(result.diagnostic).toMatchObject({ httpStatus, durationMs: expect.any(Number) })
      expect(onTrace).toHaveBeenCalledWith(expect.objectContaining({
        errorCode, httpStatus, durationMs: expect.any(Number),
      }))
      expect(onTrace.mock.calls[0]?.[0]).toHaveProperty('errorType')
      expect(JSON.stringify(onTrace.mock.calls)).not.toContain('private')
    }
  })

  it('does not send a search when the keyword is blank and maps missing detail credentials as an error', async () => {
    const fetcher = vi.fn(async () => searchResponse({ success: true, data: { count: 0, feeds: [] } }))
    await expect(searchXhsFeeds({ keyword: '   ' }, fetcher)).resolves.toEqual({ status: 'search_error' })
    expect(fetcher).not.toHaveBeenCalled()
    const empty = clientFactory({ structuredContent: { data: { feeds: [] } } })
    await expect(getXhsFeedDetail({ id: '', xsecToken: '' }, empty.factory)).resolves.toEqual({ status: 'detail_error' })
    expect(empty.client.callTool).not.toHaveBeenCalled()
  })

  it('does not guess top-level or alternate result paths', async () => {
    const fetcher = vi.fn(async () => searchResponse({ success: true, feeds: [{ id: 'not-the-contract' }] }))
    await expect(searchXhsFeeds({ keyword: '设计' }, fetcher)).resolves.toMatchObject({
      status: 'search_error', diagnostic: { errorCode: 'RESULT_MAPPING_ERROR', failureStage: 'result_mapping', httpStatus: 200 },
    })
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('distinguishes MCP connection failures from unknown errors without forwarding exception text', async () => {
    const connectionFetcher = vi.fn(async () => { throw new TypeError('fetch failed: private network detail') })
    await expect(searchXhsFeeds({ keyword: '设计' }, connectionFetcher)).resolves.toMatchObject({
      status: 'source_offline', diagnostic: { errorCode: 'MCP_UNAVAILABLE', failureStage: 'mcp_connect', httpStatus: null },
    })
    const unknownFetcher = vi.fn(async () => { throw new Error('private unexpected message') })
    const unknown = await searchXhsFeeds({ keyword: '设计' }, unknownFetcher)
    expect(unknown).toMatchObject({
      status: 'search_error', diagnostic: { errorCode: 'UNKNOWN', failureStage: 'unknown', httpStatus: null },
    })
    expect(JSON.stringify(unknown)).not.toContain('private')
  })

  it('returns an MCP timeout diagnostic only when the search request actually times out', async () => {
    const timeoutFetcher = vi.fn(async () => { throw new DOMException('request timed out', 'TimeoutError') })
    await expect(searchXhsFeeds({ keyword: '设计' }, timeoutFetcher)).resolves.toMatchObject({
      status: 'search_timeout', diagnostic: { errorCode: 'MCP_TIMEOUT', failureStage: 'mcp_search', httpStatus: null },
    })
    expect(timeoutFetcher).toHaveBeenCalledOnce()
  })
})
