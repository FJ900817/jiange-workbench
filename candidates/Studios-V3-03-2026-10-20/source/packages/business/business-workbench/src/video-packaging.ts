/** Host-owned media assets, P5-07 projects, and bounded FFmpeg render tasks. */

import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { chmod, link, mkdir, open, readdir, rename, rm, stat, unlink } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { z } from 'zod'
import { defineDomain, domainTable, type KvTable } from '@deepseek-ai/dsh-storage-domain'
import type { JsonValue } from '@deepseek-ai/dsh-session/types'
import { BusinessWorkbenchError } from './errors.ts'
import { buildP5RenderArgs } from './video-packaging-render.ts'
import type { PackagingRenderProject } from './video-packaging-render.ts'
import type { VideoPackagingAsset, VideoPackagingProject, VideoPackagingRenderTask } from './types.ts'

const UUID = z.string().uuid()
const SHA256 = z.string().regex(/^[a-f0-9]{64}$/)
const timestamp = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const mediaType = z.enum(['video/mp4', 'image/png'])
const assetKind = z.enum(['source-video', 'visual-png', 'render-output'])
const assetStatus = z.enum(['technical-test', 'pending-confirmation'])
const renderStatus = z.enum(['queued', 'running', 'completed', 'failed', 'cancelled', 'interrupted'])
const componentBase = z.object({
  id: UUID,
  x: z.number().finite().min(0),
  y: z.number().finite().min(0),
  width: z.number().finite().positive().max(8192),
  height: z.number().finite().positive().max(8192),
  start: z.number().finite().min(0),
  duration: z.number().finite().positive().max(3600),
  layer: z.number().int().min(0).max(1000),
  animation: z.enum(['fadeUp', 'fade', 'none']),
}).passthrough()
const assetComponent = componentBase.extend({
  type: z.literal('asset'),
  assetId: UUID,
  opacity: z.number().finite().min(0).max(1),
  hidden: z.boolean(),
}).passthrough()
const textComponent = componentBase.extend({
  type: z.enum(['title', 'highlight', 'info']),
  hidden: z.boolean().optional(),
  overlayAssetId: UUID,
}).passthrough()
const p5AssetReference = z.object({
  id: UUID,
  storage: z.literal('library'),
  originalName: z.string().min(1).max(180),
  mimeType: z.enum(['image/png']),
  relativePath: z.string().min(1).max(160),
  width: z.number().int().min(1).max(8192),
  height: z.number().int().min(1).max(8192),
  duration: z.null(),
  hasAlpha: z.literal(true),
  bytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  sha256: SHA256,
}).passthrough()
const p5DocumentSchema = z.object({
  schemaVersion: z.literal(1),
  projectId: z.string().min(1).max(160),
  name: z.string().min(1).max(120),
  fps: z.number().finite().min(1).max(60),
  width: z.number().int().min(16).max(8192),
  height: z.number().int().min(16).max(8192),
  video: z.object({
    asset: z.literal('source.mp4'),
    width: z.number().int().min(16).max(8192),
    height: z.number().int().min(16).max(8192),
    duration: z.number().finite().positive().max(3600),
    fps: z.number().finite().min(1).max(60),
    codec: z.string().min(1).max(80),
    hasAudio: z.boolean(),
    audio: z.object({ codec: z.string().min(1).max(80), sampleRate: z.number().int().positive(), channels: z.number().int().positive() }).passthrough().optional(),
    importedAt: z.string().max(80).optional(),
  }).passthrough(),
  components: z.array(z.union([assetComponent, textComponent])).max(100),
  mediaAssets: z.array(p5AssetReference).max(100),
}).passthrough().superRefine((project, context) => {
  if (project.width !== project.video.width || project.height !== project.video.height) {
    context.addIssue({ code: 'custom', path: ['video'], message: 'P5 canvas and source dimensions must match for S2 rendering' })
  }
  const assetIds = new Set(project.mediaAssets.map(asset => asset.id))
  const componentIds = new Set<string>()
  for (const component of project.components) {
    if (componentIds.has(component.id)) context.addIssue({ code: 'custom', path: ['components'], message: 'component ids must be unique' })
    componentIds.add(component.id)
    if (component.x + component.width > project.width + 0.01 || component.y + component.height > project.height + 0.01) {
      context.addIssue({ code: 'custom', path: ['components'], message: 'component exceeds the P5 canvas' })
    }
    if (component.start + component.duration > project.video.duration + 0.02) {
      context.addIssue({ code: 'custom', path: ['components'], message: 'component exceeds source duration' })
    }
    if (component.type === 'asset' && !assetIds.has(component.assetId)) {
      context.addIssue({ code: 'custom', path: ['components'], message: 'asset component does not name a project asset' })
    }
    if (component.type !== 'asset' && !assetIds.has(component.overlayAssetId)) {
      context.addIssue({ code: 'custom', path: ['components'], message: 'text component overlay does not name a project PNG asset' })
    }
  }
  const ids = new Set<string>()
  for (const asset of project.mediaAssets) {
    if (ids.has(asset.id)) context.addIssue({ code: 'custom', path: ['mediaAssets'], message: 'project asset ids must be unique' })
    ids.add(asset.id)
    if (asset.relativePath !== `media/${asset.id}.png`) {
      context.addIssue({ code: 'custom', path: ['mediaAssets'], message: 'project asset path must use the canonical Host asset id' })
    }
  }
})

type P5Document = z.infer<typeof p5DocumentSchema>
type StoredVideoPackagingProject = Omit<VideoPackagingProject, 'document'> & { readonly document: P5Document }

const assetRecordSchema: z.ZodType<VideoPackagingAsset> = z.object({
  assetId: UUID,
  kind: assetKind,
  name: z.string().min(1).max(180),
  mediaType,
  bytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  sha256: SHA256,
  width: z.number().int().min(1).max(8192),
  height: z.number().int().min(1).max(8192),
  duration: z.number().finite().positive().max(3600).nullable(),
  fps: z.number().finite().min(1).max(60).nullable(),
  hasAudio: z.boolean(),
  videoCodec: z.string().max(80).nullable(),
  audioCodec: z.string().max(80).nullable(),
  audioSampleRate: z.number().int().positive().nullable(),
  audioChannels: z.number().int().positive().nullable(),
  hasAlpha: z.boolean(),
  status: assetStatus,
  createdAt: timestamp,
}).strict()
const projectRecordSchema: z.ZodType<StoredVideoPackagingProject> = z.object({
  projectId: UUID,
  name: z.string().min(1).max(120),
  sourceVideoAssetId: UUID,
  revision: z.number().int().positive(),
  document: p5DocumentSchema,
  createdAt: timestamp,
  updatedAt: timestamp,
}).strict()
const renderRecordSchema: z.ZodType<VideoPackagingRenderTask> = z.object({
  renderTaskId: UUID,
  projectId: UUID,
  status: renderStatus,
  outputAssetId: UUID.nullable(),
  errorCode: z.string().max(80).nullable(),
  logTail: z.string().max(16_000),
  createdAt: timestamp,
  updatedAt: timestamp,
}).strict()

/** Versioned metadata tables; binary payloads live below the same DSH home. */
export const videoPackagingDomainSpec = defineDomain({
  name: 'business_workbench_video_packaging',
  version: 1,
  tables: {
    assets: domainTable<string, VideoPackagingAsset>(assetRecordSchema),
    projects: domainTable<string, StoredVideoPackagingProject>(projectRecordSchema),
    renders: domainTable<string, VideoPackagingRenderTask>(renderRecordSchema),
  },
})

/** Deployment-controlled limits and executable names for Video Packaging. */
export interface VideoPackagingConfig {
  readonly enabled: boolean
  readonly allowTechnicalTestAssets: boolean
  readonly maxVideoBytes: number
  readonly maxPngBytes: number
  readonly maxOutputBytes: number
  readonly maxProjects: number
  readonly renderTimeoutMs: number
  readonly ffmpegPath: string
  readonly ffprobePath: string
}

/** Bounded binary transfer and Host-managed file persistence for Video Packaging. */
export class VideoPackagingStore {
  /** Maximum decoded bytes accepted in one authenticated Remote chunk. */
  static readonly CHUNK_BYTES = 192 * 1024
  private readonly root: string
  private readonly assetRoot: string
  private readonly stagingRoot: string
  private readonly renderRoot: string
  private readonly uploads = new Map<string, UploadState>()
  private readonly children = new Map<string, ReturnType<typeof spawn>>()
  private readonly renderPromises = new Map<string, Promise<void>>()
  private readonly activeRenderIds = new Set<string>()
  private readonly cancelledRenderIds = new Set<string>()
  private closed = false

  /** @param config - Validated packaging limits and executable names. */
  constructor(
    private readonly assets: KvTable<string, VideoPackagingAsset>,
    private readonly projects: KvTable<string, StoredVideoPackagingProject>,
    private readonly renders: KvTable<string, VideoPackagingRenderTask>,
    dshHome: string,
    private readonly config: VideoPackagingConfig,
  ) {
    this.root = resolve(dshHome, 'studios', 'video-packaging', 'v1')
    this.assetRoot = join(this.root, 'assets')
    this.stagingRoot = join(this.root, 'staging')
    this.renderRoot = join(this.root, 'renders')
  }

  /** Create private roots and mark orphaned process work interrupted without rerunning it. */
  async initialize(): Promise<void> {
    await Promise.all([this.root, this.assetRoot, this.stagingRoot, this.renderRoot].map(async path => {
      await mkdir(path, { recursive: true, mode: 0o700 })
      await chmod(path, 0o700)
    }))
    for (const [id, task] of this.renders.entries()) {
      if (task.status === 'running' || task.status === 'queued') {
        await this.renders.put(id, { ...task, status: 'interrupted', errorCode: 'HOST_RESTARTED', updatedAt: Date.now() })
      }
    }
    const stagingFiles = await readdir(this.stagingRoot)
    await Promise.all(stagingFiles.filter(name => /^upload-[a-f0-9-]{36}\.part$/.test(name)).map(name => rm(join(this.stagingRoot, name), { force: true })))
    const renderFiles = await readdir(this.renderRoot)
    await Promise.all(renderFiles.filter(name => /^render-[a-f0-9-]{36}\.partial\.mp4$/.test(name)).map(name => rm(join(this.renderRoot, name), { force: true })))
  }

  /** Start one strictly bounded binary import through authenticated Host Remotes. */
  async beginUpload(request: { readonly name: string; readonly mediaType: string; readonly bytes: number; readonly sha256: string }): Promise<{ readonly uploadId: string; readonly chunkBytes: number }> {
    this.assertEnabled()
    const parsedType = mediaType.parse(request.mediaType)
    const bytes = z.number().int().positive().max(Number.MAX_SAFE_INTEGER).parse(request.bytes)
    const sha256 = SHA256.parse(request.sha256)
    const name = safeDisplayName(request.name)
    const cap = parsedType === 'video/mp4' ? this.config.maxVideoBytes : this.config.maxPngBytes
    if (bytes > cap) throw invalid(`upload exceeds the ${parsedType} byte limit`)
    if (this.uploads.size >= 2) throw invalid('too many active media uploads')
    const uploadId = randomUUID()
    const path = join(this.stagingRoot, `upload-${uploadId}.part`)
    const handle = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_RDWR, 0o600)
    this.uploads.set(uploadId, {
      uploadId, name, mediaType: parsedType, expectedBytes: bytes, expectedSha256: sha256,
      path, handle, receivedBytes: 0, hash: createHash('sha256'), startedAt: Date.now(),
    })
    return Object.freeze({ uploadId, chunkBytes: VideoPackagingStore.CHUNK_BYTES })
  }

  /** Append one canonical, ordered, bounded base64 chunk. */
  async appendUploadChunk(request: { readonly uploadId: string; readonly offset: number; readonly data: string }): Promise<{ readonly receivedBytes: number; readonly nextOffset: number }> {
    const upload = this.requireUpload(request.uploadId)
    if (Date.now() - upload.startedAt > 15 * 60_000) {
      await this.abortUpload(upload.uploadId)
      throw invalid('media upload expired')
    }
    if (!Number.isSafeInteger(request.offset) || request.offset !== upload.receivedBytes) throw invalid('media chunk offset is not the expected next offset')
    if (request.data.length === 0 || request.data.length > Math.ceil(VideoPackagingStore.CHUNK_BYTES / 3) * 4) throw invalid('media chunk exceeds the wire limit')
    const bytes = Buffer.from(request.data, 'base64')
    if (bytes.length === 0 || bytes.length > VideoPackagingStore.CHUNK_BYTES || bytes.toString('base64') !== request.data) throw invalid('media chunk is not bounded canonical base64')
    if (upload.receivedBytes + bytes.length > upload.expectedBytes) throw invalid('media chunk exceeds the declared file size')
    const result = await upload.handle.write(bytes, 0, bytes.length, upload.receivedBytes)
    if (result.bytesWritten !== bytes.length) throw invalid('media chunk write was incomplete')
    upload.hash.update(bytes)
    upload.receivedBytes += bytes.length
    return Object.freeze({ receivedBytes: upload.receivedBytes, nextOffset: upload.receivedBytes })
  }

  /** Verify and atomically publish one imported MP4 or alpha PNG without altering its bytes. */
  async finishUpload(uploadId: string): Promise<VideoPackagingAsset> {
    const upload = this.requireUpload(uploadId)
    try {
      if (upload.receivedBytes !== upload.expectedBytes) throw invalid('media upload is incomplete')
      await upload.handle.sync()
      const sha256 = upload.hash.digest('hex')
      if (sha256 !== upload.expectedSha256) throw invalid('media upload SHA-256 does not match its declaration')
      const facts = upload.mediaType === 'video/mp4'
        ? await inspectMp4(upload.path, this.config.ffprobePath)
        : await inspectPng(upload.path, this.config.ffprobePath)
      const assetId = randomUUID()
      const extension = upload.mediaType === 'video/mp4' ? 'mp4' : 'png'
      const target = join(this.assetRoot, `${sha256}.${extension}`)
      await upload.handle.close()
      this.uploads.delete(upload.uploadId)
      try {
        await link(upload.path, target)
        await unlink(upload.path)
      } catch (error) {
        if (!isCode(error, 'EEXIST')) throw error
        const existingHash = await hashFile(target)
        if (existingHash !== sha256) throw invalid('content-addressed asset already exists with different bytes')
        await rm(upload.path, { force: true })
      }
      const asset: VideoPackagingAsset = Object.freeze({
        assetId,
        kind: upload.mediaType === 'video/mp4' ? 'source-video' : 'visual-png',
        name: upload.name,
        mediaType: upload.mediaType,
        bytes: upload.expectedBytes,
        sha256,
        width: facts.width,
        height: facts.height,
        duration: facts.duration,
        fps: facts.fps,
        hasAudio: facts.hasAudio,
        videoCodec: facts.videoCodec,
        audioCodec: facts.audioCodec,
        audioSampleRate: facts.audioSampleRate,
        audioChannels: facts.audioChannels,
        hasAlpha: facts.hasAlpha,
        status: this.config.allowTechnicalTestAssets ? 'technical-test' : 'pending-confirmation',
        createdAt: Date.now(),
      })
      await this.assets.put(assetId, asset)
      return asset
    } catch (error) {
      await this.abortUpload(upload.uploadId)
      throw error
    }
  }

  /** Discard only one incomplete staging file owned by this Host. */
  async abortUpload(uploadId: string): Promise<void> {
    const upload = this.uploads.get(uploadId)
    if (upload === undefined) return
    this.uploads.delete(uploadId)
    await upload.handle.close().catch(() => {})
    await rm(upload.path, { force: true })
  }

  /** Return non-path asset metadata. */
  getAsset(assetId: string): VideoPackagingAsset | null {
    this.assertEnabled()
    return this.assets.get(UUID.parse(assetId)) ?? null
  }

  /** Read one bounded media range for authenticated download and playback. */
  async readAssetChunk(request: { readonly assetId: string; readonly offset: number; readonly maxBytes: number }): Promise<{ readonly asset: VideoPackagingAsset; readonly offset: number; readonly data: string; readonly eof: boolean }> {
    const asset = this.requireAsset(request.assetId)
    if (!Number.isSafeInteger(request.offset) || request.offset < 0 || request.offset >= asset.bytes) throw invalid('asset read offset is outside the file')
    const count = z.number().int().min(1).max(VideoPackagingStore.CHUNK_BYTES).parse(request.maxBytes)
    const path = this.assetPath(asset)
    const handle = await open(path, 'r')
    try {
      const size = Math.min(count, asset.bytes - request.offset)
      const buffer = Buffer.alloc(size)
      const { bytesRead } = await handle.read(buffer, 0, size, request.offset)
      if (bytesRead !== size) throw invalid('stored asset ended before its recorded size')
      return Object.freeze({ asset, offset: request.offset, data: buffer.toString('base64'), eof: request.offset + size === asset.bytes })
    } finally {
      await handle.close()
    }
  }

  /** Create one empty P5-07 project bound to a Host-managed source Asset ID. */
  async createProject(request: { readonly name: string; readonly sourceVideoAssetId: string }): Promise<VideoPackagingProject> {
    this.assertEnabled()
    if ([...this.projects.entries()].length >= this.config.maxProjects) throw invalid('Video Packaging project limit reached')
    const source = this.requireAsset(request.sourceVideoAssetId)
    if (source.mediaType !== 'video/mp4' || source.kind !== 'source-video') throw invalid('project source must be an imported MP4 asset')
    this.assertAssetUsable(source)
    const name = request.name.trim()
    if (!name || name.length > 120) throw invalid('project name is invalid')
    const now = Date.now()
    const projectId = randomUUID()
    const document: P5Document = {
      schemaVersion: 1,
      projectId,
      name,
      fps: source.fps ?? 30,
      width: source.width,
      height: source.height,
      video: {
        asset: 'source.mp4', width: source.width, height: source.height,
        duration: source.duration!, fps: source.fps ?? 30, codec: source.videoCodec ?? 'unknown', hasAudio: source.hasAudio,
        ...(source.hasAudio && source.audioCodec !== null && source.audioSampleRate !== null && source.audioChannels !== null
          ? { audio: { codec: source.audioCodec, sampleRate: source.audioSampleRate, channels: source.audioChannels } }
          : {}),
        importedAt: new Date(now).toISOString(),
      },
      components: [],
      mediaAssets: [],
    }
    const record: StoredVideoPackagingProject = Object.freeze({
      projectId, name, sourceVideoAssetId: source.assetId, revision: 1, document,
      createdAt: now, updatedAt: now,
    })
    await this.projects.put(projectId, record)
    return toProjectView(record)
  }

  /** Read one saved P5-07 project without revealing Host filesystem paths. */
  getProject(projectId: string): VideoPackagingProject | null {
    this.assertEnabled()
    const project = this.projects.get(UUID.parse(projectId))
    return project === undefined ? null : toProjectView(project)
  }

  /** List the imported source and project assets with their current metadata. */
  listProjectAssets(projectId: string): readonly VideoPackagingAsset[] {
    const project = this.requireProject(projectId)
    const ids = new Set([project.sourceVideoAssetId, ...project.document.mediaAssets.map(asset => asset.id)])
    return Object.freeze([...ids].map(id => this.requireAsset(id)))
  }

  /** Save a validated P5-07 document with compare-and-swap revision protection. */
  async saveProject(request: { readonly projectId: string; readonly expectedRevision: number; readonly document: JsonValue }): Promise<VideoPackagingProject> {
    const current = this.requireProject(request.projectId)
    if (!Number.isSafeInteger(request.expectedRevision) || request.expectedRevision !== current.revision) {
      throw new BusinessWorkbenchError('REVISION_CONFLICT', 'business-workbench: Video Packaging project revision changed', {
        currentRevision: current.revision,
        subjectId: current.projectId,
      })
    }
    const serialized = JSON.stringify(request.document)
    if (Buffer.byteLength(serialized, 'utf8') > 2 * 1024 * 1024) throw invalid('P5-07 project document exceeds 2 MiB')
    const document = parseProject(request.document)
    if (document.projectId !== current.projectId || document.name !== current.name) throw invalid('P5-07 identity does not match its Host project record')
    const source = this.requireAsset(current.sourceVideoAssetId)
    if (document.video.width !== source.width || document.video.height !== source.height || Math.abs(document.video.duration - source.duration!) > 0.02) {
      throw invalid('P5-07 source facts do not match the Host source Asset')
    }
    for (const ref of document.mediaAssets) {
      const asset = this.requireAsset(ref.id)
      this.assertAssetUsable(asset)
      if (asset.mediaType !== 'image/png' || asset.sha256 !== ref.sha256 || asset.bytes !== ref.bytes
        || asset.width !== ref.width || asset.height !== ref.height || !asset.hasAlpha) {
        throw invalid(`P5-07 asset metadata does not match Host Asset '${asset.assetId}'`)
      }
    }
    const updated: StoredVideoPackagingProject = Object.freeze({
      ...current,
      revision: current.revision + 1,
      document,
      updatedAt: Date.now(),
    })
    await this.projects.put(updated.projectId, updated)
    return toProjectView(updated)
  }

  /** Persist one render task and start it once; repeated requests never duplicate a running render. */
  async submitRender(projectId: string): Promise<VideoPackagingRenderTask> {
    this.assertEnabled()
    const project = this.requireProject(projectId)
    if (this.activeRenderIds.size >= 1) throw invalid('a Video Packaging render is already running')
    const now = Date.now()
    const task: VideoPackagingRenderTask = Object.freeze({
      renderTaskId: randomUUID(), projectId: project.projectId, status: 'queued',
      outputAssetId: null, errorCode: null, logTail: '', createdAt: now, updatedAt: now,
    })
    await this.renders.put(task.renderTaskId, task)
    this.activeRenderIds.add(task.renderTaskId)
    const promise = this.runRender(task, project).finally(() => {
      this.activeRenderIds.delete(task.renderTaskId)
      this.cancelledRenderIds.delete(task.renderTaskId)
      this.renderPromises.delete(task.renderTaskId)
      this.children.delete(task.renderTaskId)
    })
    this.renderPromises.set(task.renderTaskId, promise)
    return task
  }

  /** Read render status, including explicit interrupted state after Host restart. */
  getRenderTask(renderTaskId: string): VideoPackagingRenderTask | null {
    this.assertEnabled()
    return this.renders.get(UUID.parse(renderTaskId)) ?? null
  }

  /** Cancel one active child process without deleting its task or source assets. */
  async cancelRender(renderTaskId: string): Promise<VideoPackagingRenderTask> {
    const task = this.requireRender(renderTaskId)
    if (task.status !== 'running' && task.status !== 'queued') return task
    this.cancelledRenderIds.add(task.renderTaskId)
    this.children.get(task.renderTaskId)?.kill('SIGTERM')
    await this.renderPromises.get(task.renderTaskId)
    const settled = this.requireRender(task.renderTaskId)
    if (settled.status === 'running' || settled.status === 'queued') {
      const cancelled = Object.freeze({ ...settled, status: 'cancelled' as const, errorCode: 'CANCELLED', updatedAt: Date.now() })
      await this.renders.put(cancelled.renderTaskId, cancelled)
      return cancelled
    }
    return settled
  }

  /** Stop active render children during Host disposal and await durable task settlement. */
  async close(): Promise<void> {
    this.closed = true
    for (const upload of this.uploads.values()) await this.abortUpload(upload.uploadId)
    for (const child of this.children.values()) terminateChild(child)
    await Promise.all([...this.renderPromises.values()])
  }

  private async runRender(task: VideoPackagingRenderTask, project: StoredVideoPackagingProject): Promise<void> {
    const now = Date.now()
    let record: VideoPackagingRenderTask = Object.freeze({ ...task, status: 'running', updatedAt: now })
    await this.renders.put(record.renderTaskId, record)
    const temporary = join(this.renderRoot, `render-${record.renderTaskId}.partial.mp4`)
    try {
      const source = this.assetPath(this.requireAsset(project.sourceVideoAssetId))
      const args = buildP5RenderArgs(
        project.document as unknown as PackagingRenderProject,
        source,
        temporary,
        assetId => this.assetPath(this.requireAsset(assetId)),
        componentId => {
          const component = project.document.components.find(item => item.id === componentId)
          if (component === undefined || component.type === 'asset') throw invalid('P5 text overlay reference is invalid')
          return this.assetPath(this.requireAsset(component.overlayAssetId))
        },
        this.config.maxOutputBytes,
      )
      const result = await runFfmpeg(this.config.ffmpegPath, args, this.config.renderTimeoutMs, child => {
        this.children.set(record.renderTaskId, child)
      })
      this.children.delete(record.renderTaskId)
      const fileStat = await stat(temporary)
      if (fileStat.size <= 0 || fileStat.size > this.config.maxOutputBytes) throw invalid('rendered MP4 violates the output byte limit')
      const probe = await inspectMp4(temporary, this.config.ffprobePath)
      if (probe.width !== project.document.width || probe.height !== project.document.height) throw invalid('rendered MP4 dimensions differ from the P5 canvas')
      const sha256 = await hashFile(temporary)
      const assetId = randomUUID()
      const target = join(this.assetRoot, `${sha256}.mp4`)
      try {
        await rename(temporary, target)
      } catch (error) {
        if (!isCode(error, 'EEXIST')) throw error
        if (await hashFile(target) !== sha256) throw invalid('render output hash collision')
        await rm(temporary, { force: true })
      }
      const output: VideoPackagingAsset = Object.freeze({
        assetId, kind: 'render-output', name: `${project.name}.mp4`, mediaType: 'video/mp4',
        bytes: fileStat.size, sha256, width: probe.width, height: probe.height,
        duration: probe.duration, fps: probe.fps, hasAudio: probe.hasAudio,
        videoCodec: probe.videoCodec, audioCodec: probe.audioCodec,
        audioSampleRate: probe.audioSampleRate, audioChannels: probe.audioChannels,
        hasAlpha: false, status: this.config.allowTechnicalTestAssets ? 'technical-test' : 'pending-confirmation',
        createdAt: Date.now(),
      })
      await this.assets.put(assetId, output)
      record = Object.freeze({ ...record, status: 'completed', outputAssetId: assetId, logTail: result.logTail, updatedAt: Date.now() })
    } catch (error) {
      this.children.delete(record.renderTaskId)
      await rm(temporary, { force: true })
      const cancelled = this.cancelledRenderIds.has(record.renderTaskId)
      const interrupted = this.closed || error instanceof Error && error.name === 'AbortError'
      record = Object.freeze({
        ...record,
        status: cancelled ? 'cancelled' : interrupted ? 'interrupted' : 'failed',
        errorCode: cancelled ? 'CANCELLED' : interrupted ? 'HOST_STOPPED' : error instanceof RenderTimeoutError ? 'TIMEOUT' : 'RENDER_FAILED',
        logTail: error instanceof Error ? error.message.slice(-16_000) : 'render failed',
        updatedAt: Date.now(),
      })
    }
    await this.renders.put(record.renderTaskId, record)
  }

  private requireUpload(uploadId: string): UploadState {
    this.assertEnabled()
    const parsed = UUID.parse(uploadId)
    const upload = this.uploads.get(parsed)
    if (upload === undefined) throw notFound('active media upload')
    return upload
  }

  private requireAsset(assetId: string): VideoPackagingAsset {
    this.assertEnabled()
    const asset = this.assets.get(UUID.parse(assetId))
    if (asset === undefined) throw notFound('media Asset')
    return asset
  }

  private requireProject(projectId: string): StoredVideoPackagingProject {
    this.assertEnabled()
    const project = this.projects.get(UUID.parse(projectId))
    if (project === undefined) throw notFound('Video Packaging project')
    return project
  }

  private requireRender(renderTaskId: string): VideoPackagingRenderTask {
    this.assertEnabled()
    const task = this.renders.get(UUID.parse(renderTaskId))
    if (task === undefined) throw notFound('Video Packaging render task')
    return task
  }

  private assetPath(asset: VideoPackagingAsset): string {
    const extension = asset.mediaType === 'video/mp4' ? 'mp4' : 'png'
    const path = resolve(this.assetRoot, `${asset.sha256}.${extension}`)
    if (!isContained(this.assetRoot, path)) throw invalid('media asset path is outside the Host root')
    return path
  }

  private assertAssetUsable(asset: VideoPackagingAsset): void {
    if (asset.status === 'technical-test' && !this.config.allowTechnicalTestAssets) throw invalid('technical-test asset is unavailable in this Host profile')
  }

  private assertEnabled(): void {
    if (this.closed || !this.config.enabled) throw invalid('Host Video Packaging is disabled')
  }
}

function toProjectView(project: StoredVideoPackagingProject): VideoPackagingProject {
  return Object.freeze({ ...project, document: project.document as unknown as JsonValue })
}

interface UploadState {
  readonly uploadId: string
  readonly name: string
  readonly mediaType: 'video/mp4' | 'image/png'
  readonly expectedBytes: number
  readonly expectedSha256: string
  readonly path: string
  readonly handle: Awaited<ReturnType<typeof open>>
  readonly hash: ReturnType<typeof createHash>
  receivedBytes: number
  readonly startedAt: number
}

interface MediaFacts {
  readonly width: number
  readonly height: number
  readonly duration: number | null
  readonly fps: number | null
  readonly hasAudio: boolean
  readonly videoCodec: string | null
  readonly audioCodec: string | null
  readonly audioSampleRate: number | null
  readonly audioChannels: number | null
  readonly hasAlpha: boolean
}

interface ProbeResult {
  readonly streams?: readonly { readonly codec_type?: string; readonly codec_name?: string; readonly width?: number; readonly height?: number; readonly pix_fmt?: string; readonly avg_frame_rate?: string; readonly sample_rate?: string; readonly channels?: number }[]
  readonly format?: { readonly duration?: string }
}

class RenderTimeoutError extends Error {
  constructor() {
    super('FFmpeg render exceeded the configured execution timeout')
    this.name = 'RenderTimeoutError'
  }
}

function invalid(message: string): BusinessWorkbenchError {
  return new BusinessWorkbenchError('INVALID_OPERATION', `business-workbench: Video Packaging ${message}`)
}

function notFound(subject: string): BusinessWorkbenchError {
  return new BusinessWorkbenchError('NOT_FOUND', `business-workbench: Video Packaging ${subject} was not found`)
}

function isCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}

function isContained(root: string, child: string): boolean {
  const path = relative(root, child)
  return path === '' || path !== '..' && !path.startsWith(`..${sep}`) && !path.startsWith(sep)
}

function terminateChild(child: ReturnType<typeof spawn>): void {
  child.kill('SIGTERM')
  const killTimer = setTimeout(() => child.kill('SIGKILL'), 1500)
  killTimer.unref()
  child.once('close', () => clearTimeout(killTimer))
}

function safeDisplayName(name: string): string {
  if (typeof name !== 'string' || name.length > 240 || name.includes('\0')) throw invalid('display name is invalid')
  const base = name.replaceAll('\\', '/').split('/').at(-1)?.trim() ?? ''
  if (!base || base === '.' || base === '..') throw invalid('display name is invalid')
  return base.slice(0, 180)
}

function parseProject(value: unknown): P5Document {
  const parsed = p5DocumentSchema.safeParse(value)
  if (!parsed.success) throw invalid(`P5-07 project is invalid: ${parsed.error.issues.map(issue => issue.message).slice(0, 4).join('; ')}`)
  return parsed.data
}

function decodePngHeader(bytes: Buffer): { readonly width: number; readonly height: number; readonly hasAlpha: boolean } {
  if (bytes.length < 33 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw invalid('PNG signature is invalid')
  if (bytes.readUInt32BE(8) !== 13 || bytes.subarray(12, 16).toString('ascii') !== 'IHDR') throw invalid('PNG IHDR is invalid')
  const width = bytes.readUInt32BE(16)
  const height = bytes.readUInt32BE(20)
  const colorType = bytes[25]!
  if (!width || !height || width > 8192 || height > 8192 || width * height > 33_554_432) throw invalid('PNG dimensions exceed the supported limit')
  const hasTransparencyChunk = bytes.includes(Buffer.from('tRNS'))
  if (![4, 6].includes(colorType) && !hasTransparencyChunk) throw invalid('PNG has no alpha channel or transparency chunk')
  return { width, height, hasAlpha: true }
}

async function inspectPng(path: string, ffprobePath: string): Promise<MediaFacts> {
  const handle = await open(path, 'r')
  const bytes = Buffer.alloc(64)
  try {
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0)
    if (bytesRead < 33) throw invalid('PNG header is incomplete')
  } finally {
    await handle.close()
  }
  const header = decodePngHeader(bytes)
  await runBounded(ffprobePath, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height,pix_fmt', '-of', 'json', path], 10_000, 64 * 1024)
  return { ...header, duration: null, fps: null, hasAudio: false, videoCodec: 'png', audioCodec: null, audioSampleRate: null, audioChannels: null }
}

async function inspectMp4(path: string, ffprobePath: string): Promise<MediaFacts> {
  const handle = await open(path, 'r')
  const header = Buffer.alloc(16)
  try {
    const { bytesRead } = await handle.read(header, 0, header.length, 0)
    if (bytesRead < 12 || header.toString('ascii', 4, 8) !== 'ftyp') throw invalid('MP4 file signature is invalid')
  } finally {
    await handle.close()
  }
  const { stdout } = await runBounded(ffprobePath, [
    '-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height,avg_frame_rate,sample_rate,channels', '-of', 'json', path,
  ], 10_000, 128 * 1024)
  let probe: ProbeResult
  try {
    probe = JSON.parse(stdout) as ProbeResult
  } catch {
    throw invalid('ffprobe did not return valid MP4 metadata')
  }
  const video = probe.streams?.find(stream => stream.codec_type === 'video')
  const duration = Number(probe.format?.duration)
  const width = video?.width ?? 0
  const height = video?.height ?? 0
  const fps = parseRatio(video?.avg_frame_rate)
  if (!width || !height || width > 8192 || height > 8192 || width * height > 33_554_432) throw invalid('MP4 dimensions are outside supported limits')
  if (!Number.isFinite(duration) || duration <= 0 || duration > 3600) throw invalid('MP4 duration is outside supported limits')
  if (fps === null || fps < 1 || fps > 60) throw invalid('MP4 frame rate is outside supported limits')
  const audio = probe.streams?.find(stream => stream.codec_type === 'audio')
  return {
    width, height, duration, fps,
    hasAudio: audio !== undefined,
    videoCodec: video?.codec_name ?? null,
    audioCodec: audio?.codec_name ?? null,
    audioSampleRate: audio?.sample_rate === undefined ? null : Number(audio.sample_rate),
    audioChannels: audio?.channels ?? null,
    hasAlpha: false,
  }
}

function parseRatio(value: string | undefined): number | null {
  if (value === undefined) return null
  const [numerator, denominator] = value.split('/').map(Number)
  const ratio = denominator === undefined ? Number(value) : numerator! / denominator
  return Number.isFinite(ratio) && ratio > 0 ? ratio : null
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

async function runBounded(command: string, args: readonly string[], timeoutMs: number, maxOutputBytes: number): Promise<{ readonly stdout: string; readonly stderr: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, [...args], { shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let outputBytes = 0
    let settled = false
    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      finish(new RenderTimeoutError())
    }, timeoutMs)
    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (error !== undefined) rejectPromise(error)
    }
    child.stdout.on('data', (chunk: Buffer) => {
      outputBytes += chunk.byteLength
      if (outputBytes > maxOutputBytes) {
        child.kill('SIGTERM')
        finish(invalid('media probe output exceeded its byte limit'))
      } else stdout.push(chunk)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      outputBytes += chunk.byteLength
      if (outputBytes > maxOutputBytes) {
        child.kill('SIGTERM')
        finish(invalid('media probe output exceeded its byte limit'))
      } else stderr.push(chunk)
    })
    child.once('error', error => finish(error))
    child.once('close', code => {
      if (settled) return
      clearTimeout(timeout)
      settled = true
      if (code !== 0) rejectPromise(new Error(Buffer.concat(stderr).toString('utf8').slice(-4000) || `${command} exited ${String(code)}`))
      else resolvePromise({ stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') })
    })
  })
}

async function runFfmpeg(
  command: string,
  args: readonly string[],
  timeoutMs: number,
  onChild: (child: ReturnType<typeof spawn>) => void,
): Promise<{ readonly logTail: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, [...args], { shell: false, stdio: ['ignore', 'ignore', 'pipe'] })
    onChild(child)
    let logTail = ''
    let settled = false
    let timeoutError: RenderTimeoutError | undefined
    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      const killTimer = setTimeout(() => child.kill('SIGKILL'), 1500)
      killTimer.unref()
      timeoutError = new RenderTimeoutError()
      child.once('close', () => clearTimeout(killTimer))
    }, timeoutMs)
    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (error !== undefined) rejectPromise(error)
    }
    child.stderr.on('data', (chunk: Buffer) => {
      logTail = `${logTail}${chunk.toString('utf8')}`.slice(-16_000)
    })
    child.once('error', error => finish(error))
    child.once('close', code => {
      if (settled) return
      clearTimeout(timeout)
      settled = true
      if (timeoutError !== undefined) rejectPromise(timeoutError)
      else if (code !== 0) rejectPromise(new Error(logTail.slice(-4000) || `FFmpeg exited ${String(code)}`))
      else resolvePromise({ logTail })
    })
  })
}
