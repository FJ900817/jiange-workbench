import { describe, expect, it } from 'vitest'
import { createTalkcraftRenderJob, isTalkcraftComponent } from '../src/video-packaging-talkcraft.ts'

describe('talkcraft 渲染触发（P1 接线）', () => {
  it('识别 talkcraft 组件引用', () => {
    expect(isTalkcraftComponent({ libraryRef: { lib: 'talkcraft', componentId: 'tag' } })).toBe(true)
    expect(isTalkcraftComponent({ libraryRef: { lib: 'aikou', componentId: 'tag' } })).toBe(false)
    expect(isTalkcraftComponent({})).toBe(false)
    expect(isTalkcraftComponent({ libraryRef: null })).toBe(false)
    expect(isTalkcraftComponent({ libraryRef: 'talkcraft' })).toBe(false)
  })

  it('叠加模式解析到透明改编版绝对路径', () => {
    const job = createTalkcraftRenderJob(
      { lib: 'talkcraft', componentId: 'title-demote-to-label', params: { title: ['第一行', '第二行'] } },
      { mode: 'overlay', darkScene: false, stillSec: 2 },
    )
    expect(job.mode).toBe('overlay')
    expect(job.componentId).toBe('title-demote-to-label')
    expect(job.cardFile.endsWith('talkcraft-cards/title-demote-to-label.tsx')).toBe(true)
    expect(job.theme).toBe('light')
    expect(job.props).toMatchObject({ title: ['第一行', '第二行'] })
    expect(job.width).toBe(960)
    expect(job.height).toBe(540)
    // stillSec=2, fps=30 → 第 60 帧
    expect(job.frame).toBe(60)
  })

  it('暗场景下带 theme 的卡默认 dark 并注入 props', () => {
    const job = createTalkcraftRenderJob(
      { lib: 'talkcraft', componentId: 'chip-grid-single-select', params: {} },
      { darkScene: true },
    )
    expect(job.theme).toBe('dark')
    expect(job.props.theme).toBe('dark')
  })

  it('亮场景下带 theme 的卡不注入 theme', () => {
    const job = createTalkcraftRenderJob(
      { lib: 'talkcraft', componentId: 'chip-grid-single-select', params: {} },
      { darkScene: false },
    )
    expect(job.theme).toBe('light')
    expect('theme' in job.props).toBe(false)
  })

  it('整屏模式指向原库路径（仓库内不存在则中文报错）', () => {
    expect(() =>
      createTalkcraftRenderJob(
        { lib: 'talkcraft', componentId: 'title-demote-to-label', params: {} },
        { mode: 'fullscreen' },
      ),
    ).toThrow(/整屏/)
  })

  it('非 talkcraft 引用中文报错', () => {
    expect(() =>
      createTalkcraftRenderJob(
        { lib: 'aikou', componentId: 'tag', params: {} } as unknown as {
          lib: 'talkcraft'
          componentId?: string
          params?: Record<string, unknown>
        },
        {},
      ),
    ).toThrow(/talkcraft/)
  })

  it('未知组件 ID 抛中文错', () => {
    expect(() =>
      createTalkcraftRenderJob({ lib: 'talkcraft', componentId: 'no-such-card', params: {} }, {}),
    ).toThrow(/talkcraft 组件不存在/)
  })

  it('静帧钳制在卡片总帧数内（title-demote-to-label 共 189 帧）', () => {
    const job = createTalkcraftRenderJob(
      { lib: 'talkcraft', componentId: 'title-demote-to-label', params: {} },
      { stillSec: 999 },
    )
    expect(job.frame).toBe(188)
  })
})
