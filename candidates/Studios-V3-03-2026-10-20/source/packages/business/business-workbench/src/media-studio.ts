/** Host-owned durable Mock media sessions used by Image and Video Studio. */

import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { defineDomain, domainTable, type KvTable } from '@deepseek-ai/dsh-storage-domain'
import { BusinessWorkbenchError } from './errors.ts'
import type {
  CreateCreativeTurnRequest,
  CreativeSession,
  CreativeSessionRecord,
  CreativeTurn,
  MediaArtifact,
  MediaArtifactRevision,
  MediaStudioModel,
  MediaStudioModality,
  MediaStudioParameterField,
  MediaStudioTask,
  MediaStudioTaskStatus,
} from './types.ts'
import type { JsonValue } from '@deepseek-ai/dsh-session/types'

const jsonRecord = z.record(z.string(), z.json())
const idSchema = z.string().min(1).max(160)
const sessionSchema = z.object({
  sessionId: idSchema,
  modality: z.enum(['image', 'video']),
  title: z.string().min(1).max(120),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
}).strict()
const turnSchema = z.object({
  turnId: idSchema,
  sessionId: idSchema,
  modality: z.enum(['image', 'video']),
  taskIds: z.array(idSchema),
  artifactIds: z.array(idSchema),
  prompt: z.string().max(20_000),
  modelId: idSchema,
  provider: idSchema,
  paramsSnapshot: jsonRecord,
  referenceArtifactIds: z.array(idSchema),
  requestedOutputCount: z.number().int().min(1).max(12),
  parentArtifactId: idSchema.nullable(),
  modificationIntent: z.string().max(2_000).nullable(),
  operation: z.enum(['generation', 'mock-derived-revision', 'prompted-regeneration-not-precise-edit']),
  createdAt: z.number().int().nonnegative(),
  status: z.enum(['queued', 'processing', 'completed', 'failed', 'cancelled', 'timeout']),
}).strict()
const taskSchema = z.object({
  taskId: idSchema,
  sessionId: idSchema,
  turnId: idSchema,
  modality: z.enum(['image', 'video']),
  modelId: idSchema,
  provider: idSchema,
  paramsSnapshot: jsonRecord,
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  status: z.enum(['queued', 'processing', 'completed', 'failed', 'cancelled', 'timeout']),
  progress: z.number().int().min(0).max(100),
  pollCount: z.number().int().nonnegative(),
  remoteTaskId: idSchema.nullable(),
  resultRefs: z.array(idSchema),
  errorCode: idSchema.nullable(),
  mock: z.literal(true),
  providerNetworkRequests: z.literal(0),
}).strict()
const artifactSchema = z.object({
  artifactId: idSchema,
  sessionId: idSchema,
  turnId: idSchema,
  taskId: idSchema,
  modality: z.enum(['image', 'video']),
  parentArtifactId: idSchema.nullable(),
  provider: idSchema,
  modelId: idSchema,
  prompt: z.string().max(20_000),
  paramsSnapshot: jsonRecord,
  referenceArtifactIds: z.array(idSchema),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  status: z.enum(['queued', 'processing', 'completed', 'failed', 'cancelled', 'timeout']),
  resultRef: idSchema.nullable(),
  displayIndex: z.number().int().nonnegative(),
  revisionDepth: z.number().int().nonnegative(),
  mock: z.literal(true),
}).strict()
const revisionSchema = z.object({
  revisionId: idSchema,
  artifactId: idSchema,
  parentArtifactId: idSchema,
  turnId: idSchema,
  intent: z.string().max(2_000).nullable(),
  createdAt: z.number().int().nonnegative(),
}).strict()
const sessionRecordSchema = z.object({
  session: sessionSchema,
  turns: z.array(turnSchema),
  tasks: z.array(taskSchema),
  artifacts: z.array(artifactSchema),
  revisions: z.array(revisionSchema),
}).strict().superRefine((record, context) => {
  const turnIds = new Set(record.turns.map(turn => turn.turnId))
  const artifactIds = new Set(record.artifacts.map(artifact => artifact.artifactId))
  for (const turn of record.turns) {
    if (turn.sessionId !== record.session.sessionId) context.addIssue({ code: 'custom', path: ['turns'], message: 'turn belongs to another session' })
  }
  for (const task of record.tasks) {
    if (task.sessionId !== record.session.sessionId || !turnIds.has(task.turnId)) context.addIssue({ code: 'custom', path: ['tasks'], message: 'task ownership is invalid' })
  }
  for (const artifact of record.artifacts) {
    if (artifact.sessionId !== record.session.sessionId || !turnIds.has(artifact.turnId)) context.addIssue({ code: 'custom', path: ['artifacts'], message: 'artifact ownership is invalid' })
    if (artifact.parentArtifactId !== null && !artifactIds.has(artifact.parentArtifactId)) context.addIssue({ code: 'custom', path: ['artifacts'], message: 'artifact parent is missing' })
  }
  for (const revision of record.revisions) {
    if (!artifactIds.has(revision.artifactId) || !artifactIds.has(revision.parentArtifactId) || !turnIds.has(revision.turnId)) context.addIssue({ code: 'custom', path: ['revisions'], message: 'revision reference is missing' })
  }
})

/** Separate schema namespace so adding media records does not rewrite XHS business data. */
export const mediaStudioDomainSpec = defineDomain({
  name: 'business_workbench_media_studio',
  version: 1,
  tables: { sessions: domainTable<string, CreativeSessionRecord>(sessionRecordSchema) },
})

const imageFields: { readonly resolution: MediaStudioParameterField; readonly aspectRatio: MediaStudioParameterField } = {
  resolution: { id: 'resolution', label: '分辨率', type: 'select', default: '1K', options: ['1K', '2K'] },
  aspectRatio: { id: 'aspectRatio', label: '画幅比例', type: 'select', default: '1:1', options: ['1:1', '3:4', '4:3', '9:16', '16:9'] },
}
const models: readonly MediaStudioModel[] = [
  defineModel('volcengine-seedream', 'Seedream 5.0 Pro', 'Volcengine', 'image', 1, true, 'image', 1, [
    select('resolution', '分辨率', '2K', ['1K', '1.5K', '2K']), imageFields.aspectRatio,
    toggle('watermark', '水印', false), select('outputFormat', '格式', 'jpeg', ['jpeg', 'png']),
  ]),
  defineModel('alibaba-qwen-image', 'Qwen Image 3.0 Pro', 'Alibaba Cloud', 'image', 6, true, 'image', 1, [
    imageFields.resolution, imageFields.aspectRatio, select('outputCount', '生成数量', 1, [1, 2, 3, 4, 5, 6]),
    text('negativePrompt', '反向提示词', ''), toggle('watermark', '水印', false),
  ]),
  defineModel('wan2.7-image-pro', 'Wan 2.7 Image Pro', 'Alibaba Cloud', 'image', 4, true, 'image', 9, [
    select('resolution', '分辨率', '2K', ['1K', '2K', '4K']), { ...imageFields.aspectRatio, options: ['1:1', '3:4', '4:3', '9:16', '16:9'] },
    select('outputCount', '生成数量', 1, [1, 2, 3, 4]), toggle('thinkingMode', '思考模式', true), toggle('watermark', '水印', false),
  ]),
  defineModel('minimax-h3', 'MiniMax H3', 'MiniMax', 'video', 1, false, 'first-frame', 1, [
    select('resolution', '分辨率', '768P', ['768P', '2K']), range('duration', '时长（秒）', 5, 4, 15),
    select('ratio', '画幅比例', '16:9', ['16:9', '9:16', '1:1', '4:3', '3:4']), toggle('aigcWatermark', 'AIGC 水印', false),
  ]),
  defineModel('wan3.0-video-prime', 'Wan 3.0 Video Prime', 'Alibaba Cloud', 'video', 1, false, 'first-frame', 1, [
    select('resolution', '分辨率', '480P', ['480P', '720P', '1080P']), range('duration', '时长（秒）', 5, 2, 30),
    select('ratio', '画幅比例', '16:9', ['16:9', '4:3', '1:1', '3:4', '9:16', 'adaptive']),
    toggle('audio', '生成音频', true), toggle('promptExtend', '提示词扩展', true),
  ]),
]
const terminal = new Set<MediaStudioTaskStatus>(['completed', 'failed', 'cancelled', 'timeout'])
const id = (prefix: string): string => `${prefix}_${randomUUID()}`
const copy = <T>(value: T): T => structuredClone(value)

/** Storage-backed session, task, artifact, and revision operations; all generated media stays Mock-only. */
export class MediaStudioStore {
  /** @param sessions - The owned media-session table in the dedicated domain. */
  constructor(private readonly sessions: KvTable<string, CreativeSessionRecord>) {}

  /** Return the five fixed Mock-capable models for one modality. */
  listModels(modality: MediaStudioModality): readonly MediaStudioModel[] {
    return Object.freeze(models.filter(model => model.modality === modality))
  }

  /** Return sessions in most-recently-updated order without reading result bytes. */
  listSessions(modality: MediaStudioModality): readonly CreativeSession[] {
    return Object.freeze([...this.sessions.entries()]
      .map(([, record]) => record.session)
      .filter(session => session.modality === modality)
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .map(copy))
  }

  /** Read one complete session history, or null when its opaque ID is unknown. */
  readSession(sessionId: string): CreativeSessionRecord | null {
    const record = this.sessions.get(sessionId)
    return record === undefined ? null : deepFreeze(copy(record))
  }

  /** Append one bounded Mock turn and its task, artifacts, and revision edges atomically. */
  async createTurn(rawRequest: CreateCreativeTurnRequest): Promise<CreativeSessionRecord> {
    const request = createRequestSchema.parse(rawRequest)
    const model = models.find(candidate => candidate.modelId === request.modelId && candidate.modality === request.modality)
    if (model === undefined) throw invalid('model is not registered for this modality')
    const normalized = normalizeParams(model, request.prompt, request.params)
    const outputCount = request.requestedOutputCount ?? numeric(normalized.outputCount) ?? 1
    if (!Number.isInteger(outputCount) || outputCount < 1 || outputCount > 12) throw invalid('requested output count must be between 1 and 12')
    if (request.modificationIntent !== undefined && request.modificationIntent.length > 2_000) throw invalid('modification intent is too long')

    const now = Date.now()
    const previousRecord = request.sessionId === undefined ? undefined : this.sessions.get(request.sessionId)
    if (request.sessionId !== undefined && previousRecord === undefined) throw notFound('creative session')
    if (previousRecord !== undefined && previousRecord.session.modality !== request.modality) throw invalid('session modality does not match request')
    const parent = request.parentArtifactId === undefined
      ? undefined
      : previousRecord?.artifacts.find(artifact => artifact.artifactId === request.parentArtifactId)
    if (request.parentArtifactId !== undefined && parent === undefined) throw notFound('parent artifact')
    if (parent !== undefined && parent.modality !== request.modality) throw invalid('parent artifact modality does not match request')
    if (parent !== undefined && request.modality === 'image' && !model.supportsReferenceArtifact) throw invalid('model does not accept image references')
    if (parent !== undefined && (request.modificationIntent === undefined || request.modificationIntent.trim() === '')) throw invalid('a selected parent artifact requires a modification intent')

    const session: CreativeSession = previousRecord?.session ?? {
      sessionId: id('creative'), modality: request.modality,
      title: request.prompt.trim().slice(0, 72), createdAt: now, updatedAt: now,
    }
    const turnId = id('turn')
    const tasks: MediaStudioTask[] = []
    const artifacts: MediaArtifact[] = []
    const revisions: MediaArtifactRevision[] = []
    const maxOutputs = model.maxOutputsPerTask
    const taskCount = Math.ceil(outputCount / maxOutputs)
    let displayIndex = 0
    for (let taskIndex = 0; taskIndex < taskCount; taskIndex += 1) {
      const count = Math.min(maxOutputs, outputCount - taskIndex * maxOutputs)
      const taskId = id('task')
      const taskParams = { ...normalized, ...(Object.hasOwn(normalized, 'outputCount') ? { outputCount: count } : {}) }
      const videoPending = request.modality === 'video'
      const resultRefs = videoPending ? [] : Array.from({ length: count }, (_, index) => `mock-result://${taskId}/${index + 1}`)
      const status: MediaStudioTaskStatus = videoPending ? 'queued' : 'completed'
      const task: MediaStudioTask = {
        taskId, sessionId: session.sessionId, turnId, modality: request.modality, modelId: model.modelId,
        provider: model.provider, paramsSnapshot: taskParams, createdAt: now, updatedAt: now, status,
        progress: videoPending ? 0 : 100, pollCount: 0,
        remoteTaskId: videoPending ? `mock-remote://${taskId}` : null,
        resultRefs, errorCode: null, mock: true, providerNetworkRequests: 0,
      }
      tasks.push(task)
      const artifactCount = videoPending ? 1 : count
      for (let index = 0; index < artifactCount; index += 1) {
        const artifact: MediaArtifact = {
          artifactId: id('artifact'), sessionId: session.sessionId, turnId, taskId, modality: request.modality,
          parentArtifactId: parent?.artifactId ?? null, provider: model.provider, modelId: model.modelId,
          prompt: request.prompt.trim(), paramsSnapshot: taskParams,
          referenceArtifactIds: parent !== undefined && request.modality === 'image' ? [parent.artifactId] : [],
          createdAt: now, updatedAt: now, status, resultRef: resultRefs[index] ?? null,
          displayIndex: displayIndex++, revisionDepth: parent === undefined ? 0 : parent.revisionDepth + 1, mock: true,
        }
        artifacts.push(artifact)
        if (parent !== undefined) revisions.push({
          revisionId: id('revision'), artifactId: artifact.artifactId,
          parentArtifactId: parent.artifactId, turnId, intent: request.modificationIntent ?? null, createdAt: now,
        })
      }
    }
    const turn: CreativeTurn = {
      turnId, sessionId: session.sessionId, modality: request.modality,
      taskIds: tasks.map(task => task.taskId), artifactIds: artifacts.map(artifact => artifact.artifactId),
      prompt: request.prompt.trim(), modelId: model.modelId, provider: model.provider,
      paramsSnapshot: normalized, referenceArtifactIds: parent !== undefined && request.modality === 'image' ? [parent.artifactId] : [],
      requestedOutputCount: outputCount, parentArtifactId: parent?.artifactId ?? null,
      modificationIntent: request.modificationIntent?.trim() || null,
      operation: parent === undefined ? 'generation' : request.modality === 'video' ? 'prompted-regeneration-not-precise-edit' : 'mock-derived-revision',
      createdAt: now, status: summarizeStatus(tasks),
    }
    const next: CreativeSessionRecord = {
      session: { ...session, updatedAt: now },
      turns: [...(previousRecord?.turns ?? []), turn],
      tasks: [...(previousRecord?.tasks ?? []), ...tasks],
      artifacts: [...(previousRecord?.artifacts ?? []), ...artifacts],
      revisions: [...(previousRecord?.revisions ?? []), ...revisions],
    }
    const validated = sessionRecordSchema.parse(next)
    if (previousRecord === undefined) await this.sessions.put(session.sessionId, validated)
    else await this.sessions.update(session.sessionId, () => validated)
    return deepFreeze(copy(validated))
  }

  /** Advance one persisted video Mock task without contacting a provider. */
  async pollTask(taskId: string): Promise<MediaStudioTask> {
    const { sessionId, task } = this.locateTask(taskId)
    if (terminal.has(task.status)) return copy(task)
    let updatedTask: MediaStudioTask | undefined
    await this.sessions.update(sessionId, current => {
      const updatedAt = Date.now()
      updatedTask = task.pollCount === 0
        ? { ...task, status: 'processing', progress: 54, pollCount: 1, updatedAt }
        : { ...task, status: 'completed', progress: 100, pollCount: task.pollCount + 1, resultRefs: [`mock-result://${task.taskId}/1`], updatedAt }
      return updateTaskRecord(current, updatedTask)
    })
    if (updatedTask === undefined) throw new Error('business-workbench: media task update did not commit')
    return copy(updatedTask)
  }

  /** Cancel one pending Mock task and keep its task and artifact records. */
  async cancelTask(taskId: string): Promise<MediaStudioTask> {
    const { sessionId, task } = this.locateTask(taskId)
    if (terminal.has(task.status)) return copy(task)
    let updatedTask: MediaStudioTask | undefined
    await this.sessions.update(sessionId, current => {
      updatedTask = { ...task, status: 'cancelled', updatedAt: Date.now(), errorCode: null }
      return updateTaskRecord(current, updatedTask)
    })
    if (updatedTask === undefined) throw new Error('business-workbench: media task cancellation did not commit')
    return copy(updatedTask)
  }

  private locateTask(taskId: string): { sessionId: string; task: MediaStudioTask } {
    for (const [sessionId, record] of this.sessions.entries()) {
      const task = record.tasks.find(candidate => candidate.taskId === taskId)
      if (task !== undefined) return { sessionId, task }
    }
    throw notFound('media task')
  }
}

/** Validate one fixed Host request before it reaches the session store. */
const createRequestSchema = z.object({
  modality: z.enum(['image', 'video']),
  modelId: z.string().min(1).max(100),
  prompt: z.string().trim().min(1).max(20_000),
  params: jsonRecord,
  sessionId: z.string().min(1).max(160).optional(),
  parentArtifactId: z.string().min(1).max(160).optional(),
  modificationIntent: z.string().max(2_000).optional(),
  requestedOutputCount: z.number().int().min(1).max(12).optional(),
}).strict()

/** Return a frozen model descriptor and its parameter field list. */
function defineModel(
  modelId: string,
  displayName: string,
  provider: string,
  modality: MediaStudioModality,
  maxOutputsPerTask: number,
  supportsReferenceArtifact: boolean,
  referenceKind: 'image' | 'first-frame' | null,
  maxReferenceAssets: number,
  parameterFields: readonly MediaStudioParameterField[],
): MediaStudioModel {
  return Object.freeze({
    modelId, displayName, provider, modality, maxOutputsPerTask, supportsReferenceArtifact,
    referenceKind, maxReferenceAssets,
    ...(modelId === 'wan2.7-image-pro' ? { referenceResolutionMax: '2K' } : {}),
    supportsPreciseEditing: false,
    parameterDefaults: Object.freeze(Object.fromEntries(parameterFields.map(field => [field.id, field.default]))),
    parameterFields: Object.freeze(parameterFields),
  })
}

function select(id: string, label: string, defaultValue: string | number, options: readonly (string | number)[]): MediaStudioParameterField {
  return { id, label, type: 'select', default: defaultValue, options }
}

function toggle(id: string, label: string, defaultValue: boolean): MediaStudioParameterField {
  return { id, label, type: 'toggle', default: defaultValue }
}

function text(id: string, label: string, defaultValue: string): MediaStudioParameterField {
  return { id, label, type: 'text', default: defaultValue }
}

function range(id: string, label: string, defaultValue: number, min: number, max: number): MediaStudioParameterField {
  return { id, label, type: 'range', default: defaultValue, min, max, step: 1 }
}

function normalizeParams(
  model: MediaStudioModel,
  prompt: string,
  params: Readonly<Record<string, unknown>>,
): Readonly<Record<string, JsonValue>> {
  if (prompt.length > promptLimit(model.modelId)) throw invalid('prompt exceeds the registered model limit')
  const fields = model.parameterFields
  const known = new Set(fields.map(field => field.id))
  for (const key of Object.keys(params)) if (!known.has(key)) throw invalid(`model does not support parameter '${key}'`)
  const output: Record<string, JsonValue> = {}
  for (const field of fields) {
    const value = params[field.id] ?? field.default
    if (field.type === 'select' && !field.options?.some(option => option === value)) throw invalid(`invalid value for '${field.id}'`)
    if (field.type === 'toggle' && typeof value !== 'boolean') throw invalid(`invalid value for '${field.id}'`)
    if (field.type === 'text' && (typeof value !== 'string' || value.length > 5_000)) throw invalid(`invalid value for '${field.id}'`)
    if (field.type === 'range' && (typeof value !== 'number' || !Number.isInteger(value) || value < (field.min ?? 0) || value > (field.max ?? 0))) throw invalid(`invalid value for '${field.id}'`)
    output[field.id] = value as JsonValue
  }
  if (model.modelId === 'wan2.7-image-pro' && (params.referenceArtifactId !== undefined || params.outputCount !== undefined) && params.resolution === '4K') {
    throw invalid('Wan 2.7 Image reference generation is limited to 2K')
  }
  return Object.freeze(output)
}

function promptLimit(modelId: string): number {
  if (modelId === 'wan3.0-video-prime') return 20_000
  if (modelId === 'minimax-h3') return 7_000
  return 5_000
}

function numeric(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined
}

function summarizeStatus(tasks: readonly MediaStudioTask[]): MediaStudioTaskStatus {
  if (tasks.every(task => task.status === 'completed')) return 'completed'
  if (tasks.some(task => task.status === 'processing')) return 'processing'
  if (tasks.some(task => task.status === 'failed' || task.status === 'timeout')) return 'failed'
  if (tasks.every(task => task.status === 'cancelled')) return 'cancelled'
  return 'queued'
}

function updateTaskRecord(record: CreativeSessionRecord, task: MediaStudioTask): CreativeSessionRecord {
  const tasks = record.tasks.map(current => current.taskId === task.taskId ? task : current)
  const artifacts = record.artifacts.map(artifact => artifact.taskId !== task.taskId ? artifact : {
    ...artifact,
    status: task.status,
    updatedAt: task.updatedAt,
    resultRef: task.resultRefs[artifact.displayIndex] ?? task.resultRefs[0] ?? null,
  })
  const turnStatuses = new Map<string, MediaStudioTaskStatus>()
  for (const turn of record.turns) {
    const ownTasks = tasks.filter(candidate => candidate.turnId === turn.turnId)
    turnStatuses.set(turn.turnId, summarizeStatus(ownTasks))
  }
  const turns = record.turns.map(turn => ({ ...turn, status: turnStatuses.get(turn.turnId) ?? turn.status }))
  return sessionRecordSchema.parse({
    ...record,
    session: { ...record.session, updatedAt: task.updatedAt },
    turns, tasks, artifacts,
  })
}

function invalid(message: string): BusinessWorkbenchError {
  return new BusinessWorkbenchError('INVALID_OPERATION', `business-workbench: media studio ${message}`)
}

function notFound(target: string): BusinessWorkbenchError {
  return new BusinessWorkbenchError('NOT_FOUND', `business-workbench: ${target} was not found`)
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}
