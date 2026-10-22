import { describe, expect, it } from 'vitest'
import {
  TALKCRAFT_ORIGINAL_CARDS_DIR,
  TALKCRAFT_RENDER_MODES,
  TALKCRAFT_THEMED_IDS,
  resolveTalkcraftRenderTarget,
} from '../src/client/skeleton/video-packaging/talkcraft-dispatch.js'
import { TALKCRAFT_COMPONENTS } from '../src/client/skeleton/video-packaging/talkcraft-components.js'

const THEMED_SAMPLE = 'chip-grid-single-select'
const PLAIN_SAMPLE = 'crash-zoom-punch'
const refOf = (componentId: string, params: Record<string, unknown> = {}) => ({
  lib: 'talkcraft',
  componentId,
  params,
})

describe('talkcraft 渲染分发', () => {
  it('默认叠加模式用 alphaFile 透明版', () => {
    const target = resolveTalkcraftRenderTarget(refOf(THEMED_SAMPLE))
    expect(target.mode).toBe('overlay')
    expect(target.file).toBe(TALKCRAFT_COMPONENTS[THEMED_SAMPLE].alphaFile)
    expect(target.file).toBe('talkcraft-cards/chip-grid-single-select.tsx')
  })

  it('显式叠加模式用 alphaFile', () => {
    const target = resolveTalkcraftRenderTarget(refOf(PLAIN_SAMPLE), { mode: 'overlay' })
    expect(target.file).toBe('talkcraft-cards/crash-zoom-punch.tsx')
  })

  it('整屏模式用原库路径', () => {
    const target = resolveTalkcraftRenderTarget(refOf(PLAIN_SAMPLE), { mode: 'fullscreen' })
    expect(target.mode).toBe('fullscreen')
    expect(target.file).toBe(`${TALKCRAFT_ORIGINAL_CARDS_DIR}/crash-zoom-punch.tsx`)
  })

  it('暗场景下带 theme 的卡默认 dark', () => {
    const target = resolveTalkcraftRenderTarget(refOf(THEMED_SAMPLE), { darkScene: true })
    expect(target.theme).toBe('dark')
    expect(target.props.theme).toBe('dark')
  })

  it('暗场景下无 theme 的卡保持原样', () => {
    const target = resolveTalkcraftRenderTarget(refOf(PLAIN_SAMPLE), { darkScene: true })
    expect(target.theme).toBe('light')
    expect('theme' in target.props).toBe(false)
  })

  it('亮场景下带 theme 的卡不注入 theme', () => {
    const target = resolveTalkcraftRenderTarget(refOf(THEMED_SAMPLE), { darkScene: false })
    expect(target.theme).toBe('light')
    expect('theme' in target.props).toBe(false)
  })

  it('params 显式 theme 优先于场景默认', () => {
    const dark = resolveTalkcraftRenderTarget(refOf(THEMED_SAMPLE, { theme: 'dark' }), { darkScene: false })
    expect(dark.theme).toBe('dark')
    const light = resolveTalkcraftRenderTarget(refOf(THEMED_SAMPLE, { theme: 'light' }), { darkScene: true })
    expect(light.theme).toBe('light')
    expect(light.props.theme).toBe('light')
  })

  it('其余 params 原样透传', () => {
    const target = resolveTalkcraftRenderTarget(
      refOf(THEMED_SAMPLE, { question: '选哪个？', selected: 2 }),
      { darkScene: true },
    )
    expect(target.props.question).toBe('选哪个？')
    expect(target.props.selected).toBe(2)
    expect(target.props.theme).toBe('dark')
  })

  it('未知 componentId 抛中文错', () => {
    expect(() => resolveTalkcraftRenderTarget(refOf('not-a-card'))).toThrow('talkcraft 组件不存在')
  })

  it('THEMED 名单为 10 张且与注册表注释一致', () => {
    expect(TALKCRAFT_THEMED_IDS).toHaveLength(10)
    expect(TALKCRAFT_RENDER_MODES).toEqual(['overlay', 'fullscreen'])
    for (const id of TALKCRAFT_THEMED_IDS) {
      expect(TALKCRAFT_COMPONENTS[id], `${id} 应在注册表`).toBeDefined()
    }
  })
})
