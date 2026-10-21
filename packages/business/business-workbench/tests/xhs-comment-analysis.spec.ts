import { describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { analyzeXhsComments, XhsCommentAnalysisCache } from '../src/xhs-comment-analysis.ts'
import type { XhsCommentAnalysisRequest } from '../src/types.ts'

const route = { provider: 'deepseek-official', model: 'deepseek-v4-flash' }
const request: XhsCommentAnalysisRequest = {
  noteId: 'private-feed-id',
  noteTitle: '怎样安排小户型收纳？',
  noteText: '正文内容',
  comments: [
    { id: 'private-comment-id', content: '厨房台面总是不够用，有什么收纳办法？' },
    { id: 'private-comment-id-2', content: '租房不能打孔，希望方案可以拆走。' },
  ],
}

function streamFrom(text: string, inspect?: (options: GenerateOptions) => void) {
  const stream = vi.fn(async function* (options: GenerateOptions): AsyncIterable<StreamChunk> {
    inspect?.(options)
    yield { type: 'text-delta', index: 0, text }
    yield { type: 'finish', reason: { kind: 'stop' } }
  })
  return {
    stream,
    llm: {
      stream,
      listProviders: () => [{ id: 'deepseek-official', name: 'DeepSeek' }],
      resolveModelInfo: async (provider: string, model: string) => ({ provider, id: model, name: model }),
    },
  }
}

describe('XHS stateless comment analysis', () => {
  it('sends only reconstructed content through tool-free ctx.llm.stream and caches sanitized output', async () => {
    const modelText = JSON.stringify({ insights: [
      { category: 'question', insight: '评论者在询问厨房台面的收纳办法。', evidenceRefs: ['C01', 'C02', 'C01', 'C99'] },
      { category: 'desired_outcome', insight: '租房者希望收纳方案可拆卸且无需打孔。', evidenceRefs: ['C02'] },
    ] })
    const { llm, stream } = streamFrom(modelText, options => {
      expect(options.provider).toBe('deepseek-official')
      expect(options.model).toBe('deepseek-v4-flash')
      expect(options.reasoningEffort).toBe('off')
      expect(options.maxTokens).toBe(4_096)
      expect(options.system).toContain('最多每类 3 条、总计 15 条；insight 不超过 120 字')
      expect(options.system).toContain('desired_outcome=真实目标')
      expect(options.sessionId).toBeUndefined()
      expect(options.tools).toBeUndefined()
      const userText = options.messages[0]?.content[0]
      expect(userText?.type).toBe('text')
      if (userText?.type !== 'text') throw new Error('missing user text')
      const payload = JSON.parse(userText.text) as Record<string, unknown>
      expect(payload).toEqual({
        noteTitle: request.noteTitle,
        noteText: request.noteText,
        comments: [
          { ref: 'C01', text: request.comments[0]?.content },
          { ref: 'C02', text: request.comments[1]?.content },
        ],
      })
      expect(userText.text).not.toContain('private-feed-id')
      expect(userText.text).not.toContain('private-comment-id')
      expect(userText.text).not.toMatch(/nickname|userId|avatar|xsecToken|cookie|authorization|cover/iu)
    })
    const cache = new XhsCommentAnalysisCache()
    const result = await analyzeXhsComments(llm as never, route, request, cache)
    expect(result).toEqual({
      status: 'ready', cacheHit: false,
      insights: [
        { category: 'question', insight: '评论者在询问厨房台面的收纳办法。', evidenceRefs: ['C01', 'C02'], confidence: 'medium' },
        { category: 'desired_outcome', insight: '租房者希望收纳方案可拆卸且无需打孔。', evidenceRefs: ['C02'], confidence: 'low' },
      ],
      trace: { validEvidenceRefCount: 2, invalidEvidenceRefCount: 1, ungroundedInsightCount: 0 },
    })
    expect(stream).toHaveBeenCalledOnce()
    const entries = Reflect.get(cache, 'entries') as Map<string, unknown>
    expect(JSON.stringify([...entries.values()])).not.toContain('厨房台面总是不够用')
    expect(JSON.stringify([...entries.values()])).not.toContain('private-feed-id')
    expect(JSON.stringify([...entries.values()])).not.toContain(modelText)
    await expect(analyzeXhsComments(llm as never, route, request, cache)).resolves.toMatchObject({ status: 'ready', cacheHit: true })
    expect(stream).toHaveBeenCalledOnce()
  })

  it('accepts fenced JSON, drops ungrounded output, and applies schema caps', async () => {
    const insights = Array.from({ length: 5 }, (_, index) => ({
      category: 'question', insight: `结论 ${index + 1}`, evidenceRefs: ['C01'], confidence: 'not-model-owned',
    }))
    insights.push({ category: 'unknown', insight: '非法分类', evidenceRefs: ['C01'], confidence: 'none' })
    insights.push({ category: 'blocker', insight: '没有当前评论证据', evidenceRefs: ['C99'], confidence: 'none' })
    const { llm } = streamFrom(`\`\`\`json\n${JSON.stringify({ insights })}\n\`\`\``)
    const result = await analyzeXhsComments(llm as never, route, request, new XhsCommentAnalysisCache())
    expect(result).toMatchObject({
      status: 'ready',
      insights: [
        { category: 'question', evidenceRefs: ['C01'], confidence: 'low' },
        { category: 'question', evidenceRefs: ['C01'], confidence: 'low' },
        { category: 'question', evidenceRefs: ['C01'], confidence: 'low' },
      ],
      trace: { validEvidenceRefCount: 1, invalidEvidenceRefCount: 1, ungroundedInsightCount: 1 },
    })
  })

  it('keeps model insight text within the same bounded length as the prompt', async () => {
    const longInsight = '洞'.repeat(121)
    const { llm } = streamFrom(JSON.stringify({ insights: [
      { category: 'question', insight: longInsight, evidenceRefs: ['C01'] },
      { category: 'blocker', insight: '评论者希望方案无需打孔。', evidenceRefs: ['C02'] },
    ] }))
    const result = await analyzeXhsComments(llm as never, route, request, new XhsCommentAnalysisCache())

    expect(result).toMatchObject({ status: 'ready', insights: [{ category: 'blocker', insight: '评论者希望方案无需打孔。' }] })
    expect(result.status === 'ready' && result.insights.some(insight => insight.insight.length > 120)).toBe(false)
  })

  it('collects completed text blocks when deltas are absent without treating reasoning or usage as response text', async () => {
    const modelText = JSON.stringify({ insights: [{ category: 'question', insight: '测试洞察', evidenceRefs: ['C01'] }] })
    const llm = {
      stream: vi.fn(async function* (): AsyncIterable<StreamChunk> {
        for (let index = 0; index < 2_504; index += 1) {
          yield { type: 'reasoning-delta', index: 0, text: 'private reasoning' }
        }
        yield { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'private reasoning'.repeat(2_504) } }
        yield { type: 'block-end', index: 1, block: { type: 'text', text: modelText } }
        yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } }
        yield { type: 'finish', reason: { kind: 'stop' } }
      }),
      listProviders: () => [{ id: 'deepseek-official', name: 'DeepSeek' }],
      resolveModelInfo: async (provider: string, model: string) => ({ provider, id: model, name: model }),
    }

    await expect(analyzeXhsComments(llm as never, route, request, new XhsCommentAnalysisCache()))
      .resolves.toMatchObject({ status: 'ready', insights: [{ insight: '测试洞察', evidenceRefs: ['C01'] }] })
  })

  it('prefers text deltas over their completed block and ignores non-text blocks', async () => {
    const modelText = JSON.stringify({ insights: [{ category: 'question', insight: '分段输出', evidenceRefs: ['C01'] }] })
    const splitAt = Math.floor(modelText.length / 2)
    const llm = {
      stream: vi.fn(async function* (): AsyncIterable<StreamChunk> {
        yield { type: 'block-start', index: 0, blockType: 'text' }
        yield { type: 'text-delta', index: 0, text: modelText.slice(0, splitAt) }
        yield { type: 'reasoning-delta', index: 1, text: 'not response JSON' }
        yield { type: 'text-delta', index: 0, text: modelText.slice(splitAt) }
        yield { type: 'block-end', index: 0, block: { type: 'text', text: modelText } }
        yield { type: 'block-end', index: 1, block: { type: 'reasoning', text: 'not response JSON' } }
        yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } }
        yield { type: 'finish', reason: { kind: 'stop' } }
      }),
      listProviders: () => [{ id: 'deepseek-official', name: 'DeepSeek' }],
      resolveModelInfo: async (provider: string, model: string) => ({ provider, id: model, name: model }),
    }

    await expect(analyzeXhsComments(llm as never, route, request, new XhsCommentAnalysisCache()))
      .resolves.toMatchObject({ status: 'ready', insights: [{ insight: '分段输出', evidenceRefs: ['C01'] }] })
  })

  it('reports empty final text and mid-stream provider errors without parsing partial text', async () => {
    const noText = {
      ...streamFrom(''),
      stream: vi.fn(async function* (): AsyncIterable<StreamChunk> {
        yield { type: 'block-start', index: 0, blockType: 'reasoning' }
        yield { type: 'reasoning-delta', index: 0, text: 'not an answer' }
        yield { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'not an answer' } }
        yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } }
        yield { type: 'finish', reason: { kind: 'stop' } }
      }),
    }
    await expect(analyzeXhsComments(noText.llm as never, route, request, new XhsCommentAnalysisCache()))
      .resolves.toMatchObject({ status: 'error', errorCode: 'EMPTY_RESPONSE', failureStage: 'provider_response', responseCharacterCount: 0 })

    const interrupted = {
      ...noText.llm,
      stream: vi.fn(async function* (): AsyncIterable<StreamChunk> {
        yield { type: 'text-delta', index: 0, text: '{partial' }
        yield { type: 'finish', reason: { kind: 'error', failure: { code: 'TRANSPORT', message: 'private provider message' } } }
      }),
    }
    await expect(analyzeXhsComments(interrupted as never, route, request, new XhsCommentAnalysisCache()))
      .resolves.toMatchObject({ status: 'error', errorCode: 'PROVIDER_STREAM_ERROR', failureStage: 'provider_stream' })

    const malformedBlockOnly = {
      ...noText.llm,
      stream: vi.fn(async function* (): AsyncIterable<StreamChunk> {
        yield { type: 'block-end', index: 0, block: { type: 'text', text: 'not JSON' } }
        yield { type: 'finish', reason: { kind: 'stop' } }
      }),
    }
    await expect(analyzeXhsComments(malformedBlockOnly as never, route, request, new XhsCommentAnalysisCache()))
      .resolves.toMatchObject({ status: 'error', errorCode: 'ANALYSIS_PARSE_ERROR', failureStage: 'response_parse', responseCharacterCount: 8 })
  })

  it('keeps provider-reported empty and max-token finishes distinct from local empty text and JSON parse failures', async () => {
    const providerEmpty = {
      stream: vi.fn(async function* (): AsyncIterable<StreamChunk> {
        yield { type: 'finish', reason: { kind: 'error', failure: { code: 'EMPTY_RESPONSE', message: 'provider returned no content' } } }
      }),
      listProviders: () => [{ id: 'deepseek-official', name: 'DeepSeek' }],
      resolveModelInfo: async (provider: string, model: string) => ({ provider, id: model, name: model }),
    }
    await expect(analyzeXhsComments(providerEmpty as never, route, request, new XhsCommentAnalysisCache()))
      .resolves.toMatchObject({
        status: 'error', errorCode: 'PROVIDER_EMPTY_RESPONSE', failureStage: 'provider_response',
        streamEventCount: 1, responseCharacterCount: 0, providerResponseReceived: true,
      })

    const maxTokens = {
      stream: vi.fn(async function* (): AsyncIterable<StreamChunk> {
        yield { type: 'finish', reason: { kind: 'max-tokens' } }
      }),
      listProviders: () => [{ id: 'deepseek-official', name: 'DeepSeek' }],
      resolveModelInfo: async (provider: string, model: string) => ({ provider, id: model, name: model }),
    }
    await expect(analyzeXhsComments(maxTokens as never, route, request, new XhsCommentAnalysisCache()))
      .resolves.toMatchObject({
        status: 'error', errorCode: 'PROVIDER_MAX_TOKENS', failureStage: 'provider_response',
        streamEventCount: 1, responseCharacterCount: 0,
      })

    const localEmpty = streamFrom('')
    await expect(analyzeXhsComments(localEmpty.llm as never, route, request, new XhsCommentAnalysisCache()))
      .resolves.toMatchObject({ errorCode: 'EMPTY_RESPONSE', failureStage: 'provider_response', responseCharacterCount: 0 })

    const malformed = streamFrom('not JSON')
    await expect(analyzeXhsComments(malformed.llm as never, route, request, new XhsCommentAnalysisCache()))
      .resolves.toMatchObject({ errorCode: 'ANALYSIS_PARSE_ERROR', failureStage: 'response_parse', responseCharacterCount: 8 })
  })

  it('does not call the model when there are no non-empty comments', async () => {
    const { llm, stream } = streamFrom('{}')
    await expect(analyzeXhsComments(llm as never, route, { ...request, comments: [{ id: 'x', content: '  ' }] }, new XhsCommentAnalysisCache()))
      .resolves.toEqual({ status: 'no_comments' })
    expect(stream).not.toHaveBeenCalled()
  })

  it('rejects malformed Remote input without invoking the model', async () => {
    const { llm, stream } = streamFrom('{}')
    await expect(analyzeXhsComments(llm as never, route, { ...request, comments: [null] } as never, new XhsCommentAnalysisCache()))
      .resolves.toMatchObject({ status: 'error', errorCode: 'UNKNOWN_ANALYSIS_ERROR', llmStreamCalled: false, providerRequestSent: 'not_started', failureStage: 'input_validation' })
    expect(stream).not.toHaveBeenCalled()
  })

  it('sends at most ten non-empty comments and misses the cache when comment content changes', async () => {
    let run = 0
    const llm = { stream: vi.fn(async function* (options: GenerateOptions): AsyncIterable<StreamChunk> {
      run += 1
      const block = options.messages[0]?.content[0]
      if (block?.type !== 'text') throw new Error('missing text')
      const payload = JSON.parse(block.text) as { readonly comments: readonly { readonly ref: string; readonly text: string }[] }
      expect(payload.comments).toHaveLength(10)
      expect(payload.comments[9]?.ref).toBe('C10')
      yield { type: 'text-delta', index: 0, text: JSON.stringify({ insights: [{ category: 'question', insight: `结果 ${run}`, evidenceRefs: ['C10'] }] }) }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }),
    listProviders: () => [{ id: 'deepseek-official', name: 'DeepSeek' }],
    resolveModelInfo: async (provider: string, model: string) => ({ provider, id: model, name: model }),
    }
    const cache = new XhsCommentAnalysisCache()
    const manyComments = { ...request, comments: Array.from({ length: 12 }, (_, index) => ({ id: `id-${index}`, content: `text-${index}` })) }
    await analyzeXhsComments(llm as never, route, manyComments, cache)
    const changed = { ...manyComments, comments: manyComments.comments.map((comment, index) => index === 9 ? { ...comment, content: 'changed evidence' } : comment) }
    const result = await analyzeXhsComments(llm as never, route, changed, cache)
    expect(result).toMatchObject({ status: 'ready', cacheHit: false })
    expect(llm.stream).toHaveBeenCalledTimes(2)
  })

  it('returns content-free parse and provider errors', async () => {
    const raw = 'private comment must never escape the Host'
    const consoleError = vi.spyOn(console, 'error')
    const malformed = streamFrom(raw)
    await expect(analyzeXhsComments(malformed.llm as never, route, request, new XhsCommentAnalysisCache()))
      .resolves.toMatchObject({ status: 'error', errorCode: 'ANALYSIS_PARSE_ERROR', llmStreamCalled: true, providerRequestSent: 'confirmed', providerResponseReceived: true, failureStage: 'response_parse', providerId: route.provider, modelId: route.model })
    const failed = { stream: vi.fn(async function* (): AsyncIterable<StreamChunk> {
      yield { type: 'finish', reason: { kind: 'error', failure: { code: 'UNKNOWN', message: raw, status: 503 } } }
    }), listProviders: () => [{ id: 'deepseek-official', name: 'DeepSeek' }], resolveModelInfo: async (provider: string, model: string) => ({ provider, id: model, name: model }) }
    await expect(analyzeXhsComments(failed as never, route, request, new XhsCommentAnalysisCache()))
      .resolves.toMatchObject({ status: 'error', errorCode: 'PROVIDER_HTTP_ERROR', httpStatus: 503, llmStreamCalled: true, providerRequestSent: 'confirmed', providerResponseReceived: true, failureStage: 'provider_stream' })
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('classifies empty output, credential failures, and schema rejection without returning provider text', async () => {
    const empty = { ...streamFrom(''), }
    await expect(analyzeXhsComments(empty.llm as never, route, request, new XhsCommentAnalysisCache()))
      .resolves.toMatchObject({ status: 'error', errorCode: 'EMPTY_RESPONSE', llmStreamCalled: true, providerRequestSent: 'confirmed', providerResponseReceived: true, failureStage: 'provider_response' })

    const credentialFailure = {
      ...empty.llm,
      stream: vi.fn(async function* (): AsyncIterable<StreamChunk> {
        yield { type: 'finish', reason: { kind: 'error', failure: { code: 'AUTH', message: 'private provider detail', status: 401 } } }
      }),
    }
    await expect(analyzeXhsComments(credentialFailure as never, route, request, new XhsCommentAnalysisCache()))
      .resolves.toMatchObject({ status: 'error', errorCode: 'CREDENTIAL_ERROR', httpStatus: 401 })

    const noUsableInsights = streamFrom('{"insights":[]}')
    await expect(analyzeXhsComments(noUsableInsights.llm as never, route, request, new XhsCommentAnalysisCache()))
      .resolves.toMatchObject({ status: 'error', errorCode: 'SCHEMA_NO_VALID_INSIGHTS', responseCharacterCount: 15, failureStage: 'schema_validation' })
    const unsupportedEvidence = streamFrom(JSON.stringify({ insights: [{ category: 'question', insight: 'test', evidenceRefs: ['C99'] }] }))
    await expect(analyzeXhsComments(unsupportedEvidence.llm as never, route, request, new XhsCommentAnalysisCache()))
      .resolves.toMatchObject({ status: 'error', errorCode: 'SCHEMA_NO_VALID_INSIGHTS', failureStage: 'evidence_validation' })
  })

  it('has no file/session persistence dependency in the stateless analysis module', async () => {
    const source = await readFile(new URL('../src/xhs-comment-analysis.ts', import.meta.url), 'utf8')
    expect(source).not.toMatch(/from ['"]node:fs(?:\/promises)?['"]|SessionPersistence|restrictedAgent|createSession|createAgent|sessionId|logger\./iu)
  })

  it('uses an independent route and never falls back to the global selection', async () => {
    const { llm, stream } = streamFrom('{"insights":[]}')
    await expect(analyzeXhsComments(llm as never, undefined, request, new XhsCommentAnalysisCache()))
      .resolves.toMatchObject({ status: 'error', errorCode: 'COMMENT_ANALYSIS_ROUTE_NOT_CONFIGURED', providerId: null, modelId: null, failureStage: 'route', llmStreamCalled: false })
    await expect(analyzeXhsComments(llm as never, { provider: 'deepseek-modlens', model: 'deepseek-v4-pro' }, request, new XhsCommentAnalysisCache()))
      .resolves.toMatchObject({ status: 'error', errorCode: 'COMMENT_ANALYSIS_ROUTE_INVALID' })
    expect(stream).not.toHaveBeenCalled()

    const unavailable = { ...llm, listProviders: () => [{ id: 'deepseek-modlens', name: 'ModLens' }] }
    await expect(analyzeXhsComments(unavailable as never, route, request, new XhsCommentAnalysisCache()))
      .resolves.toMatchObject({ status: 'error', errorCode: 'COMMENT_ANALYSIS_ROUTE_UNAVAILABLE' })
    expect(stream).not.toHaveBeenCalled()

    const routeResolutionFails = { ...llm, resolveModelInfo: async () => { throw new Error('not available') } }
    await expect(analyzeXhsComments(routeResolutionFails as never, route, request, new XhsCommentAnalysisCache()))
      .resolves.toMatchObject({ status: 'error', errorCode: 'COMMENT_ANALYSIS_ROUTE_UNAVAILABLE' })
    expect(stream).not.toHaveBeenCalled()

    const cache = new XhsCommentAnalysisCache()
    const value = { status: 'ready' as const, insights: [], trace: { validEvidenceRefCount: 0, invalidEvidenceRefCount: 0, ungroundedInsightCount: 0 }, cacheHit: false }
    for (let index = 0; index < 51; index += 1) cache.set(`k${index}`, value)
    expect(cache.get('k0')).toBeUndefined()
    expect(cache.get('k50')).toEqual(value)
  })

  it('converts timeout to a content-free result and aborts the in-flight stream', async () => {
    vi.useFakeTimers()
    try {
      let signal: AbortSignal | undefined
      const llm = { stream: vi.fn((options: GenerateOptions) => {
        signal = options.signal
        return (async function* (): AsyncIterable<StreamChunk> {
          await new Promise<void>(resolve => signal?.addEventListener('abort', () => resolve(), { once: true }))
          throw new Error('private comment')
        })()
      }),
      listProviders: () => [{ id: 'deepseek-official', name: 'DeepSeek' }],
      resolveModelInfo: async (provider: string, model: string) => ({ provider, id: model, name: model }),
      }
      const resultPromise = analyzeXhsComments(llm as never, route, request, new XhsCommentAnalysisCache())
      await vi.advanceTimersByTimeAsync(20_000)
      await expect(resultPromise).resolves.toMatchObject({ status: 'error', errorCode: 'ANALYSIS_TIMEOUT', llmStreamCalled: true, providerRequestSent: 'unknown', providerResponseReceived: false, failureStage: 'provider_stream' })
      expect(signal?.aborted).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})
