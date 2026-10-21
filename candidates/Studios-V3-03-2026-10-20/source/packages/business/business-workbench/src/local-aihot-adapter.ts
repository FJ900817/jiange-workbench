/** Host-only client for the loopback AIHOT private read API. */

import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import { z } from 'zod'
import type {
  LocalAIHOTIntelligenceDetailResult,
  LocalAIHOTIntelligenceRequest,
  LocalAIHOTIntelligenceResult,
  LocalAIHOTPendingActionResult,
  LocalAIHOTPendingRunRequest,
  LocalAIHOTReviewReason,
  LocalAIHOTReviewResult,
  LocalAIHOTReviewsResult,
  LocalAIHOTReviewVerdict,
  LocalAIHOTReviewWriteRequest,
  LocalAIHOTReviewWriteResult,
} from './types.ts'

const LOCAL_AIHOT_LIST_URL = 'http://127.0.0.1:3000/api/private/workbench/intelligence'
const TOKEN_REF = credentialRef('WORKBENCH_READ_TOKEN')
const REVIEW_TOKEN_REF = credentialRef('WORKBENCH_REVIEW_TOKEN')
const PROCESS_TOKEN_REF = credentialRef('WORKBENCH_PROCESS_TOKEN')
const requestTimeoutMs = 5_000

const itemSchema = z.object({
  articleId: z.string().min(1),
  analysisId: z.string().nullable(),
  title: z.string(),
  url: z.string().url(),
  source: z.string(),
  publishedAt: z.string().nullable(),
  processingState: z.enum(['new', 'analyzed', 'skipped', 'failed', 'blocked']),
  reviewable: z.boolean(),
  intelligenceState: z.enum(['pending_analysis', 'pending_review', 'kept', 'maybe', 'dropped', 'blocked', 'failed']),
  contentBasis: z.enum(['body', 'excerpt', 'none']),
  excerptPreview: z.string().nullable(),
  bodyStatus: z.enum(['pending', 'ok', 'unconfirmed', 'none']),
  score: z.number().nullable(),
  selected: z.boolean().nullable(),
  summary: z.string().nullable(),
  prefilterLabel: z.enum(['PASS', 'BLOCK', 'UNKNOWN']).nullable(),
  prefilterReason: z.string().nullable(),
  category: z.string().nullable(),
  tags: z.array(z.string()),
  topic: z.string().nullable(),
  itemType: z.string().nullable(),
  selectionReason: z.string().nullable(),
}).strict()

const listSchema = z.object({
  schemaVersion: z.literal(2),
  items: z.array(itemSchema),
  page: z.object({ limit: z.number().int().min(1).max(50), nextCursor: z.string().nullable(), hasMore: z.boolean() }).strict(),
  counts: z.object({ articles: z.number().int().nonnegative(), analyses: z.number().int().nonnegative() }).strict(),
}).strict()

const detailSchema = z.object({
  schemaVersion: z.literal(2),
  item: itemSchema.extend({
    excerpt: z.string().nullable(),
    bodyText: z.string().nullable(),
    contentTruncated: z.boolean(),
    structure: z.object({ category: z.string().nullable(), tags: z.array(z.string()), fact: z.json().nullable() }).strict().nullable(),
    analysisCreatedAt: z.string().nullable(),
  }).strict(),
}).strict()

const verdictSchema = z.enum(['KEEP', 'MAYBE', 'DROP'])
const reasonSchema = z.enum(['RELEVANT', 'ACTIONABLE', 'CONTENT_WORTHY', 'TOOL_WORTH_TRYING', 'BUSINESS_SIGNAL', 'TOO_GENERIC', 'PR_NOISE', 'DUPLICATE', 'LOW_VALUE'])
const reviewSchema = z.object({
  articleId: z.string().min(1),
  analysisId: z.string().nullable(),
  verdict: verdictSchema,
  reasons: z.array(reasonSchema),
  note: z.string(),
  reviewedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict()
const reviewResultSchema = z.object({ schemaVersion: z.literal(1), review: reviewSchema.nullable() }).strict()
const reviewsResultSchema = z.object({ schemaVersion: z.literal(1), reviews: z.array(reviewSchema) }).strict()
const pendingRunSchema = z.object({
  runId: z.string().uuid(), createdAt: z.string().datetime(), startedAt: z.string().datetime(), finishedAt: z.string().datetime().nullable(),
  articleCap: z.literal(3), articleCount: z.number().int().min(1).max(3), requestedArticleIds: z.array(z.string().min(1)).min(1).max(3), requestCap: z.number().int().min(1).max(15),
  status: z.enum(['running', 'completed', 'failed', 'safety_stopped', 'interrupted']), safetyStatus: z.enum(['pending', 'passed', 'failed']),
  requestAttempts: z.number().int().nonnegative().max(15), processedCount: z.number().int().nonnegative().max(3), pendingReviewCount: z.number().int().nonnegative(), blockedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(), currentArticle: z.number().int().nonnegative(),
  items: z.array(z.object({ articleId: z.string().min(1), title: z.string(), status: z.enum(['waiting', 'fetching_content', 'analyzing', 'pending_review', 'blocked', 'failed', 'interrupted']) }).strict()).max(3),
  errorCode: z.string().nullable(),
}).strict()
const pendingRunResultSchema = z.object({ schemaVersion: z.literal(1), run: pendingRunSchema }).strict()
const pendingRunsResultSchema = z.object({ schemaVersion: z.literal(1), runs: z.array(pendingRunSchema).max(20) }).strict()

type Fetcher = typeof fetch

/** Reads one bounded local AIHOT page without exposing its bearer token to the Client. */
export async function readLocalAIHOTIntelligence(
  credentials: CredentialProvider | undefined,
  request: LocalAIHOTIntelligenceRequest,
  fetcher: Fetcher = fetch,
): Promise<LocalAIHOTIntelligenceResult> {
  if (credentials === undefined || !validRequest(request)) return { status: 'unavailable' }
  const credential = await credentials.resolve(TOKEN_REF).catch(() => undefined)
  if (credential === undefined) return { status: 'unavailable' }

  const url = new URL(LOCAL_AIHOT_LIST_URL)
  url.searchParams.set('limit', String(request.limit ?? 20))
  if (request.cursor !== undefined) url.searchParams.set('cursor', request.cursor)
  if (request.processingState !== undefined) url.searchParams.set('processingState', request.processingState)
  if (request.source !== undefined) url.searchParams.set('source', request.source)
  try {
    const response = await fetcher(url, {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Bearer ${credential.value}` },
      signal: AbortSignal.timeout(requestTimeoutMs),
    })
    if (!response.ok) return { status: 'unavailable' }
    const result = listSchema.safeParse(await response.json())
    return result.success
      ? { status: 'available', items: result.data.items, page: result.data.page, counts: result.data.counts }
      : { status: 'unavailable' }
  } catch {
    return { status: 'unavailable' }
  }
}

/** Reads one local AIHOT Article detail through the Host-only loopback bridge. */
export async function readLocalAIHOTIntelligenceDetail(
  credentials: CredentialProvider | undefined,
  articleId: string,
  fetcher: Fetcher = fetch,
): Promise<LocalAIHOTIntelligenceDetailResult> {
  if (credentials === undefined || !/^[A-Za-z0-9_-]{1,80}$/u.test(articleId)) return { status: 'unavailable' }
  const credential = await credentials.resolve(TOKEN_REF).catch(() => undefined)
  if (credential === undefined) return { status: 'unavailable' }

  try {
    const response = await fetcher(`${LOCAL_AIHOT_LIST_URL}/${encodeURIComponent(articleId)}`, {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Bearer ${credential.value}` },
      signal: AbortSignal.timeout(requestTimeoutMs),
    })
    if (!response.ok) return { status: 'unavailable' }
    const result = detailSchema.safeParse(await response.json())
    return result.success ? { status: 'available', item: result.data.item } : { status: 'unavailable' }
  } catch {
    return { status: 'unavailable' }
  }
}

/** Read review rows for one bounded list page using the review-only Host credential. */
export async function readLocalAIHOTReviews(
  credentials: CredentialProvider | undefined,
  articleIds: readonly string[],
  fetcher: Fetcher = fetch,
): Promise<LocalAIHOTReviewsResult> {
  if (credentials === undefined || !validArticleIds(articleIds)) return { status: 'unavailable' }
  const credential = await credentials.resolve(REVIEW_TOKEN_REF).catch(() => undefined)
  if (credential === undefined) return { status: 'unavailable' }
  const url = new URL('http://127.0.0.1:3000/api/private/workbench/reviews')
  url.searchParams.set('articleIds', articleIds.join(','))
  try {
    const response = await fetcher(url, {
      method: 'GET', headers: { Accept: 'application/json', Authorization: `Bearer ${credential.value}` },
      signal: AbortSignal.timeout(requestTimeoutMs),
    })
    if (!response.ok) return { status: 'unavailable' }
    const result = reviewsResultSchema.safeParse(await response.json())
    return result.success ? { status: 'available', reviews: result.data.reviews } : { status: 'unavailable' }
  } catch { return { status: 'unavailable' } }
}

/** Read one Article's current review without returning or forwarding its credential. */
export async function readLocalAIHOTReview(
  credentials: CredentialProvider | undefined,
  articleId: string,
  fetcher: Fetcher = fetch,
): Promise<LocalAIHOTReviewResult> {
  if (credentials === undefined || !validArticleIds([articleId])) return { status: 'unavailable' }
  const credential = await credentials.resolve(REVIEW_TOKEN_REF).catch(() => undefined)
  if (credential === undefined) return { status: 'unavailable' }
  try {
    const response = await fetcher(`http://127.0.0.1:3000/api/private/workbench/intelligence/${encodeURIComponent(articleId)}/review`, {
      method: 'GET', headers: { Accept: 'application/json', Authorization: `Bearer ${credential.value}` },
      signal: AbortSignal.timeout(requestTimeoutMs),
    })
    if (!response.ok) return { status: 'unavailable' }
    const result = reviewResultSchema.safeParse(await response.json())
    return result.success ? { status: 'available', review: result.data.review } : { status: 'unavailable' }
  } catch { return { status: 'unavailable' } }
}

/** Submit one human review through the Host-only loopback API; UI callers must read back afterward. */
export async function writeLocalAIHOTReview(
  credentials: CredentialProvider | undefined,
  request: LocalAIHOTReviewWriteRequest,
  fetcher: Fetcher = fetch,
): Promise<LocalAIHOTReviewWriteResult> {
  if (credentials === undefined || !validArticleIds([request.articleId]) || !validReviewInput(request)) return { status: 'unavailable' }
  const credential = await credentials.resolve(REVIEW_TOKEN_REF).catch(() => undefined)
  if (credential === undefined) return { status: 'unavailable' }
  try {
    const response = await fetcher(`http://127.0.0.1:3000/api/private/workbench/intelligence/${encodeURIComponent(request.articleId)}/review`, {
      method: 'PUT',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${credential.value}` },
      body: JSON.stringify({ verdict: request.verdict, reasons: request.reasons, note: request.note }),
      signal: AbortSignal.timeout(requestTimeoutMs),
    })
    if (response.status === 409) {
      const error = z.object({ error: z.literal('ARTICLE_NOT_REVIEWABLE') }).safeParse(await response.json().catch(() => null))
      return error.success ? { status: 'not_reviewable' } : { status: 'unavailable' }
    }
    if (!response.ok) return { status: 'unavailable' }
    return reviewResultSchema.safeParse(await response.json()).success
      ? { status: 'available' }
      : { status: 'unavailable' }
  } catch { return { status: 'unavailable' } }
}

/** Starts one explicitly selected run; the local service computes the request budget. */
export async function processLocalAIHOTPending(
  credentials: CredentialProvider | undefined,
  request: LocalAIHOTPendingRunRequest,
  fetcher: Fetcher = fetch,
): Promise<LocalAIHOTPendingActionResult> {
  if (credentials === undefined || !validPendingRunRequest(request)) return { status: 'invalid_request' }
  const credential = await credentials.resolve(PROCESS_TOKEN_REF).catch(() => undefined)
  if (credential === undefined) return { status: 'unavailable' }
  try {
    const response = await fetcher('http://127.0.0.1:3000/api/private/workbench/pending-runs', {
      method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${credential.value}`, 'Idempotency-Key': request.idempotencyKey },
      body: JSON.stringify({ articleIds: request.articleIds }), signal: AbortSignal.timeout(requestTimeoutMs),
    })
    if (response.status === 409) return mapPendingActionError(await response.json().catch(() => null))
    if (![200, 202].includes(response.status)) return { status: 'unavailable' }
    const result = pendingRunResultSchema.safeParse(await response.json())
    return result.success ? { status: 'available', run: result.data.run } : { status: 'unavailable' }
  } catch { return { status: 'unavailable' } }
}

/** Reads a run after a Client or Host connection interruption without starting another run. */
export async function readLocalAIHOTPendingRun(
  credentials: CredentialProvider | undefined,
  runId: string,
  fetcher: Fetcher = fetch,
): Promise<LocalAIHOTPendingActionResult> {
  if (credentials === undefined || !/^[0-9a-f-]{36}$/iu.test(runId)) return { status: 'invalid_request' }
  const credential = await credentials.resolve(PROCESS_TOKEN_REF).catch(() => undefined)
  if (credential === undefined) return { status: 'unavailable' }
  try {
    const response = await fetcher(`http://127.0.0.1:3000/api/private/workbench/pending-runs/${encodeURIComponent(runId)}`, {
      method: 'GET', headers: { Accept: 'application/json', Authorization: `Bearer ${credential.value}` }, signal: AbortSignal.timeout(requestTimeoutMs),
    })
    if (!response.ok) return { status: 'unavailable' }
    const result = pendingRunResultSchema.safeParse(await response.json())
    return result.success ? { status: 'available', run: result.data.run } : { status: 'unavailable' }
  } catch { return { status: 'unavailable' } }
}

/** Reads persisted recent runs for Radar's compact history section. */
export async function listLocalAIHOTPendingRuns(
  credentials: CredentialProvider | undefined,
  fetcher: Fetcher = fetch,
): Promise<{ readonly status: 'available'; readonly runs: readonly import('./types.ts').LocalAIHOTPendingRun[] } | { readonly status: 'unavailable' }> {
  if (credentials === undefined) return { status: 'unavailable' }
  const credential = await credentials.resolve(PROCESS_TOKEN_REF).catch(() => undefined)
  if (credential === undefined) return { status: 'unavailable' }
  try {
    const response = await fetcher('http://127.0.0.1:3000/api/private/workbench/pending-runs', {
      method: 'GET', headers: { Accept: 'application/json', Authorization: `Bearer ${credential.value}` }, signal: AbortSignal.timeout(requestTimeoutMs),
    })
    if (!response.ok) return { status: 'unavailable' }
    const result = pendingRunsResultSchema.safeParse(await response.json())
    return result.success ? { status: 'available', runs: result.data.runs } : { status: 'unavailable' }
  } catch { return { status: 'unavailable' } }
}

function validRequest(request: LocalAIHOTIntelligenceRequest): boolean {
  return (request.limit === undefined || (Number.isInteger(request.limit) && request.limit >= 1 && request.limit <= 50))
    && (request.cursor === undefined || (request.cursor.length > 0 && request.cursor.length <= 512))
    && (request.source === undefined || (request.source.trim().length > 0 && request.source.length <= 120))
}

function validArticleIds(articleIds: readonly string[]): boolean {
  return articleIds.length <= 50 && articleIds.every(id => /^[A-Za-z0-9_-]{1,80}$/u.test(id))
}

function validReviewInput(request: LocalAIHOTReviewWriteRequest): boolean {
  const verdict: LocalAIHOTReviewVerdict = request.verdict
  const reasons: readonly LocalAIHOTReviewReason[] = request.reasons
  return verdictSchema.safeParse(verdict).success
    && reasons.length <= 9
    && reasons.every(reason => reasonSchema.safeParse(reason).success)
    && new Set(reasons).size === reasons.length
    && typeof request.note === 'string'
    && request.note.length <= 2000
}

function validPendingRunRequest(request: LocalAIHOTPendingRunRequest): boolean {
  return request.articleIds.length >= 1 && request.articleIds.length <= 3
    && /^[A-Za-z0-9_-]{16,100}$/u.test(request.idempotencyKey)
    && request.articleIds.every(id => /^[A-Za-z0-9_-]{1,80}$/u.test(id))
    && new Set(request.articleIds).size === request.articleIds.length
}

function mapPendingActionError(value: unknown): LocalAIHOTPendingActionResult {
  const result = z.object({ error: z.enum(['ARTICLE_ALREADY_PROCESSING', 'ARTICLE_NOT_PENDING_ANALYSIS', 'PROTECTED_RECEIPT_BLOCKED', 'invalid_request']) }).safeParse(value)
  if (!result.success) return { status: 'unavailable' }
  switch (result.data.error) {
    case 'ARTICLE_ALREADY_PROCESSING': return { status: 'already_processing' }
    case 'ARTICLE_NOT_PENDING_ANALYSIS': return { status: 'not_pending' }
    case 'PROTECTED_RECEIPT_BLOCKED': return { status: 'protected_receipt' }
    case 'invalid_request': return { status: 'invalid_request' }
  }
}
