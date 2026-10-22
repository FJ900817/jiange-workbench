import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  TALKCRAFT_COMPONENT_IDS,
  TALKCRAFT_COMPONENTS,
} from '../src/client/skeleton/video-packaging/talkcraft-components.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const VP = resolve(HERE, '../src/client/skeleton/video-packaging')

/** 透明化试点 4 张卡：标题类 / 数据类 / 清单类 / 信息卡各一 */
const PILOT = [
  'title-demote-to-label',
  'unit-grid-proportion',
  'filmstrip-conveyor',
  'info-card-assemble',
] as const

describe('talkcraft 透明改编试点 (fixture only, no model calls)', () => {
  it('4 张试点卡仍在 29 张白名单内', () => {
    for (const id of PILOT) expect(TALKCRAFT_COMPONENT_IDS).toContain(id)
  })

  it('4 张试点卡的注册表条目带有 alphaFile 标记', () => {
    for (const id of PILOT) {
      const entry = (TALKCRAFT_COMPONENTS as Record<string, any>)[id]
      expect(entry.alphaFile).toBe(`talkcraft-cards/${id}.tsx`)
    }
  })

  it('其余 25 张卡没有 alphaFile（试点范围只有 4 张）', () => {
    for (const id of TALKCRAFT_COMPONENT_IDS) {
      if ((PILOT as readonly string[]).includes(id)) continue
      expect((TALKCRAFT_COMPONENTS as Record<string, any>)[id].alphaFile).toBeUndefined()
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
