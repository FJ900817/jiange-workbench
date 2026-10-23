import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  ComponentPreviewCache,
  clearPreviewCache,
  previewCacheKey,
  previewComponentPng,
  renderComponentPreview,
} from '../src/video-packaging-preview.ts'
import type {
  PreviewVideoPackagingComponentRequest,
  PreviewVideoPackagingComponentResult,
} from '../src/types.ts'

/**
 * 最小 PNG 解码器（测试自带：只读 8-bit 非交错真彩/真彩+Alpha）。
 * 不引入 sharp 等新依赖；生产代码不经过这里。
 */
function decodePng(png: Buffer): { width: number; height: number; pixels: Buffer } {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  expect(png.subarray(0, 8).equals(signature)).toBe(true)
  let offset = 8
  let width = 0
  let height = 0
  let colorType = -1
  let bitDepth = -1
  const idat: Buffer[] = []
  for (;;) {
    const length = png.readUInt32BE(offset)
    const type = png.toString('ascii', offset + 4, offset + 8)
    const data = png.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data.readUInt8(8)
      colorType = data.readUInt8(9)
      expect(data.readUInt8(12)).toBe(0)
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
    offset += 12 + length
  }
  expect(bitDepth).toBe(8)
  expect([2, 6]).toContain(colorType)
  const channels = colorType === 6 ? 4 : 3
  const raw = inflateSync(Buffer.concat(idat))
  const pixels = Buffer.alloc(width * height * 4)
  const px = (x: number, y: number, c: number): number => pixels.readUInt8((y * width + x) * 4 + c)
  let cursor = 0
  for (let y = 0; y < height; y++) {
    const filter = raw.readUInt8(cursor++)
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < channels; c++) {
        const a = x > 0 ? px(x - 1, y, c) : 0
        const b = y > 0 ? px(x, y - 1, c) : 0
        const d = x > 0 && y > 0 ? px(x - 1, y - 1, c) : 0
        let value = raw.readUInt8(cursor++)
        if (filter === 1) value = (value + a) & 255
        else if (filter === 2) value = (value + b) & 255
        else if (filter === 3) value = (value + ((a + b) >> 1)) & 255
        else if (filter === 4) {
          const p = a + b - d
          const pa = Math.abs(p - a)
          const pb = Math.abs(p - b)
          const pc = Math.abs(p - d)
          value = (value + (pa <= pb && pa <= pc ? a : pb <= pc ? b : d)) & 255
        }
        pixels[(y * width + x) * 4 + c] = value
      }
      if (channels === 3) pixels[(y * width + x) * 4 + 3] = 255
    }
  }
  return { width, height, pixels }
}

function cornerAlphas(png: Buffer): [number, number, number, number] {
  const { width, height, pixels } = decodePng(png)
  const at = (x: number, y: number): number => pixels.readUInt8((y * width + x) * 4 + 3)
  return [at(0, 0), at(width - 1, 0), at(0, height - 1), at(width - 1, height - 1)]
}

function pngBuffer(result: PreviewVideoPackagingComponentResult): Buffer {
  const png = Buffer.from(result.data, 'base64')
  expect(png.length).toBeGreaterThan(0)
  return png
}

const AIKOU_REQUEST: PreviewVideoPackagingComponentRequest = {
  libraryRef: { lib: 'aikou', componentId: 'tag', params: { label: 'AI 视频包装实测', x: 40, y: 300, icon: 'bolt' } },
  width: 1280,
  height: 720,
  stillSec: 2,
}

const TALKCRAFT_REQUEST: PreviewVideoPackagingComponentRequest = {
  libraryRef: { lib: 'talkcraft', componentId: 'title-demote-to-label', params: { title: 'M3 预览验证' } },
  width: 1280,
  height: 720,
  darkScene: false,
  stillSec: 2,
}

const SHOTCRAFT_REQUEST: PreviewVideoPackagingComponentRequest = {
  libraryRef: { lib: 'shotcraft', componentId: 'typography/blur-slide', params: { title1: '让每一次发布', title2: '都 *充满电影感*', kicker: 'M3 验证' } },
  width: 1280,
  height: 720,
  stillSec: 2,
}

describe('组件预览（M3 面板真实预览）', () => {
  it('aikou 真实预览：PNG 非空、四角透明、整画布尺寸', { timeout: 120_000 }, async () => {
    clearPreviewCache()
    const result = await renderComponentPreview(AIKOU_REQUEST)
    expect(result).not.toBeNull()
    const png = pngBuffer(result as PreviewVideoPackagingComponentResult)
    const { width, height } = decodePng(png)
    expect(width).toBe(1280)
    expect(height).toBe(720)
    expect(cornerAlphas(png)).toEqual([0, 0, 0, 0])
    expect((result as PreviewVideoPackagingComponentResult).fullCanvas).toBe(true)
  })

  it('talkcraft 真实预览：PNG 非空、四角透明、卡片尺寸', { timeout: 120_000 }, async () => {
    clearPreviewCache()
    const result = await renderComponentPreview(TALKCRAFT_REQUEST)
    expect(result).not.toBeNull()
    const png = pngBuffer(result as PreviewVideoPackagingComponentResult)
    const { width, height } = decodePng(png)
    expect(width).toBeGreaterThan(0)
    expect(height).toBeGreaterThan(0)
    expect(cornerAlphas(png)).toEqual([0, 0, 0, 0])
    expect((result as PreviewVideoPackagingComponentResult).fullCanvas).toBe(false)
  })

  it('shotcraft 真实预览：PNG 非空、四角透明、整画布尺寸', { timeout: 120_000 }, async () => {
    clearPreviewCache()
    const result = await renderComponentPreview(SHOTCRAFT_REQUEST)
    expect(result).not.toBeNull()
    const png = pngBuffer(result as PreviewVideoPackagingComponentResult)
    const { width, height } = decodePng(png)
    expect(width).toBe(1280)
    expect(height).toBe(720)
    expect(cornerAlphas(png)).toEqual([0, 0, 0, 0])
    expect((result as PreviewVideoPackagingComponentResult).fullCanvas).toBe(true)
  })

  it('坏引用返回 null 而不是抛错', async () => {
    await expect(
      renderComponentPreview({ libraryRef: { lib: 'aikou', componentId: 'no-such-component', params: {} }, width: 1280, height: 720 }),
    ).resolves.toBeNull()
    await expect(
      renderComponentPreview({ libraryRef: { lib: 'not-a-library', componentId: 'tag', params: {} }, width: 1280, height: 720 }),
    ).resolves.toBeNull()
    await expect(
      renderComponentPreview({ libraryRef: { lib: 'aikou', params: {} }, width: 1280, height: 720 }),
    ).resolves.toBeNull()
  })

  it('非法尺寸返回 null 而不是抛错', async () => {
    await expect(renderComponentPreview({ ...AIKOU_REQUEST, width: 0 })).resolves.toBeNull()
    await expect(renderComponentPreview({ ...AIKOU_REQUEST, height: -1 })).resolves.toBeNull()
  })

  it('缓存命中：同一请求只渲染一次', async () => {
    const cache = new ComponentPreviewCache(200)
    let calls = 0
    const fake = async (): Promise<PreviewVideoPackagingComponentResult | null> => {
      calls++
      return { data: Buffer.from('png').toString('base64'), width: 1280, height: 720, fullCanvas: true }
    }
    const first = await previewComponentPng(AIKOU_REQUEST, { cache, render: fake })
    const second = await previewComponentPng(AIKOU_REQUEST, { cache, render: fake })
    expect(calls).toBe(1)
    expect(second).toBe(first)
    expect(cache.size).toBe(1)
  })

  it('缓存 key 与 params 键序无关', () => {
    const reordered: PreviewVideoPackagingComponentRequest = {
      ...AIKOU_REQUEST,
      libraryRef: {
        lib: 'aikou',
        componentId: 'tag',
        params: { icon: 'bolt', x: 40, label: 'AI 视频包装实测', y: 300 },
      },
    }
    expect(previewCacheKey(reordered)).toBe(previewCacheKey(AIKOU_REQUEST))
  })

  it('LRU 淘汰最旧条目', async () => {
    const cache = new ComponentPreviewCache(2)
    let calls = 0
    const fake = async (): Promise<PreviewVideoPackagingComponentResult | null> => {
      calls++
      return { data: Buffer.from(`png-${calls}`).toString('base64'), width: 1280, height: 720, fullCanvas: true }
    }
    const keyOf = (componentId: string): PreviewVideoPackagingComponentRequest => ({
      ...AIKOU_REQUEST,
      libraryRef: { lib: 'aikou', componentId, params: {} },
    })
    await previewComponentPng(keyOf('a'), { cache, render: fake })
    await previewComponentPng(keyOf('b'), { cache, render: fake })
    await previewComponentPng(keyOf('c'), { cache, render: fake })
    expect(cache.size).toBe(2)
    expect(calls).toBe(3)
    await previewComponentPng(keyOf('a'), { cache, render: fake })
    expect(calls).toBe(4)
    await previewComponentPng(keyOf('c'), { cache, render: fake })
    expect(calls).toBe(4)
  })

  it('渲染返回 null 时不进缓存', async () => {
    const cache = new ComponentPreviewCache(200)
    let calls = 0
    const fake = async (): Promise<PreviewVideoPackagingComponentResult | null> => {
      calls++
      return null
    }
    await previewComponentPng(AIKOU_REQUEST, { cache, render: fake })
    await previewComponentPng(AIKOU_REQUEST, { cache, render: fake })
    expect(calls).toBe(2)
    expect(cache.size).toBe(0)
  })
})
