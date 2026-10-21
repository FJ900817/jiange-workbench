/** Stateless, bounded XHS comment analysis through the configured Harness LLM runtime. */

import { createHash } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { createUserMessage, ReasoningEffortId, type GenerateOptions, type LlmRuntime, type StreamChunk } from '@deepseek-ai/dsh-llm'
import type {
  XhsCommentAnalysisErrorCode,
  XhsCommentAnalysisFailureStage,
  XhsCommentAnalysisRequestStatus,
  XhsCommentAnalysisRequest,
  XhsCommentAnalysisResult,
  XhsCommentAnalysisTrace,
  XhsCommentInsight,
  XhsCommentInsightCategory,
} from './types.ts'

const ANALYSIS_TIMEOUT_MS = 20_000
const MAX_INPUT_COMMENTS = 10
const MAX_INSIGHT_LENGTH = 120
const MAX_PER_CATEGORY = 3
const MAX_INSIGHTS = 15
const CACHE_CAPACITY = 50
const MAX_RESPONSE_CHARS = 24_000
const PROVIDER = 'deepseek-official'
const MODEL = 'deepseek-v4-flash'
const CATEGORIES: readonly XhsCommentInsightCategory[] = ['question', 'blocker', 'desired_outcome', 'content_opportunity', 'commercial_demand']
const SYSTEM_PROMPT = [
  '仅据输入笔记和评论分析，不用外部常识。',
  'question=所问；blocker=困难；desired_outcome=真实目标；content_opportunity=评论支持的内容机会；commercial_demand=明确的购买、付费或服务需求。',
  '每条必须引用直接证据；无证据不输出。不得推断购买意愿、转化率或市场规模。',
  '最多每类 3 条、总计 15 条；insight 不超过 120 字。只返回 JSON，无解释、Markdown 或 confidence：{"insights":[{"category":"question|blocker|desired_outcome|content_opportunity|commercial_demand","insight":"...","evidenceRefs":["C01"]}]}。',
].join('\n')

type SafeComment = { readonly ref: string; readonly text: string }
type SafePayload = { readonly noteTitle: string; readonly noteText: string; readonly comments: readonly SafeComment[] }
type CachedAnalysis = Extract<XhsCommentAnalysisResult, { status: 'ready' }>
type CommentAnalysisRoute = { readonly provider: string; readonly model: string }
type CommentAnalysisLlm = Pick<LlmRuntime, 'stream' | 'listProviders' | 'resolveModelInfo'>
type StreamDiagnostics = { streamEventCount: number; responseCharacterCount: number; httpStatus?: number }

/** Keeps only final validated insights in a bounded process-memory LRU. */
export class XhsCommentAnalysisCache {
  private readonly entries = new Map<string, CachedAnalysis>()

  /** Read one validated result and promote it to the newest LRU position. */
  get(key: string): CachedAnalysis | undefined {
    const value = this.entries.get(key)
    if (value === undefined) return undefined
    this.entries.delete(key)
    this.entries.set(key, value)
    return structuredClone(value)
  }

  /** Retain only sanitized output and evict the least recently used result above capacity. */
  set(key: string, value: CachedAnalysis): void {
    this.entries.delete(key)
    this.entries.set(key, structuredClone(value))
    if (this.entries.size > CACHE_CAPACITY) this.entries.delete(this.entries.keys().next().value as string)
  }
}

/**
 * Analyze at most ten non-empty comments without creating an Agent or Session.
 * This is an explicitly approved XHS Comment Analysis exception to the
 * session-reconstructability rule; raw comments and provider output must not persist.
 * @param llm - Existing Harness model runtime.
 * @param route - Explicit XHS Comment Analysis route from the Workbench deployment configuration.
 * @param request - One note and its currently loaded comments.
 * @param cache - Process-local cache of validated insights only.
 * @returns Validated insights or a content-free analysis failure.
 */
export async function analyzeXhsComments(
  llm: CommentAnalysisLlm,
  route: CommentAnalysisRoute | undefined,
  request: XhsCommentAnalysisRequest,
  cache: XhsCommentAnalysisCache,
): Promise<XhsCommentAnalysisResult> {
  const startedAt = performance.now()
  if (route === undefined) return failure('COMMENT_ANALYSIS_ROUTE_NOT_CONFIGURED', 'route', false, startedAt, route)
  if (route.provider !== PROVIDER || route.model !== MODEL) return failure('COMMENT_ANALYSIS_ROUTE_INVALID', 'route', false, startedAt, route)
  try {
    if (!llm.listProviders().some(provider => provider.id === PROVIDER)) return failure('COMMENT_ANALYSIS_ROUTE_UNAVAILABLE', 'route', false, startedAt, route)
    const resolved = await llm.resolveModelInfo(PROVIDER, MODEL)
    if (resolved.provider !== PROVIDER || resolved.id !== MODEL) return failure('COMMENT_ANALYSIS_ROUTE_UNAVAILABLE', 'route', false, startedAt, route)
  } catch {
    return failure('COMMENT_ANALYSIS_ROUTE_UNAVAILABLE', 'route', false, startedAt, route)
  }
  if (!isAnalysisRequest(request) || request.noteId.trim().length === 0) return failure('UNKNOWN_ANALYSIS_ERROR', 'input_validation', false, startedAt, route)
  const payload = preparePayload(request)
  if (payload.comments.length === 0) return { status: 'no_comments' }
  const cacheKey = cacheFingerprint(request, payload)
  const cached = cache.get(cacheKey)
  if (cached !== undefined) return { ...cached, cacheHit: true }

  const controller = new AbortController()
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  let didTimeout = false
  const diagnostics: StreamDiagnostics = { streamEventCount: 0, responseCharacterCount: 0 }
  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      didTimeout = true
      controller.abort()
      reject(new AnalysisTimeoutError())
    }, ANALYSIS_TIMEOUT_MS)
  })
  try {
    const options: GenerateOptions = {
      provider: PROVIDER,
      model: MODEL,
      reasoningEffort: ReasoningEffortId('off'),
      messages: [createUserMessage({
        content: [{ type: 'text', text: JSON.stringify(payload) }],
        source: { kind: 'plugin', plugin: 'dsh-business-workbench' },
      })],
      system: SYSTEM_PROMPT,
      temperature: 0,
      maxTokens: 4_096,
      signal: controller.signal,
    }
    const rawResponse = await Promise.race([collectText(llm.stream(options), diagnostics), timeout])
    const parsed = parseResponse(rawResponse)
    if (!parsed.ok) return failure('ANALYSIS_PARSE_ERROR', 'response_parse', true, startedAt, route, diagnostics)
    let validated: ReturnType<typeof validateInsights>
    try {
      validated = validateInsights(parsed.value, payload.comments)
    } catch {
      return failure('SCHEMA_NO_VALID_INSIGHTS', 'schema_validation', true, startedAt, route, diagnostics)
    }
    if (validated.insights.length === 0) {
      const stage = validated.trace.invalidEvidenceRefCount > 0 || validated.trace.ungroundedInsightCount > 0 ? 'evidence_validation' : 'schema_validation'
      return failure('SCHEMA_NO_VALID_INSIGHTS', stage, true, startedAt, route, diagnostics)
    }
    const result: CachedAnalysis = {
      status: 'ready',
      insights: validated.insights,
      trace: validated.trace,
      cacheHit: false,
    }
    cache.set(cacheKey, result)
    return result
  } catch (error) {
    if (didTimeout || error instanceof AnalysisTimeoutError) return failure('ANALYSIS_TIMEOUT', 'provider_stream', true, startedAt, route, diagnostics)
    if (error instanceof EmptyResponseError) return failure('EMPTY_RESPONSE', 'provider_response', true, startedAt, route, diagnostics)
    if (error instanceof ResponseLimitError) return failure('ANALYSIS_RESPONSE_TOO_LARGE', 'provider_response', true, startedAt, route, diagnostics)
    const status = error instanceof ProviderStreamError ? error.httpStatus : getHttpStatus(error)
    if (status === 401 || status === 403) return failure('CREDENTIAL_ERROR', 'provider_stream', true, startedAt, route, diagnostics, status)
    if (status !== undefined) return failure('PROVIDER_HTTP_ERROR', 'provider_stream', true, startedAt, route, diagnostics, status)
    if (error instanceof ProviderStreamError && error.providerFailureCode === 'EMPTY_RESPONSE') {
      return failure('PROVIDER_EMPTY_RESPONSE', 'provider_response', true, startedAt, route, diagnostics)
    }
    if (error instanceof ProviderStreamError && error.providerFailureCode === 'MAX_TOKENS') {
      return failure('PROVIDER_MAX_TOKENS', 'provider_response', true, startedAt, route, diagnostics)
    }
    if (error instanceof ProviderStreamError) return failure('PROVIDER_STREAM_ERROR', 'provider_stream', true, startedAt, route, diagnostics)
    return failure('UNKNOWN_ANALYSIS_ERROR', 'provider_stream', true, startedAt, route, diagnostics)
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle)
    controller.abort()
  }
}

/** Build a fresh allowlisted model payload and assign stable refs to non-empty comments. */
function preparePayload(request: XhsCommentAnalysisRequest): SafePayload {
  const comments = request.comments
    .slice(0, MAX_INPUT_COMMENTS)
    .map(comment => typeof comment.content === 'string' ? comment.content.trim() : '')
    .filter(text => text.length > 0)
    .map((text, index) => ({ ref: `C${String(index + 1).padStart(2, '0')}`, text }))
  return {
    noteTitle: request.noteTitle?.trim() ?? '',
    noteText: request.noteText?.trim() ?? '',
    comments,
  }
}

/** Hash the note identity and normalized current text without retaining either in the cache key. */
function cacheFingerprint(request: XhsCommentAnalysisRequest, payload: SafePayload): string {
  const normalized = [payload.noteTitle, payload.noteText, ...payload.comments.map(comment => `${comment.ref}\0${normalizeText(comment.text)}`)]
  return createHash('sha256').update(JSON.stringify([request.noteId, normalized])).digest('hex')
}

function normalizeText(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ')
}

/** Collect only text deltas; raw output remains local to this stack frame. */
async function collectText(stream: AsyncIterable<StreamChunk>, diagnostics: StreamDiagnostics): Promise<string> {
  let response = ''
  let finished = false
  const textDeltaIndexes = new Set<number>()

  function appendText(text: string): void {
    response += text
    diagnostics.responseCharacterCount = Array.from(response).length
    if (diagnostics.responseCharacterCount > MAX_RESPONSE_CHARS) throw new ResponseLimitError()
  }

  for await (const chunk of stream) {
    diagnostics.streamEventCount += 1
    if (chunk.type === 'text-delta') {
      if (chunk.text.length > 0) textDeltaIndexes.add(chunk.index)
      appendText(chunk.text)
    } else if (chunk.type === 'block-end' && chunk.block.type === 'text' && !textDeltaIndexes.has(chunk.index)) {
      // Some valid streams expose the completed text block without deltas; do not duplicate blocks that had deltas.
      appendText(chunk.block.text)
    } else if (chunk.type === 'finish') {
      finished = true
      if (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted') {
        if (chunk.reason.failure.status !== undefined) diagnostics.httpStatus = chunk.reason.failure.status
        const providerFailureCode = chunk.reason.kind === 'error' && chunk.reason.failure.code === 'EMPTY_RESPONSE'
          ? 'EMPTY_RESPONSE'
          : undefined
        throw new ProviderStreamError(chunk.reason.failure.status, providerFailureCode)
      }
      if (chunk.reason.kind === 'tool-calls') throw new ProviderStreamError()
      if (chunk.reason.kind === 'max-tokens') throw new ProviderStreamError(undefined, 'MAX_TOKENS')
    }
  }
  if (!finished) throw new ProviderStreamError()
  if (response.trim().length === 0) throw new EmptyResponseError()
  return response
}

/** Parse plain JSON or one JSON fenced block without exposing parser input. */
function parseResponse(raw: string): { readonly ok: true; readonly value: unknown } | { readonly ok: false } {
  const trimmed = raw.trim()
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/iu.exec(trimmed)
  try {
    return { ok: true, value: JSON.parse(fenced?.[1] ?? trimmed) as unknown }
  } catch {
    return { ok: false }
  }
}

/** Validate model JSON, evidence refs, per-category caps, and confidence on the Host. */
function validateInsights(value: unknown, comments: readonly SafeComment[]): { readonly insights: readonly XhsCommentInsight[]; readonly trace: XhsCommentAnalysisTrace } {
  if (!isRecord(value) || !Array.isArray(value.insights)) throw new InvalidResponseError()
  const validRefs = new Set(comments.map(comment => comment.ref))
  const perCategory = new Map<XhsCommentInsightCategory, number>()
  const insights: XhsCommentInsight[] = []
  let invalidEvidenceRefCount = 0
  let ungroundedInsightCount = 0
  for (const raw of value.insights) {
    if (!isRecord(raw) || !isCategory(raw.category) || typeof raw.insight !== 'string') continue
    const insight = raw.insight.trim()
    if (insight.length === 0 || Array.from(insight).length > MAX_INSIGHT_LENGTH) continue
    if (!Array.isArray(raw.evidenceRefs)) {
      ungroundedInsightCount += 1
      continue
    }
    const refs: string[] = []
    const seen = new Set<string>()
    for (const ref of raw.evidenceRefs) {
      if (typeof ref !== 'string' || !validRefs.has(ref)) {
        invalidEvidenceRefCount += 1
        continue
      }
      if (!seen.has(ref)) {
        refs.push(ref)
        seen.add(ref)
      }
    }
    if (refs.length === 0) {
      ungroundedInsightCount += 1
      continue
    }
    const categoryCount = perCategory.get(raw.category) ?? 0
    if (categoryCount >= MAX_PER_CATEGORY || insights.length >= MAX_INSIGHTS) continue
    perCategory.set(raw.category, categoryCount + 1)
    insights.push({
      category: raw.category,
      insight,
      evidenceRefs: refs,
      confidence: comments.length === 1 || refs.length === 1 ? 'low' : refs.length === 2 ? 'medium' : 'high',
    })
  }
  const validEvidenceRefCount = new Set(insights.flatMap(insight => insight.evidenceRefs)).size
  return {
    insights,
    trace: { validEvidenceRefCount, invalidEvidenceRefCount, ungroundedInsightCount },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Validate values arriving through the Host Remote before reading comment content. */
function isAnalysisRequest(value: unknown): value is XhsCommentAnalysisRequest {
  if (!isRecord(value) || typeof value.noteId !== 'string') return false
  if (value.noteTitle !== null && typeof value.noteTitle !== 'string') return false
  if (value.noteText !== null && typeof value.noteText !== 'string') return false
  if (!Array.isArray(value.comments)) return false
  return value.comments.every(comment =>
    isRecord(comment)
    && (comment.id === null || typeof comment.id === 'string')
    && (comment.content === null || typeof comment.content === 'string'))
}

function isCategory(value: unknown): value is XhsCommentInsightCategory {
  return typeof value === 'string' && CATEGORIES.includes(value as XhsCommentInsightCategory)
}

class AnalysisTimeoutError extends Error {}
class ProviderStreamError extends Error {
  constructor(readonly httpStatus?: number, readonly providerFailureCode?: 'EMPTY_RESPONSE' | 'MAX_TOKENS') { super() }
}
class InvalidResponseError extends Error {}
class ResponseLimitError extends Error {}
class EmptyResponseError extends Error {}
/** Return content-free failure metadata for one analysis request. */
function failure(
  errorCode: XhsCommentAnalysisErrorCode,
  failureStage: XhsCommentAnalysisFailureStage,
  llmStreamCalled: boolean,
  startedAt: number,
  route: CommentAnalysisRoute | undefined,
  diagnostics: StreamDiagnostics = { streamEventCount: 0, responseCharacterCount: 0 },
  httpStatus?: number,
): Extract<XhsCommentAnalysisResult, { status: 'error' }> {
  const providerResponseReceived = httpStatus !== undefined || diagnostics.httpStatus !== undefined || diagnostics.streamEventCount > 0
  const providerRequestSent: XhsCommentAnalysisRequestStatus = !llmStreamCalled
    ? 'not_started'
    : providerResponseReceived ? 'confirmed' : 'unknown'
  return {
    status: 'error',
    errorCode,
    providerId: route?.provider ?? null,
    modelId: route?.model ?? null,
    llmStreamCalled,
    providerRequestSent,
    providerResponseReceived,
    failureStage,
    durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    streamEventCount: diagnostics.streamEventCount,
    responseCharacterCount: diagnostics.responseCharacterCount,
    ...(httpStatus === undefined ? {} : { httpStatus }),
  }
}

/** Read only a numeric HTTP status from an adapter exception. */
function getHttpStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('status' in error)) return undefined
  const status = error.status
  return typeof status === 'number' && Number.isInteger(status) ? status : undefined
}
