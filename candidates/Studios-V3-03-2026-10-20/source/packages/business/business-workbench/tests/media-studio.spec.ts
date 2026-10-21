import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { setupHarness } from './helpers.ts'

describe('BusinessWorkbench media Studio persistence', () => {
  it('splits image output into bounded Mock tasks and preserves artifact revisions across reopen', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-media-studio-'))
    let fixture = await setupHarness(root)
    try {
      const service = fixture.ctx.businessWorkbench
      const imageModel = service.listMediaStudioModels('image').find(model => model.modelId === 'alibaba-qwen-image')!
      const first = await service.createMediaStudioTurn({
        modality: 'image', modelId: imageModel.modelId, prompt: 'abstract sea at dusk',
        params: { ...imageModel.parameterDefaults, outputCount: 6 }, requestedOutputCount: 10,
      })
      expect(first.turns).toHaveLength(1)
      expect(first.turns[0]?.taskIds).toHaveLength(2)
      expect(first.tasks.map(task => task.paramsSnapshot.outputCount)).toEqual([6, 4])
      expect(first.artifacts).toHaveLength(10)
      expect(first.tasks.every(task => task.mock && task.providerNetworkRequests === 0)).toBe(true)
      expect(new Set(first.artifacts.map(artifact => artifact.artifactId)).size).toBe(10)

      const original = first.artifacts[0]!
      const second = await service.createMediaStudioTurn({
        modality: 'image', modelId: imageModel.modelId, prompt: 'adjust the color temperature',
        params: imageModel.parameterDefaults, sessionId: first.session.sessionId,
        parentArtifactId: original.artifactId, modificationIntent: 'make the dusk tones warmer',
      })
      expect(second.turns).toHaveLength(2)
      expect(second.artifacts.find(artifact => artifact.turnId === second.turns[1]?.turnId)).toMatchObject({
        parentArtifactId: original.artifactId, revisionDepth: 1, mock: true,
      })
      expect(second.revisions).toHaveLength(1)
      expect(second.artifacts.find(artifact => artifact.artifactId === original.artifactId)).toEqual(original)

      const videoModel = service.listMediaStudioModels('video').find(model => model.modelId === 'minimax-h3')!
      const video = await service.createMediaStudioTurn({
        modality: 'video', modelId: videoModel.modelId, prompt: 'slow push through a pine forest',
        params: videoModel.parameterDefaults,
      })
      const pendingTask = video.tasks.at(-1)!
      expect(pendingTask.status).toBe('queued')
      fixture = await reopen(fixture, root)
      const recoveredVideo = serviceOf(fixture).readMediaStudioSession(video.session.sessionId)!
      expect(recoveredVideo.tasks.at(-1)).toMatchObject({ taskId: pendingTask.taskId, status: 'queued', mock: true })
      expect((await serviceOf(fixture).pollMediaStudioTask(pendingTask.taskId)).status).toBe('processing')
      expect((await serviceOf(fixture).pollMediaStudioTask(pendingTask.taskId)).status).toBe('completed')

      fixture = await reopen(fixture, root)
      const recoveredImage = serviceOf(fixture).readMediaStudioSession(first.session.sessionId)!
      expect(recoveredImage.turns).toHaveLength(2)
      expect(recoveredImage.artifacts).toHaveLength(11)
      expect(recoveredImage.revisions[0]?.parentArtifactId).toBe(original.artifactId)
      expect(serviceOf(fixture).listMediaStudioSessions('image')).toHaveLength(1)
      expect(serviceOf(fixture).listMediaStudioSessions('video')).toHaveLength(1)
    } finally {
      await fixture.dispose(false)
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects unsupported controls and cross-modality session/artifact references', async () => {
    const fixture = await setupHarness()
    try {
      const service = fixture.ctx.businessWorkbench
      const model = service.listMediaStudioModels('image')[0]!
      const saved = await service.createMediaStudioTurn({ modality: 'image', modelId: model.modelId, prompt: 'one', params: model.parameterDefaults })
      await expect(service.createMediaStudioTurn({
        modality: 'image', modelId: model.modelId, prompt: 'two', params: { inventedControl: 'yes' },
        sessionId: saved.session.sessionId,
      })).rejects.toMatchObject({ code: 'INVALID_OPERATION' })
      await expect(service.createMediaStudioTurn({
        modality: 'video', modelId: 'minimax-h3', prompt: 'three', params: {},
        sessionId: saved.session.sessionId,
      })).rejects.toMatchObject({ code: 'INVALID_OPERATION' })
      expect(service.readMediaStudioSession('unknown')).toBeNull()
    } finally {
      await fixture.dispose()
    }
  })
})

function serviceOf(fixture: Awaited<ReturnType<typeof setupHarness>>) {
  return fixture.ctx.businessWorkbench
}

async function reopen(
  fixture: Awaited<ReturnType<typeof setupHarness>>,
  root: string,
): Promise<Awaited<ReturnType<typeof setupHarness>>> {
  await fixture.dispose(false)
  return setupHarness(root)
}
