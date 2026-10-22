/**
 * Restricted model execution entry for Video Packaging AI智能包装 (V3-03R).
 *
 * V3-03 delivered the AI panel UI, model registry discovery, subtitle input,
 * and Fixture-based packaging plans, but left MODEL INVOCATION READY = NO:
 * no dedicated restricted Agent route existed and credential validity was
 * never checked. This module adds that route with four-level readiness
 * grading, credential-status verification that never reads secret values,
 * and retry/cost-bound evidence.
 *
 * Stage rule: model invocation stays disabled by default and no request is
 * sent in this stage (Provider Request = 0, MODEL REAL = NOT RUN).
 */

import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { AIKOU_SELECT_PROMPT } from '@deepseek-ai/dsh-client-ui-conversation/src/client/skeleton/video-packaging/aikou-select-prompt.js'
import { TALKCRAFT_SELECT_PROMPT } from '@deepseek-ai/dsh-client-ui-conversation/src/client/skeleton/video-packaging/talkcraft-select-prompt.js'
import { SHOTCRAFT_SELECT_PROMPT } from '@deepseek-ai/dsh-client-ui-conversation/src/client/skeleton/video-packaging/shotcraft-cards/shotcraft-select.js'
import { HUASHU_STYLE_PROMPT } from '@deepseek-ai/dsh-client-ui-conversation/src/client/skeleton/video-packaging/huashu-style.js'
import { BusinessWorkbenchError } from './errors.ts'
import type {
  RunVideoPackagingPlanRequest,
  VideoPackagingAiModel,
  VideoPackagingAiPlanSuggestion,
  VideoPackagingModelGrade,
  VideoPackagingRetryEvidence,
} from './types.ts'

export type {
  RunVideoPackagingPlanRequest,
  VideoPackagingAiPlanSuggestion,
} from './types.ts'

/**
 * Provider id → credential reference used for status checks.
 * The value behind the reference is never read; only describe() is called.
 * Providers without a mapping grade as 'unknown-provider' and stay not-callable.
 */
const PROVIDER_CREDENTIAL_REFS: Readonly<Record<string, string>> = Object.freeze({
  'deepseek-official': 'DEEPSEEK_API_KEY',
})

/** Maximum input sizes for one suggestion request (bounds the complete emitted value). */
const MAX_TRANSCRIPT_CHARS = 20_000
const MAX_REQUIREMENTS_CHARS = 2_000
const MAX_MATERIAL_SUMMARIES = 20
const MAX_MATERIAL_SUMMARY_CHARS = 500
/** V3-03R invocation switch. False until explicit user authorization exists. */
const INVOCATION_ENABLED = false
/** Default per-request output cap for suggestion calls. */
const SUGGESTION_MAX_TOKENS = 4_096
/** Wall time for one suggestion turn. */
const SUGGESTION_TIMEOUT_MS = 120_000

/** Frozen, user-authorized input for one packaging-plan suggestion request. Alias of the wire type. */
export type VideoPackagingAiPlanRequest = RunVideoPackagingPlanRequest

/**
 * Inspect the retry bound for one provider route across the layers this Host
 * actually controls. Layers: dsh-llm-retry plugin policy (resolved per
 * provider), the DeepSeek direct-fetch adapter (no built-in retry), and the
 * restricted Agent runtime (exactly one turn, no retry).
 * @param ctx - Host context carrying the LLM runtime.
 * @param provider - registered provider route id.
 * @returns retry evidence; bounded is true only when every layer proves finite.
 */
export function proveVideoPackagingRetryBounds(
  ctx: Context,
  provider: string,
): VideoPackagingRetryEvidence {
  const layers: string[] = []
  try {
    const policy = ctx.llm.providerRetryPolicy(provider)
    layers.push('dsh-llm-retry')
    if (policy.mode === 'always') {
      return Object.freeze({
        provider,
        mode: 'always' as const,
        maxRetries: null,
        bounded: false,
        layers: Object.freeze(layers),
        note: 'provider retry policy is unbounded (\'always\' mode); a single user action could trigger unlimited billed requests',
      })
    }
    const maxRetries = policy.maxRetries
    const bounded = Number.isSafeInteger(maxRetries) && (maxRetries as number) >= 0
    layers.push('direct-fetch-adapter(no-retry)', 'restricted-agent(single-turn)')
    return Object.freeze({
      provider,
      mode: 'normal' as const,
      maxRetries: bounded ? (maxRetries as number) : null,
      bounded,
      layers: Object.freeze(layers),
      note: bounded
        ? `provider retry policy is bounded at ${maxRetries as number} retries; adapter performs no retry; restricted Agent runs exactly one turn`
        : 'provider retry policy maxRetries is not a safe integer; bound unprovable',
    })
  } catch (error) {
    return Object.freeze({
      provider,
      mode: 'unknown' as const,
      maxRetries: null,
      bounded: false,
      layers: Object.freeze(layers),
      note: `retry policy could not be inspected: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}

/**
 * Grade one registry model through the four V3-03R readiness levels.
 * Credential status is verified with CredentialProvider.describe() only;
 * the secret value is never resolved or read.
 * @param ctx - Host context carrying the LLM runtime and credentials.
 * @param provider - provider id and display name.
 * @param model - model id and display name.
 * @returns frozen readiness facts with the failing level named when not callable.
 */
export async function gradeVideoPackagingModel(
  ctx: Context,
  provider: { readonly id: string; readonly name: string },
  model: { readonly id: string; readonly name: string },
): Promise<VideoPackagingAiModel> {
  const base = {
    provider: provider.id,
    providerName: provider.name,
    model: model.id,
    modelName: model.name,
    invocationEnabled: INVOCATION_ENABLED,
  } as const
  const notCallable = (
    grade: VideoPackagingModelGrade,
    authentication: VideoPackagingAiModel['authentication'],
    reason: string,
    retryEvidence?: VideoPackagingRetryEvidence,
  ): VideoPackagingAiModel => Object.freeze({
    ...base,
    grade,
    dedicatedRouteConfigured: false,
    authentication,
    invocationReady: false,
    unavailableReason: reason,
    ...(retryEvidence === undefined ? {} : { retryEvidence }),
  })

  // Level 2: configured — credential presence via describe(), never resolve().
  const credentialName = PROVIDER_CREDENTIAL_REFS[provider.id]
  if (credentialName === undefined) {
    return notCallable(
      'not-callable',
      'unknown-provider',
      `provider '${provider.id}' has no credential mapping; cannot verify configuration without guessing secret names`,
    )
  }
  let configured = false
  let credentialSource: string | undefined
  try {
    const info = await ctx.credentials.describe(credentialRef(credentialName))
    configured = info.configured
    credentialSource = info.source
  } catch (error) {
    return notCallable(
      'not-callable',
      'unknown-provider',
      `credential status check failed for '${credentialName}': ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  if (!configured) {
    return notCallable(
      'not-callable',
      'missing',
      `credential '${credentialName}' is not configured${credentialSource === undefined ? '' : ' (no value at expected source)'}; configure it in Host settings before the route can be called`,
    )
  }

  // Level 3: routable — dedicated restricted route exists, enabled, retry-bounded.
  // V3-03R stage: the route object exists but stays disabled, so no model
  // reaches 'routable' yet. This is the honest product state, not a bug.
  const retryEvidence = proveVideoPackagingRetryBounds(ctx, provider.id)
  if (!INVOCATION_ENABLED) {
    return notCallable(
      'not-callable',
      'configured',
      'dedicated Video Packaging restricted route is defined but invocation is disabled by default; enabling requires explicit user authorization (not granted this stage)',
      retryEvidence,
    )
  }
  if (!retryEvidence.bounded) {
    return notCallable('not-callable', 'configured', `retry bound unprovable: ${retryEvidence.note}`, retryEvidence)
  }
  return Object.freeze({
    ...base,
    grade: 'routable' as const,
    dedicatedRouteConfigured: true,
    authentication: 'configured' as const,
    invocationReady: true,
    unavailableReason: '',
    retryEvidence,
  })
}

/**
 * Validate and freeze one suggestion request. Rejects oversized inputs at the
 * boundary where the complete value is known.
 * @param request - raw caller input.
 * @returns frozen, bounded request.
 */
export function freezeVideoPackagingAiPlanRequest(
  request: VideoPackagingAiPlanRequest,
): VideoPackagingAiPlanRequest {
  if (request.transcript.text.length > MAX_TRANSCRIPT_CHARS) {
    throw new BusinessWorkbenchError(
      'VIDEO_PACKAGING_AI_INPUT_TOO_LARGE',
      `transcript exceeds ${MAX_TRANSCRIPT_CHARS} chars`,
    )
  }
  if (request.requirements.length > MAX_REQUIREMENTS_CHARS) {
    throw new BusinessWorkbenchError(
      'VIDEO_PACKAGING_AI_INPUT_TOO_LARGE',
      `requirements exceed ${MAX_REQUIREMENTS_CHARS} chars`,
    )
  }
  if (request.approvedMaterialSummaries.length > MAX_MATERIAL_SUMMARIES) {
    throw new BusinessWorkbenchError(
      'VIDEO_PACKAGING_AI_INPUT_TOO_LARGE',
      `more than ${MAX_MATERIAL_SUMMARIES} material summaries`,
    )
  }
  for (const summary of request.approvedMaterialSummaries) {
    if (summary.length > MAX_MATERIAL_SUMMARY_CHARS) {
      throw new BusinessWorkbenchError(
        'VIDEO_PACKAGING_AI_INPUT_TOO_LARGE',
        'one material summary exceeds the per-summary cap',
      )
    }
  }
  return Object.freeze({
    video: Object.freeze({ ...request.video }),
    transcript: Object.freeze({ ...request.transcript }),
    requirements: request.requirements,
    mode: request.mode,
    canvas: Object.freeze({ ...request.canvas }),
    approvedMaterialSummaries: Object.freeze([...request.approvedMaterialSummaries]),
  })
}

/**
 * System prompt for the dedicated Video Packaging suggestion route.
 * The model outputs suggestions only; it never writes to the project,
 * triggers rendering, or approves materials. Pinned verbatim: the Host,
 * not the model, decides what enters the timeline.
 * Card-selection guides for the three open libraries (aikou / talkcraft /
 * shotcraft) are appended after the base instruction, one section each,
 * followed by the huashu-motion style guide ("借设计不借引擎": style /
 * animation vocabulary only, no engine).
 */
export const VIDEO_PACKAGING_SUGGESTION_SYSTEM_PROMPT =
  '你是视频包装建议助手。你只输出包装方案建议（JSON），绝不直接修改工程、触发渲染或批准素材。' +
  '每条建议必须引用字幕时间码作为证据；无字幕依据的建议必须省略。只推荐用户已批准的素材摘要中出现的素材。' +
  '\n\n' +
  AIKOU_SELECT_PROMPT +
  '\n\n' +
  TALKCRAFT_SELECT_PROMPT +
  '\n\n' +
  SHOTCRAFT_SELECT_PROMPT +
  '\n\n' +
  HUASHU_STYLE_PROMPT

/**
 * Dedicated restricted invocation entry for Video Packaging AI suggestions.
 * V3-03R stage: always rejects — invocation is disabled by default and this
 * stage sends zero provider requests. The entry exists so the route, its
 * input bounds, and its denial are all testable without a credential.
 * @param _ctx - Host context (unused while disabled; kept for the future route).
 * @param _request - frozen suggestion request.
 */
export async function requestVideoPackagingAiPlan(
  _ctx: Context,
  _request: VideoPackagingAiPlanRequest,
): Promise<VideoPackagingAiPlanSuggestion> {
  throw new BusinessWorkbenchError(
    'VIDEO_PACKAGING_AI_DISABLED',
    'Video Packaging model invocation is disabled by default; enabling requires explicit user authorization (not granted this stage). Provider Request = 0.',
  )
}

/** Suggestion-call defaults, exported for tests and future authorization UI. */
export const VIDEO_PACKAGING_MODEL_DEFAULTS = Object.freeze({
  invocationEnabled: INVOCATION_ENABLED,
  maxTokens: SUGGESTION_MAX_TOKENS,
  timeoutMs: SUGGESTION_TIMEOUT_MS,
})
