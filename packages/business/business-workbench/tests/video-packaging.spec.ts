import { createHash } from 'node:crypto'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { JsonValue } from '@deepseek-ai/dsh-session/types'
import { setupHarness } from './helpers.ts'
import type { VideoPackagingConfig } from '../src/video-packaging.ts'

const fakeProbeResult = JSON.stringify({
  streams: [
    { codec_type: 'video', codec_name: 'h264', width: 320, height: 180, avg_frame_rate: '24/1' },
    { codec_type: 'audio', codec_name: 'aac', sample_rate: '48000', channels: 1 },
  ],
  format: { duration: '6.0' },
})

describe('BusinessWorkbench Video Packaging Host service', () => {
  it('imports bounded assets, saves a P5 project, renders once, and recovers records after Host reload', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-video-packaging-'))
    const ffmpeg = join(root, 'ffmpeg-fixture.mjs')
    const ffprobe = join(root, 'ffprobe-fixture.mjs')
    await writeFile(ffmpeg, '#!/usr/bin/env node\nimport { writeFileSync } from \'node:fs\'\nwriteFileSync(process.argv.at(-1), Buffer.from(\'0000ftypS2-test\'))\n')
    await writeFile(ffprobe, `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(fakeProbeResult)})\n`)
    await chmod(ffmpeg, 0o700)
    await chmod(ffprobe, 0o700)
    const config: VideoPackagingConfig = {
      enabled: true,
      allowTechnicalTestAssets: true,
      maxVideoBytes: 1024 * 1024,
      maxPngBytes: 1024 * 1024,
      maxOutputBytes: 1024 * 1024,
      maxProjects: 5,
      renderTimeoutMs: 10_000,
      ffmpegPath: ffmpeg,
      ffprobePath: ffprobe,
    }
    let fixture = await setupHarness(root, 60_000, undefined, undefined, config)
    try {
      const video = Buffer.alloc(24)
      video.write('ftyp', 4, 'ascii')
      const videoHash = createHash('sha256').update(video).digest('hex')
      const videoUpload = await fixture.ctx.businessWorkbench.beginVideoPackagingUpload({
        name: 'source.mp4', mediaType: 'video/mp4', bytes: video.length, sha256: videoHash,
      })
      await fixture.ctx.businessWorkbench.appendVideoPackagingUploadChunk({
        uploadId: videoUpload.uploadId, offset: 0, data: video.toString('base64'),
      })
      const sourceAsset = await fixture.ctx.businessWorkbench.finishVideoPackagingUpload(videoUpload.uploadId)
      expect(sourceAsset).toMatchObject({ width: 320, height: 180, duration: 6, fps: 24, hasAudio: true, status: 'technical-test' })

      const png = Buffer.alloc(33)
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png)
      png.writeUInt32BE(13, 8)
      png.write('IHDR', 12, 'ascii')
      png.writeUInt32BE(64, 16)
      png.writeUInt32BE(64, 20)
      png[24] = 8
      png[25] = 6
      const pngHash = createHash('sha256').update(png).digest('hex')
      const pngUpload = await fixture.ctx.businessWorkbench.beginVideoPackagingUpload({
        name: 'overlay.png', mediaType: 'image/png', bytes: png.length, sha256: pngHash,
      })
      await fixture.ctx.businessWorkbench.appendVideoPackagingUploadChunk({
        uploadId: pngUpload.uploadId, offset: 0, data: png.toString('base64'),
      })
      const overlayAsset = await fixture.ctx.businessWorkbench.finishVideoPackagingUpload(pngUpload.uploadId)
      expect(overlayAsset).toMatchObject({ width: 64, height: 64, hasAlpha: true, status: 'technical-test' })

      const created = await fixture.ctx.businessWorkbench.createVideoPackagingProject({
        name: 'Host project recovery', sourceVideoAssetId: sourceAsset.assetId,
      })
      const document = structuredClone(created.document) as { [key: string]: JsonValue }
      const mediaAssets = document.mediaAssets as JsonValue[]
      mediaAssets.push({
        id: overlayAsset.assetId, storage: 'library', originalName: overlayAsset.name, mimeType: 'image/png',
        relativePath: `media/${overlayAsset.assetId}.png`, width: overlayAsset.width, height: overlayAsset.height,
        duration: null, hasAlpha: true, bytes: overlayAsset.bytes, sha256: overlayAsset.sha256,
      })
      const components = document.components as JsonValue[]
      components.push({
        id: '0c1375ed-b206-4077-8552-129099fe05c2', type: 'asset', assetId: overlayAsset.assetId,
        x: 20, y: 20, width: 64, height: 64, start: 1, duration: 2, layer: 1,
        opacity: 0.7, hidden: false, animation: 'none',
      })
      const saved = await fixture.ctx.businessWorkbench.saveVideoPackagingProject({
        projectId: created.projectId, expectedRevision: created.revision, document,
      })
      expect(saved.revision).toBe(2)

      const task = await fixture.ctx.businessWorkbench.submitVideoPackagingRender(saved.projectId)
      let settled = task
      const deadline = Date.now() + 10_000
      while (settled.status === 'queued' || settled.status === 'running') {
        if (Date.now() >= deadline) throw new Error('fixture render timed out')
        await new Promise(resolve => setTimeout(resolve, 10))
        settled = fixture.ctx.businessWorkbench.readVideoPackagingRender(task.renderTaskId)!
      }
      expect(settled).toMatchObject({ status: 'completed', outputAssetId: expect.any(String) })

      await fixture.dispose(false)
      fixture = await setupHarness(root, 60_000, undefined, undefined, config)
      const restored = fixture.ctx.businessWorkbench.readVideoPackagingProject(saved.projectId)
      expect(restored?.revision).toBe(2)
      expect(fixture.ctx.businessWorkbench.listVideoPackagingProjectAssets(saved.projectId)).toHaveLength(2)
      expect(fixture.ctx.businessWorkbench.readVideoPackagingRender(task.renderTaskId)).toMatchObject({
        status: 'completed', outputAssetId: settled.outputAssetId,
      })
      const outputAsset = fixture.ctx.businessWorkbench.readVideoPackagingAsset(settled.outputAssetId!)
      expect(outputAsset).toMatchObject({ kind: 'render-output', hasAudio: true, videoCodec: 'h264', audioCodec: 'aac' })
    } finally {
      await fixture.dispose(false)
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects a wrong MP4 digest before publishing an asset', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-video-packaging-invalid-'))
    const ffmpeg = join(root, 'ffmpeg-unused.mjs')
    const ffprobe = join(root, 'ffprobe-unused.mjs')
    await writeFile(ffmpeg, '#!/usr/bin/env node\n')
    await writeFile(ffprobe, '#!/usr/bin/env node\n')
    await chmod(ffmpeg, 0o700)
    await chmod(ffprobe, 0o700)
    const config: VideoPackagingConfig = {
      enabled: true, allowTechnicalTestAssets: true, maxVideoBytes: 1024, maxPngBytes: 1024,
      maxOutputBytes: 1024, maxProjects: 5, renderTimeoutMs: 10_000, ffmpegPath: ffmpeg, ffprobePath: ffprobe,
    }
    const fixture = await setupHarness(root, 60_000, undefined, undefined, config)
    try {
      const video = Buffer.alloc(16)
      video.write('ftyp', 4, 'ascii')
      const upload = await fixture.ctx.businessWorkbench.beginVideoPackagingUpload({
        name: 'bad.mp4', mediaType: 'video/mp4', bytes: video.length, sha256: 'a'.repeat(64),
      })
      await fixture.ctx.businessWorkbench.appendVideoPackagingUploadChunk({ uploadId: upload.uploadId, offset: 0, data: video.toString('base64') })
      await expect(fixture.ctx.businessWorkbench.finishVideoPackagingUpload(upload.uploadId)).rejects.toMatchObject({ code: 'INVALID_OPERATION' })
      expect(fixture.ctx.businessWorkbench.readVideoPackagingAsset(upload.uploadId)).toBeNull()
    } finally {
      await fixture.dispose(false)
      await rm(root, { recursive: true, force: true })
    }
  })
})
