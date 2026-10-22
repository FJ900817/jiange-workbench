import { describe, expect, it } from 'vitest'
import { createShotcraftRenderJob, isShotcraftComponent } from '../src/video-packaging-shotcraft.ts'

describe('shotcraft 渲染触发', () => {
  it('识别 shotcraft 组件引用', () => {
    expect(isShotcraftComponent({ libraryRef: { lib: 'shotcraft', componentId: 'typography/blur-slide' } })).toBe(true)
    expect(isShotcraftComponent({ libraryRef: { lib: 'talkcraft', componentId: 'tag' } })).toBe(false)
    expect(isShotcraftComponent({})).toBe(false)
    expect(isShotcraftComponent({ libraryRef: null })).toBe(false)
    expect(isShotcraftComponent({ libraryRef: 'shotcraft' })).toBe(false)
  })

  it('合法引用生成渲染任务（具名 export + 默认 props 导出名）', () => {
    const job = createShotcraftRenderJob(
      {
        lib: 'shotcraft',
        componentId: 'typography/blur-slide',
        params: { title1: '你好', title2: '世界' },
      },
      { width: 1920, height: 1080, fps: 30, stillSec: 2 },
    )
    expect(job.componentId).toBe('typography/blur-slide')
    expect(job.cardFile.endsWith('shotcraft-cards/typography/blur-slide.tsx')).toBe(true)
    expect(job.exportName).toBe('BlurSlide')
    expect(job.defaultsExport).toBe('BLUR_SLIDE_DEFAULTS')
    expect(job.durationExport).toBe('BLUR_SLIDE_DURATION')
    expect(job.props).toMatchObject({ title1: '你好', title2: '世界' })
    expect(job.width).toBe(1920)
    expect(job.height).toBe(1080)
    expect(job.fps).toBe(30)
    // stillSec=2, fps=30 → 第 60 帧（上界由渲染器按卡片真实总帧数钳制）
    expect(job.frame).toBe(60)
  })

  it('特例卡：文件名与组件名不一致时仍解析正确', () => {
    const job = createShotcraftRenderJob(
      { lib: 'shotcraft', componentId: 'typography/typewriter-moves', params: {} },
      { width: 1920, height: 1080 },
    )
    expect(job.exportName).toBe('TypewriterErrorRetype')
    expect(job.durationExport).toBe('TYPEWRITER_ERROR_RETYPE_DURATION')
  })

  it('非 shotcraft 引用中文报错', () => {
    expect(() =>
      createShotcraftRenderJob(
        { lib: 'aikou', componentId: 'tag', params: {} } as unknown as {
          lib: 'shotcraft'
          componentId?: string
          params?: Record<string, unknown>
        },
        { width: 1920, height: 1080 },
      ),
    ).toThrow(/shotcraft/)
  })

  it('未知组件 ID 抛中文错', () => {
    expect(() =>
      createShotcraftRenderJob({ lib: 'shotcraft', componentId: 'no/such-card', params: {} }, { width: 1920, height: 1080 }),
    ).toThrow(/不受支持/)
  })

  it('非法画布尺寸/帧率抛中文错', () => {
    const ref = { lib: 'shotcraft' as const, componentId: 'typography/blur-slide', params: {} }
    expect(() => createShotcraftRenderJob(ref, { width: 0, height: 1080 })).toThrow(/宽度/)
    expect(() => createShotcraftRenderJob(ref, { width: 1920, height: 1080, fps: 0 })).toThrow(/帧率/)
  })
})
