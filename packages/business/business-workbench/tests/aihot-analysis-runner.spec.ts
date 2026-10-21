import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime, { LlmAdapter, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import JsonlSessionPersistence from '../../../session/session-persistence-jsonl/src/index.ts'
import * as SessionCheckpointPolicy from '../../../session/session-checkpoint-policy/src/index.ts'
import { AihotAnalysisRunner } from '../src/aihot-analysis-runner.ts'
import type { AihotEvidencePack } from '../src/aihot-evidence-analysis.ts'
import { createAihotEvidencePack, validateAihotAnalysisResponse } from '../src/aihot-evidence-analysis.ts'
import type { RestrictedAgentModelConfig } from '../src/host-policy.ts'
import { HarnessRestrictedAgentRuntime } from '../src/restricted-agent.ts'

const sourceId = 'item:item-1:title'
const validOutput = JSON.stringify({
  basicFacts: [{ text: 'The source published the item at the recorded time.', sourceIds: [sourceId] }],
  keyChanges: [], inferences: [], unverified: [{ text: 'Impact is not established.', sourceIds: [] }],
})
const model: RestrictedAgentModelConfig = { provider: 'fixture-provider', model: 'fixture-model', timeoutMs: 1_000 }
const roots: string[] = []

afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

function evidencePack(overrides: { readonly summary?: string | null } = {}): AihotEvidencePack {
  return createAihotEvidencePack({
    evidencePackId: 'ep-session-test', collectedAt: '2026-10-17T12:00:00.000Z',
    items: [{
      itemId: 'item-1', storyId: null, title: 'Model release', originalTitle: 'Model release',
      publishedAt: '2026-10-17T10:00:00.000Z', sourceName: 'Example Source', originalUrl: 'https://example.com/article',
      aihotUrl: 'https://aihot.news/items/item-1', summary: overrides.summary ?? 'A public summary.', category: 'ai-models',
      officialMetrics: { score: { value: null, source: 'GET /items.score', semantics: 'No comparative meaning is defined.' }, selected: { value: false, source: 'GET /items.selected' } },
      fieldSources: { title: 'GET /items.title', summary: 'GET /items.summary' },
    }], stories: [],
  })
}

type Script = { readonly kind: 'text'; readonly text: string } | { readonly kind: 'error' } | { readonly kind: 'hang' }

class FixtureAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []
  constructor(private readonly script: Script) { super() }
  override resolveModel(provider: string, modelId: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({ provider, id: modelId, name: modelId, reasoning: { efforts: [{ id: ReasoningEffortId('low'), name: 'Low' }], defaultEffort: ReasoningEffortId('low') } })
  }
  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    if (this.script.kind === 'error') throw Object.assign(new Error('fixture provider failed'), { code: 'FIXTURE_PROVIDER_ERROR' })
    if (this.script.kind === 'hang') {
      await new Promise<void>((_resolve, reject) => options.signal?.addEventListener('abort', () => reject(new Error('fixture aborted')), { once: true }))
      return
    }
    const text = this.script.text
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text }
    yield { type: 'block-end', index: 0, block: { type: 'text', text } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

async function harness(script: Script, persistence = true): Promise<{ ctx: Context; runtime: HarnessRestrictedAgentRuntime; adapter: FixtureAdapter; root: string; dispose(): Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-aihot-analysis-'))
  roots.push(root)
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  if (persistence) await ctx.plugin(JsonlSessionPersistence, { root: join(root, 'sessions'), compression: 'none' })
  if (persistence) await ctx.plugin(SessionCheckpointPolicy)
  await ctx.plugin(SystemPrompt, { persona: 'ambient user context must not enter analysis' })
  await ctx.plugin(ToolRuntime, { mode: 'code' })
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })
  const adapter = new FixtureAdapter(script)
  ctx.llm.registerAdapter(['fixture-provider'], adapter)
  return {
    ctx, runtime: new HarnessRestrictedAgentRuntime(ctx as never), adapter, root,
    async dispose() { await ctx.fiber.dispose() },
  }
}

function testRunner(output: string) {
  const calls: unknown[] = []
  const runtime = { run: async (invocation: unknown) => { calls.push(invocation); return { output, metrics: { responseCompletedAt: Date.parse('2026-10-17T12:30:00.000Z') } } } }
  return { runner: new AihotAnalysisRunner(runtime as never, model), calls }
}

describe('AIHOT Session analysis runner', () => {
  it('submits one bounded task through a separate restricted Session and validates its result', async () => {
    const fixture = await harness({ kind: 'text', text: validOutput })
    try {
      const result = await new AihotAnalysisRunner(fixture.runtime, model).run(evidencePack())
      expect(result).toMatchObject({ status: 'completed', taskType: 'evidence-review-v1', modelId: 'fixture-provider/fixture-model', validation: { status: 'passed' } })
      expect(result.sessionId).toBeTruthy()
      expect(result.analysis?.basicFacts[0]?.sourceIds).toEqual([sourceId])
      expect(fixture.adapter.requests).toHaveLength(1)
      expect(fixture.adapter.requests[0]?.tools ?? []).toEqual([])
      expect(fixture.adapter.requests[0]?.system).not.toContain('ambient user context')
      const stored = await fixture.ctx.sessionPersistence.inspect(SessionId(result.sessionId!))
      const header = stored.events.find(event => event.type === 'request/header')
      const user = stored.events.find(event => event.type === 'user/message')
      const assistant = stored.events.find(event => event.type === 'assistant/message')
      expect(header?.type === 'request/header' && JSON.stringify(header.data.header)).toContain('evidence-review-v1')
      expect(user?.type === 'user/message' && JSON.stringify(user.data)).toContain('ep-session-test')
      expect(assistant?.type).toBe('assistant/message')
      expect(stored.events.at(-1)?.type).toBe('turn/end')
      if (assistant?.type !== 'assistant/message') throw new Error('stored Session is missing its assistant result')
      const reconstructed = assistant.data.message.content.filter(block => block.type === 'text').map(block => block.text).join('')
      expect(validateAihotAnalysisResponse(reconstructed, evidencePack(), 'fixture-provider/fixture-model', new Date(assistant.time).toISOString()))
        .toMatchObject({ ok: true, value: { evidencePackId: 'ep-session-test', basicFacts: [{ sourceIds: [sourceId] }] } })
    } finally { await fixture.dispose() }
  })

  it('records exact task and evidence snapshot in the invocation passed to the Harness runtime', async () => {
    const { runner, calls } = testRunner(validOutput)
    const result = await runner.run(evidencePack())
    const call = calls[0] as { systemPrompt: string; userPrompt: string; requireDurableSession: boolean; sessionId: string }
    expect(call.requireDurableSession).toBe(true)
    expect(call.systemPrompt).toContain('Task type: evidence-review-v1')
    expect(JSON.parse(call.userPrompt)).toMatchObject({ taskId: result.taskId, taskType: 'evidence-review-v1', evidencePack: { evidencePackId: 'ep-session-test' } })
    expect(call.sessionId).toBe(result.sessionId)
  })

  it('returns a failed validation for malformed model JSON', async () => {
    const { runner } = testRunner('not-json')
    await expect(runner.run(evidencePack())).resolves.toMatchObject({ status: 'failed', validation: { status: 'failed', code: 'INVALID_JSON' }, failureCode: 'INVALID_JSON' })
  })

  it('rejects a response that cites a fabricated Evidence Pack source id', async () => {
    const { runner } = testRunner(validOutput.replace(sourceId, 'fabricated-source'))
    await expect(runner.run(evidencePack())).resolves.toMatchObject({ status: 'failed', validation: { status: 'failed', code: 'INVALID_SOURCE_REFERENCE' } })
  })

  it('returns only a safe provider failure category', async () => {
    const fixture = await harness({ kind: 'error' })
    try {
      await expect(new AihotAnalysisRunner(fixture.runtime, model).run(evidencePack()))
        .resolves.toMatchObject({ status: 'failed', validation: { status: 'not_run' }, failureCode: 'PROVIDER_ERROR' })
    } finally { await fixture.dispose() }
  })

  it('records and returns a native timeout failure', async () => {
    const fixture = await harness({ kind: 'hang' })
    try {
      await expect(new AihotAnalysisRunner(fixture.runtime, { ...model, timeoutMs: 5 }).run(evidencePack()))
        .resolves.toMatchObject({ status: 'failed', validation: { status: 'not_run' }, failureCode: 'MODEL_TIMEOUT' })
    } finally { await fixture.dispose() }
  })

  it('forwards user cancellation to the Agent and records the aborted Session turn', async () => {
    const fixture = await harness({ kind: 'hang' })
    const controller = new AbortController()
    try {
      const pending = new AihotAnalysisRunner(fixture.runtime, model).run(evidencePack(), controller.signal)
      await new Promise(resolve => setTimeout(resolve, 5))
      controller.abort()
      const result = await pending
      expect(result).toMatchObject({ status: 'cancelled', failureCode: 'MODEL_CANCELLED' })
      expect(result.sessionId).toBeTruthy()
      const stored = await fixture.ctx.sessionPersistence.inspect(SessionId(result.sessionId!))
      expect(stored.events.findLast(event => event.type === 'turn/end')).toMatchObject({
        type: 'turn/end', data: { reason: { kind: 'aborted', reason: { kind: 'user' } } },
      })
    } finally { await fixture.dispose() }
  })

  it('rejects an oversized complete prompt before creating a Session', async () => {
    const hugePack = { ...evidencePack(), evidencePackId: 'x'.repeat(45_000) } as AihotEvidencePack
    const { runner, calls } = testRunner(validOutput)
    await expect(runner.run(hugePack)).resolves.toMatchObject({ status: 'failed', failureCode: 'INPUT_TOO_LARGE', sessionId: null })
    expect(calls).toHaveLength(0)
  })

  it('fails closed when no Session persistence service is mounted', async () => {
    const fixture = await harness({ kind: 'text', text: validOutput }, false)
    try {
      await expect(new AihotAnalysisRunner(fixture.runtime, model).run(evidencePack()))
        .resolves.toMatchObject({ status: 'failed', failureCode: 'SESSION_PERSISTENCE_UNAVAILABLE', sessionId: null })
      expect(fixture.adapter.requests).toHaveLength(0)
    } finally { await fixture.dispose() }
  })

  it('reports unavailable Agent infrastructure without issuing a model request', async () => {
    const { calls } = testRunner(validOutput)
    const unavailable = new AihotAnalysisRunner({ run: async () => { throw Object.assign(new Error('not available'), { code: 'AGENT_RUNTIME_UNAVAILABLE' }) } } as never, model)
    await expect(unavailable.run(evidencePack())).resolves.toMatchObject({ status: 'failed', failureCode: 'AGENT_RUNTIME_UNAVAILABLE' })
    expect(calls).toHaveLength(0)
  })
})
