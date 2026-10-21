import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import {
  freezeVideoPackagingAiPlanRequest,
  gradeVideoPackagingModel,
  proveVideoPackagingRetryBounds,
  requestVideoPackagingAiPlan,
  VIDEO_PACKAGING_MODEL_DEFAULTS,
  VIDEO_PACKAGING_SUGGESTION_SYSTEM_PROMPT,
} from '../src/video-packaging-model.ts'
import type { VideoPackagingAiPlanRequest } from '../src/video-packaging-model.ts'
import { BusinessWorkbenchError } from '../src/errors.ts'

/** Minimal ctx double: only the llm and credentials surfaces the module touches. */
function fakeCtx(overrides: {
  readonly providers?: readonly { readonly id: string; readonly name: string }[]
  readonly retryPolicy?: { readonly mode: 'normal' | 'always'; readonly maxRetries?: number }
  readonly credentialConfigured?: boolean
  readonly credentialSource?: string
}): Context {
  const retryPolicy = overrides.retryPolicy ?? { mode: 'normal', maxRetries: 5 }
  return {
    llm: {
      providerRetryPolicy: (_provider: string) => ({ ...retryPolicy }),
    },
    credentials: {
      describe: async (_ref: unknown) => ({
        configured: overrides.credentialConfigured ?? false,
        ...(overrides.credentialSource === undefined ? {} : { source: overrides.credentialSource }),
        writable: true,
      }),
    },
  } as unknown as Context
}

const provider = { id: 'deepseek-official', name: 'DeepSeek' }
const model = { id: 'deepseek-chat', name: 'DeepSeek Chat' }

function validRequest(): VideoPackagingAiPlanRequest {
  return {
    video: { assetId: 'a1', width: 1280, height: 720, duration: 30 },
    transcript: { format: 'srt', text: '1\n00:00:01,000 --> 00:00:03,000\nhello' },
    requirements: 'add a title',
    mode: 'free',
    canvas: { width: 1280, height: 720 },
    approvedMaterialSummaries: ['blue gradient background'],
  }
}

describe('V3-03R restricted model entry', () => {
  it('invocation stays disabled by default and sends zero requests', async () => {
    expect(VIDEO_PACKAGING_MODEL_DEFAULTS.invocationEnabled).toBe(false)
    await expect(requestVideoPackagingAiPlan(fakeCtx({}), validRequest())).rejects.toMatchObject({
      name: 'BusinessWorkbenchError',
      code: 'VIDEO_PACKAGING_AI_DISABLED',
    })
  })

  it('grades an unconfigured provider as not-callable with a named reason', async () => {
    const graded = await gradeVideoPackagingModel(fakeCtx({ credentialConfigured: false }), provider, model)
    expect(graded.grade).toBe('not-callable')
    expect(graded.authentication).toBe('missing')
    expect(graded.invocationReady).toBe(false)
    expect(graded.invocationEnabled).toBe(false)
    expect(graded.unavailableReason).toContain('DEEPSEEK_API_KEY')
  })

  it('grades a configured provider as not-callable while the route stays disabled', async () => {
    const graded = await gradeVideoPackagingModel(
      fakeCtx({ credentialConfigured: true, credentialSource: 'env' }),
      provider,
      model,
    )
    // Credential is configured (level 2 passes) but the dedicated route is
    // disabled by default, so the grade honestly stays not-callable.
    expect(graded.grade).toBe('not-callable')
    expect(graded.authentication).toBe('configured')
    expect(graded.unavailableReason).toContain('disabled by default')
    expect(graded.retryEvidence?.bounded).toBe(true)
    expect(graded.retryEvidence?.maxRetries).toBe(5)
  })

  it('grades a provider without credential mapping as unknown-provider', async () => {
    const graded = await gradeVideoPackagingModel(
      fakeCtx({}),
      { id: 'mystery-provider', name: 'Mystery' },
      model,
    )
    expect(graded.grade).toBe('not-callable')
    expect(graded.authentication).toBe('unknown-provider')
  })

  it('proves an unbounded retry policy keeps the route not ready', () => {
    const evidence = proveVideoPackagingRetryBounds(
      fakeCtx({ retryPolicy: { mode: 'always' } }),
      'deepseek-official',
    )
    expect(evidence.mode).toBe('always')
    expect(evidence.bounded).toBe(false)
    expect(evidence.maxRetries).toBeNull()
    expect(evidence.note).toContain('unbounded')
  })

  it('proves a bounded retry policy with inspected layers named', () => {
    const evidence = proveVideoPackagingRetryBounds(
      fakeCtx({ retryPolicy: { mode: 'normal', maxRetries: 0 } }),
      'deepseek-official',
    )
    expect(evidence.mode).toBe('normal')
    expect(evidence.bounded).toBe(true)
    expect(evidence.maxRetries).toBe(0)
    expect(evidence.layers).toContain('dsh-llm-retry')
  })

  it('rejects oversized suggestion inputs at the boundary', () => {
    const request = validRequest()
    expect(() =>
      freezeVideoPackagingAiPlanRequest({ ...request, transcript: { format: 'srt', text: 'x'.repeat(20_001) } }),
    ).toThrowError(BusinessWorkbenchError)
    expect(() =>
      freezeVideoPackagingAiPlanRequest({
        ...request,
        approvedMaterialSummaries: Array.from({ length: 21 }, (_, i) => `s${i}`),
      }),
    ).toThrowError(BusinessWorkbenchError)
  })

  it('freezes a valid suggestion request', () => {
    const frozen = freezeVideoPackagingAiPlanRequest(validRequest())
    expect(Object.isFrozen(frozen)).toBe(true)
    expect(frozen.requirements).toBe('add a title')
  })

  it('pins the suggestion system prompt: suggestions only, never project writes', () => {
    expect(VIDEO_PACKAGING_SUGGESTION_SYSTEM_PROMPT).toContain('绝不直接修改工程')
  })
})

describe('V3-03R remotes through isolated Harness', () => {
  it('lists models, describes retry bounds, and rejects invocation without sending requests', async () => {
    const { setupHarness } = await import('./helpers.ts')
    const { mkdtemp } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const root = await mkdtemp(join(tmpdir(), 'dsh-vp-model-'))
    const fixture = await setupHarness(root)
    try {
      const service = fixture.ctx.businessWorkbench as {
        listVideoPackagingAiModels(): Promise<readonly unknown[]>
        describeVideoPackagingRetryBounds(provider: string): unknown
        requestVideoPackagingAiPlan(request: unknown): Promise<unknown>
      }
      // Remote wiring: methods are callable on the isolated Host.
      const models = await service.listVideoPackagingAiModels()
      expect(Array.isArray(models)).toBe(true)
      // Retry evidence is inspectable without credentials or requests.
      // 'deepseek-official' is not registered in the fixture Harness, so the
      // honest result is 'unknown' — the policy cannot be inspected.
      const evidence = service.describeVideoPackagingRetryBounds('deepseek-official') as {
        readonly provider: string
        readonly mode: string
        readonly bounded: boolean
      }
      expect(evidence.provider).toBe('deepseek-official')
      expect(evidence.mode).toBe('unknown')
      expect(evidence.bounded).toBe(false)
      // Invocation entry exists but always denies in this stage.
      // (Pass a valid request shape; the denial is about the disabled switch,
      // not input validation.)
      await expect(service.requestVideoPackagingAiPlan({
        video: { assetId: 'a1', width: 1280, height: 720, duration: 30 },
        transcript: { format: 'srt', text: 'hello' },
        requirements: 'title',
        mode: 'free',
        canvas: { width: 1280, height: 720 },
        approvedMaterialSummaries: [],
      })).rejects.toMatchObject({
        code: 'VIDEO_PACKAGING_AI_DISABLED',
      })
    } finally {
      await fixture.dispose()
    }
  })
})
