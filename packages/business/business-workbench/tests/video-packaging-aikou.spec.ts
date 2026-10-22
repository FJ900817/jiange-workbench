import { describe, expect, it } from 'vitest'
import { createAikouRenderJob, isAikouComponent } from '../src/video-packaging-aikou.ts'

describe('aikou 渲染触发', () => {
  it('识别 aikou 组件引用', () => {
    expect(isAikouComponent({ libraryRef: { lib: 'aikou', componentId: 'tag' } })).toBe(true)
    expect(isAikouComponent({ libraryRef: { lib: 'talkcraft', componentId: 'tag' } })).toBe(false)
    expect(isAikouComponent({})).toBe(false)
    expect(isAikouComponent({ libraryRef: null })).toBe(false)
    expect(isAikouComponent({ libraryRef: 'aikou' })).toBe(false)
  })

  it('合法引用生成渲染任务（整幅画布尺寸透传）', () => {
    const job = createAikouRenderJob(
      {
        lib: 'aikou',
        componentId: 'tag',
        params: { label: 'AI 系统越来越失控', en: 'TOPIC', icon: 'bolt', x: 40, y: 300 },
      },
      { width: 1920, height: 1080, timeSec: 1.5 },
    )
    expect(job.componentId).toBe('tag')
    expect(job.moduleFile.endsWith('aikou-components.js')).toBe(true)
    expect(job.width).toBe(1920)
    expect(job.height).toBe(1080)
    expect(job.timeSec).toBe(1.5)
    expect(JSON.parse(job.refJson)).toMatchObject({ lib: 'aikou', componentId: 'tag' })
  })

  it('非 aikou 引用中文报错', () => {
    expect(() =>
      createAikouRenderJob(
        { lib: 'talkcraft', componentId: 'tag', params: {} } as unknown as {
          lib: 'aikou'
          componentId?: string
          params?: Record<string, unknown>
        },
        { width: 1920, height: 1080 },
      ),
    ).toThrow(/aikou/)
  })

  it('未知组件 ID 抛中文错', () => {
    expect(() =>
      createAikouRenderJob({ lib: 'aikou', componentId: 'no-such-thing', params: {} }, { width: 1920, height: 1080 }),
    ).toThrow(/不受支持/)
  })

  it('缺少必填参数抛中文错（tag 要 label）', () => {
    expect(() =>
      createAikouRenderJob(
        { lib: 'aikou', componentId: 'tag', params: { x: 40, y: 300 } },
        { width: 1920, height: 1080 },
      ),
    ).toThrow(/缺少必填参数.*label/)
  })

  it('非法画布尺寸/时间抛中文错', () => {
    const ref = {
      lib: 'aikou' as const,
      componentId: 'tag',
      params: { label: 'x', x: 40, y: 300 },
    }
    expect(() => createAikouRenderJob(ref, { width: 0, height: 1080 })).toThrow(/宽度/)
    expect(() => createAikouRenderJob(ref, { width: 1920, height: -1 })).toThrow(/高度/)
    expect(() => createAikouRenderJob(ref, { width: 1920, height: 1080, timeSec: -0.5 })).toThrow(/时间/)
  })
})
