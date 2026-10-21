import { describe, expect, it, vi } from 'vitest'
import { listLocalAIHOTPendingRuns, processLocalAIHOTPending, readLocalAIHOTPendingRun, readLocalAIHOTIntelligence, readLocalAIHOTIntelligenceDetail, readLocalAIHOTReview, readLocalAIHOTReviews, writeLocalAIHOTReview } from '../src/local-aihot-adapter.ts'
import type { LocalAIHOTIntelligenceItem, LocalAIHOTPendingRun } from '../src/types.ts'

const token = 'isolated-test-token'
const reviewToken = 'isolated-review-test-token'
const processToken = 'isolated-process-test-token'
const resolveCredential = vi.fn(async (ref: string) => ({ value: ref === 'WORKBENCH_REVIEW_TOKEN' ? reviewToken : ref === 'WORKBENCH_PROCESS_TOKEN' ? processToken : token, source: 'test' }))
const credentials = { resolve: resolveCredential } as never
const item: LocalAIHOTIntelligenceItem = {
  articleId: 'article-1', analysisId: '1', title: 'Title', url: 'https://example.test/article', source: 'Source',
  publishedAt: null, processingState: 'analyzed', reviewable: true, intelligenceState: 'pending_review', contentBasis: 'body', excerptPreview: 'Excerpt', bodyStatus: 'ok', score: 7, selected: true, summary: 'Summary',
  prefilterLabel: 'PASS', prefilterReason: 'Reason', category: 'tool', tags: ['agent'], topic: null, itemType: null,
  selectionReason: null,
}
const pendingRun: LocalAIHOTPendingRun = {
  runId: 'f364ad98-f4a9-4b19-933b-0e391fe715e9', createdAt: '2026-10-04T09:00:00.000Z', startedAt: '2026-10-04T09:00:00.000Z', finishedAt: null,
  articleCap: 3, articleCount: 1, requestedArticleIds: ['article-1'], requestCap: 5,
  status: 'running', safetyStatus: 'pending', requestAttempts: 2, processedCount: 0, pendingReviewCount: 0, blockedCount: 0, failedCount: 0,
  currentArticle: 1, items: [{ articleId: 'article-1', title: 'Title', status: 'analyzing' }], errorCode: null,
}

describe('local AIHOT Host adapter', () => {
  it('keeps an unset credential unavailable without making a request', async () => {
    const fetcher = vi.fn()
    await expect(readLocalAIHOTIntelligence(undefined, {}, fetcher)).resolves.toEqual({ status: 'unavailable' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('sends the credential only from the Host to the fixed loopback list API', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(_input)).toBe('http://127.0.0.1:3000/api/private/workbench/intelligence?limit=20')
      expect(init?.method).toBe('GET')
      expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${token}`)
      return Response.json({ schemaVersion: 2, items: [item], page: { limit: 20, nextCursor: null, hasMore: false }, counts: { articles: 18, analyses: 4 } })
    })

    const result = await readLocalAIHOTIntelligence(credentials, {}, fetcher)

    expect(result).toEqual({ status: 'available', items: [item], page: { limit: 20, nextCursor: null, hasMore: false }, counts: { articles: 18, analyses: 4 } })
    expect(JSON.stringify(result)).not.toContain(token)
  })

  it('maps unauthorized, malformed, and transport failures to one content-free unavailable state', async () => {
    for (const fetcher of [
      vi.fn(async () => new Response(null, { status: 401 })),
      vi.fn(async () => Response.json({ schemaVersion: 2, items: [{ ...item, topic: 'inferred' }] })),
      vi.fn(async () => { throw new TypeError('network failure') }),
    ]) {
      await expect(readLocalAIHOTIntelligence(credentials, {}, fetcher)).resolves.toEqual({ status: 'unavailable' })
    }
  })

  it('reads a validated detail by an encoded Article id and keeps absent persisted fields null', async () => {
    const detail = { ...item, excerpt: 'Excerpt', bodyText: 'Body', contentTruncated: false, structure: { category: 'tool', tags: ['agent'], fact: null }, analysisCreatedAt: null }
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('http://127.0.0.1:3000/api/private/workbench/intelligence/article-1')
      expect(init?.method).toBe('GET')
      return Response.json({ schemaVersion: 2, item: detail })
    })
    await expect(readLocalAIHOTIntelligenceDetail(credentials, 'article-1', fetcher)).resolves.toEqual({ status: 'available', item: detail })
    await expect(readLocalAIHOTIntelligenceDetail(credentials, '../private', fetcher)).resolves.toEqual({ status: 'unavailable' })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('rejects caller-controlled list bounds before network access', async () => {
    const fetcher = vi.fn()
    await expect(readLocalAIHOTIntelligence(credentials, { limit: 51 }, fetcher)).resolves.toEqual({ status: 'unavailable' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('uses a separate review credential for batch and detail reads', async () => {
    const review = { articleId: 'article-1', analysisId: '1', verdict: 'DROP', reasons: ['PR_NOISE'], note: '', reviewedAt: '2026-10-03T12:00:00.000Z', updatedAt: '2026-10-03T12:00:00.000Z' }
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${reviewToken}`)
      if (String(input).includes('/reviews?')) return Response.json({ schemaVersion: 1, reviews: [review] })
      return Response.json({ schemaVersion: 1, review })
    })
    await expect(readLocalAIHOTReviews(credentials, ['article-1'], fetcher)).resolves.toEqual({ status: 'available', reviews: [review] })
    await expect(readLocalAIHOTReview(credentials, 'article-1', fetcher)).resolves.toEqual({ status: 'available', review })
    expect(resolveCredential).toHaveBeenCalledWith('WORKBENCH_REVIEW_TOKEN')
    expect(JSON.stringify(fetcher.mock.calls.map(call => call[1]?.headers))).not.toContain(token)
  })

  it('writes only the human judgment and never returns the review token', async () => {
    const request = { articleId: 'article-1', verdict: 'KEEP' as const, reasons: ['RELEVANT' as const, 'ACTIONABLE' as const], note: 'Human note' }
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('http://127.0.0.1:3000/api/private/workbench/intelligence/article-1/review')
      expect(init?.method).toBe('PUT')
      expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${reviewToken}`)
      expect(JSON.parse(String(init?.body))).toEqual({ verdict: 'KEEP', reasons: ['RELEVANT', 'ACTIONABLE'], note: 'Human note' })
      return Response.json({ schemaVersion: 1, review: { analysisId: '1', ...request, reviewedAt: '2026-10-03T12:00:00.000Z', updatedAt: '2026-10-03T12:00:00.000Z' } })
    })
    await expect(writeLocalAIHOTReview(credentials, request, fetcher)).resolves.toEqual({ status: 'available' })
    expect(JSON.stringify(await writeLocalAIHOTReview(credentials, request, fetcher))).not.toContain(reviewToken)
    await expect(writeLocalAIHOTReview(credentials, { ...request, articleId: '../x' }, fetcher)).resolves.toEqual({ status: 'unavailable' })
    await expect(writeLocalAIHOTReview(credentials, { ...request, reasons: ['RELEVANT', 'RELEVANT'] }, fetcher)).resolves.toEqual({ status: 'unavailable' })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('surfaces the explicit server-side not-reviewable rejection', async () => {
    const fetcher = vi.fn(async () => Response.json({ error: 'ARTICLE_NOT_REVIEWABLE' }, { status: 409 }))
    await expect(writeLocalAIHOTReview(credentials, { articleId: 'article-pending', verdict: 'KEEP', reasons: [], note: '' }, fetcher)).resolves.toEqual({ status: 'not_reviewable' })
  })

  it('starts and reconnects only bounded pending-analysis runs through the separate process credential', async () => {
    const request = { articleIds: ['article-1'], idempotencyKey: 'run-key-0123456789' }
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${processToken}`)
      if (init?.method === 'POST') {
        expect(String(input)).toBe('http://127.0.0.1:3000/api/private/workbench/pending-runs')
        expect(JSON.parse(String(init.body))).toEqual({ articleIds: request.articleIds })
        expect(new Headers(init.headers).get('idempotency-key')).toBe(request.idempotencyKey)
      } else expect(String(input)).toContain(`/pending-runs/${pendingRun.runId}`)
      return Response.json({ schemaVersion: 1, run: pendingRun }, { status: 202 })
    })
    await expect(processLocalAIHOTPending(credentials, request, fetcher)).resolves.toEqual({ status: 'available', run: pendingRun })
    await expect(readLocalAIHOTPendingRun(credentials, pendingRun.runId, fetcher)).resolves.toEqual({ status: 'available', run: pendingRun })
    await expect(processLocalAIHOTPending(credentials, { ...request, articleIds: ['article-1', 'article-1'] }, fetcher)).resolves.toEqual({ status: 'invalid_request' })
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(await processLocalAIHOTPending(credentials, request, fetcher))).not.toContain(processToken)
  })

  it('reads bounded recent controlled runs using the process credential', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('http://127.0.0.1:3000/api/private/workbench/pending-runs')
      expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${processToken}`)
      return Response.json({ schemaVersion: 1, runs: [pendingRun] })
    })
    await expect(listLocalAIHOTPendingRuns(credentials, fetcher)).resolves.toEqual({ status: 'available', runs: [pendingRun] })
  })
})
