/** Session-backed AIHOT analysis over one immutable evidence snapshot. */

import { randomUUID } from 'node:crypto'
import type { RestrictedAgentModelConfig } from './host-policy.ts'
import type { HarnessRestrictedAgentRuntime } from './restricted-agent.ts'
import {
  createAihotAnalysisPrompt,
  validateAihotAnalysisResponse,
} from './aihot-evidence-analysis.ts'
import type { AihotEvidencePack, AihotStructuredAnalysis } from './aihot-evidence-analysis.ts'

/** The only analysis task currently supported by this runner. */
export type AihotAnalysisTaskType = 'evidence-review-v1'

/** Validated outcome returned after one real Harness Agent turn. */
export interface AihotAnalysisRunResult {
  readonly taskId: string
  readonly sessionId: string | null
  readonly taskType: AihotAnalysisTaskType
  readonly status: 'completed' | 'failed' | 'cancelled'
  readonly modelId: string
  readonly analysis: AihotStructuredAnalysis | null
  readonly validation: { readonly status: 'passed' } | { readonly status: 'failed'; readonly code: string } | { readonly status: 'not_run' }
  readonly failureCode?: string
}

/** Run bounded AIHOT evidence analysis through the existing restricted Agent Session path. */
export class AihotAnalysisRunner {
  /** @param runtime - existing Host Agent runtime that creates a tool-free durable Session. */
  constructor(
    private readonly runtime: Pick<HarnessRestrictedAgentRuntime, 'run'>,
    private readonly model: RestrictedAgentModelConfig,
  ) {}

  /**
   * Create a separate Session, record the exact prompt and evidence snapshot, then validate the logged model response.
   * @param pack - immutable, bounded A3-03 evidence pack.
   * @param signal - optional caller cancellation forwarded to `Agent.cancel`.
   * @returns completion, validation, cancellation, or a safe failure code; failed/uncreated Sessions have no returned id.
   */
  async run(pack: AihotEvidencePack, signal?: AbortSignal): Promise<AihotAnalysisRunResult> {
    const taskId = randomUUID()
    const sessionId = randomUUID()
    const taskType: AihotAnalysisTaskType = 'evidence-review-v1'
    const modelId = `${this.model.provider}/${this.model.model}`
    const evidencePackSnapshot = JSON.parse(JSON.stringify(pack)) as AihotEvidencePack
    const prompt = createAihotAnalysisPrompt(evidencePackSnapshot)
    const systemPrompt = `${prompt.system}\nTask type: ${taskType}. Task ID: ${taskId}. Result schema: A3-03 schemaVersion 1.`
    const userPrompt = JSON.stringify({ taskId, taskType, evidencePack: evidencePackSnapshot })
    if (new TextEncoder().encode(systemPrompt).byteLength + new TextEncoder().encode(userPrompt).byteLength > 40_000) {
      return Object.freeze({ taskId, sessionId: null, taskType, status: 'failed', modelId, analysis: null,
        validation: { status: 'not_run' as const }, failureCode: 'INPUT_TOO_LARGE' })
    }
    try {
      const execution = await this.runtime.run({
        agentRunId: taskId,
        sessionId,
        systemPrompt,
        userPrompt,
        model: this.model,
        requireDurableSession: true,
        ...(signal === undefined ? {} : { signal }),
      })
      const validated = validateAihotAnalysisResponse(
        execution.output,
        evidencePackSnapshot,
        modelId,
        new Date(execution.metrics.responseCompletedAt).toISOString(),
      )
      if (!validated.ok) {
        return Object.freeze({ taskId, sessionId, taskType, status: 'failed', modelId, analysis: null,
          validation: { status: 'failed' as const, code: validated.code }, failureCode: validated.code })
      }
      return Object.freeze({ taskId, sessionId, taskType, status: 'completed', modelId, analysis: validated.value,
        validation: { status: 'passed' as const } })
    } catch (error) {
      const code = safeFailureCode(error)
      const createdSessionId = error !== null && typeof error === 'object' && 'detail' in error
        && typeof error.detail === 'object' && error.detail !== null && 'sessionId' in error.detail
        && typeof error.detail.sessionId === 'string' ? error.detail.sessionId : null
      return Object.freeze({ taskId, sessionId: createdSessionId, taskType, status: code === 'MODEL_CANCELLED' ? 'cancelled' : 'failed',
        modelId, analysis: null, validation: { status: 'not_run' as const }, failureCode: code })
    }
  }
}

/** Return only a fixed, non-sensitive error category from the restricted runtime. */
function safeFailureCode(error: unknown): string {
  if (error !== null && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    const allowed = new Set(['MODEL_CANCELLED', 'MODEL_TIMEOUT', 'PROVIDER_ERROR', 'AGENT_RUNTIME_UNAVAILABLE', 'SESSION_PERSISTENCE_UNAVAILABLE', 'EMPTY_AGENT_OUTPUT', 'TOOL_POLICY_VIOLATION'])
    if (allowed.has(error.code)) return error.code
  }
  return 'EXECUTION_FAILED'
}
