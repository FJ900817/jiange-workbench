import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  TALKCRAFT_COMPONENT_IDS,
  TALKCRAFT_COMPONENTS,
} from '../src/client/skeleton/video-packaging/talkcraft-components.js'

/** 注册表条目：只取本测试关心的 alphaFile 字段 */
type AlphaEntry = { alphaFile?: string }
const entryOf = (id: string): AlphaEntry =>
  (TALKCRAFT_COMPONENTS as Record<string, AlphaEntry>)[id]!

const HERE = dirname(fileURLToPath(import.meta.url))
const VP = resolve(HERE, '../src/client/skeleton/video-packaging')

/** 透明化试点 4 张卡：标题类 / 数据类 / 清单类 / 信息卡各一 */
const PILOT = [
  'title-demote-to-label',
  'unit-grid-proportion',
  'filmstrip-conveyor',
  'info-card-assemble',
] as const

/** 全量改编新增的 25 张卡 */
const BATCH = [
  'bed-echo-blur',
  'chip-grid-single-select',
  'countdown-arc-scatter',
  'crash-zoom-punch',
  'doc-park-left-pill-deal',
  'error-retype',
  'flying-words',
  'gallery-wall-dolly',
  'grid-to-hero',
  'host-card-glass-board',
  'lead-word-zoom-assemble',
  'line-carry-transition',
  'parallel-items-with-host',
  'rack-focus-pair',
  'reticle-lock-on',
  'scanline-annotate',
  'source-converge',
  'split-60-40-story',
  'split-compare-slider',
  'split-text-stagger',
  'stack-fan-out',
  'still-layout-relay',
  'timeline-photo-strip',
  'word-relay-filmstrip',
  'word-slot-cycle',
] as const

/** 带 theme 深色字浅色版的卡（同文件 theme?: "light" | "dark"） */
const THEMED = [
  'chip-grid-single-select',
  'countdown-arc-scatter',
  'error-retype',
  'lead-word-zoom-assemble',
  'doc-park-left-pill-deal',
  'line-carry-transition',
  'scanline-annotate',
  'source-converge',
  'split-text-stagger',
  'stack-fan-out',
] as const

/** 整屏构图重排为浮动面板的卡 */
const FLOATED = [
  'gallery-wall-dolly',
  'host-card-glass-board',
  'parallel-items-with-host',
  'split-60-40-story',
  'split-compare-slider',
  'still-layout-relay',
  'timeline-photo-strip',
  'word-relay-filmstrip',
  'word-slot-cycle',
] as const

describe('talkcraft 透明改编试点 (fixture only, no model calls)', () => {
  it('4 张试点卡仍在 29 张白名单内', () => {
    for (const id of PILOT) expect(TALKCRAFT_COMPONENT_IDS).toContain(id)
  })

  it('4 张试点卡的注册表条目带有 alphaFile 标记', () => {
    for (const id of PILOT) {
      const entry = entryOf(id)
      expect(entry.alphaFile).toBe(`talkcraft-cards/${id}.tsx`)
    }
  })

  it('改编文件存在且根 AbsoluteFill 为透明、无整屏不透明底残留', () => {
    for (const id of PILOT) {
      const file = join(VP, `talkcraft-cards/${id}.tsx`)
      expect(existsSync(file), `${id}.tsx 应存在`).toBe(true)
      const src = readFileSync(file, 'utf8')
      // 改编头注
      expect(src).toContain('改编来源')
      expect(src).toContain('video-talkcraft')
      // 根节点透明
      expect(src).toContain('background: "transparent"')
      // 根整屏底色无残留（卡片本体的 #ffffff 如 .ica-pc 不在此列，只查 AbsoluteFill 行）
      const rootLines = src.split('\n').filter(l => l.includes('<AbsoluteFill'))
      expect(rootLines.length).toBe(1)
      expect(rootLines[0]).not.toContain('#ffffff')
      expect(rootLines[0]).not.toContain('#f5f5f7')
    }
  })

  it('改编文件保留原卡 props 接口（默认导出 + meta 导出）', () => {
    for (const id of PILOT) {
      const src = readFileSync(join(VP, `talkcraft-cards/${id}.tsx`), 'utf8')
      expect(src).toContain('export default function')
      expect(src).toContain('export const meta')
    }
  })
})

describe('talkcraft 透明改编全量 25 张 (fixture only, no model calls)', () => {
  it('25 张全在 29 张白名单内，4 张试点除外共 29 张', () => {
    for (const id of BATCH) expect(TALKCRAFT_COMPONENT_IDS).toContain(id)
    expect(TALKCRAFT_COMPONENT_IDS).toHaveLength(29)
  })

  it('29 张卡的注册表条目全部带有 alphaFile 标记', () => {
    for (const id of TALKCRAFT_COMPONENT_IDS) {
      const entry = entryOf(id)
      expect(entry.alphaFile, `${id} 应有 alphaFile`).toBe(`talkcraft-cards/${id}.tsx`)
    }
  })

  it('25 张改编文件存在、有改编头注、根节点透明', () => {
    for (const id of BATCH) {
      const file = join(VP, `talkcraft-cards/${id}.tsx`)
      expect(existsSync(file), `${id}.tsx 应存在`).toBe(true)
      const src = readFileSync(file, 'utf8')
      expect(src).toContain('改编来源')
      expect(src).toContain('video-talkcraft')
      expect(src).toContain('background: "transparent"')
      expect(src).toContain('export default function')
      expect(src).toContain('export const meta')
    }
  })

  it('10 张深色字卡带 theme 参数（浅色字版本）', () => {
    for (const id of THEMED) {
      const src = readFileSync(join(VP, `talkcraft-cards/${id}.tsx`), 'utf8')
      expect(src, `${id} 应支持 theme`).toContain('theme')
    }
  })

  it('9 张整屏构图卡重排为浮动面板（圆角面板包裹）', () => {
    for (const id of FLOATED) {
      const src = readFileSync(join(VP, `talkcraft-cards/${id}.tsx`), 'utf8')
      // 浮动面板：圆角 + 阴影的包裹层（施工员 C 统一语言）
      expect(src, `${id} 应有浮动面板`).toMatch(/borderRadius|border-radius/)
    }
  })
})
