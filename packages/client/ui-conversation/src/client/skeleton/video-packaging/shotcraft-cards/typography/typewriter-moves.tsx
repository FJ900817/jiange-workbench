// ─── 改编来源 ───
// video-shotcraft (Apache License 2.0) · https://github.com/Vincentwei1021/video-shotcraft
// 原卡: demos/typography/typewriter-moves/TypewriterErrorRetype.tsx
// 参考: references/shots/typography/typewriter-moves.md
// 改动:
//  1. 硬编码文案提为带默认值的 props：draft（草稿）/ keep（保留前 N 字）/
//     final（重打终稿）/ highlight（马克笔强调词）/ brand（眉题字标，默认 'Studio'）
//  2. 时间/版式常量（PAUSE_START/DS/RS/LEFT/HL_FROM/HL_LEN 等）改由组件内按 props 推导；
//     节奏命门保持（2f/字打字 / 1.5f/字删除重打 / 删完小顿 3.5f / 光标闪烁规律）
//  3. 去掉 video-shotcraft 品牌（ShotcraftMark → 中性圆点；BRAND.name → brand prop）
//  4. 去掉 Backdrop 浅底，改为透明底（alpha 叠加渲染用）
//  5. 新增 duration prop：尾 8f 淡出跟 duration 走（不传则无淡出）

import React from 'react'
import { useCurrentFrame } from 'remotion'
import { G } from '../_fixtures/Fixtures'
import { EASE, FONT, ramp } from '../_fixtures/Polish'

export const TYPEWRITER_ERROR_RETYPE_DURATION = 160

/* 时间/版式常量改由组件内按 draft/final/highlight 计算（见 TypewriterErrorRetype） */

/* cursorOn 改由组件内定义（依赖推导出的时间常量） */

export interface TypewriterErrorRetypeProps {
  /** 第一遍草稿（会被删掉重打的部分在后） */
  draft?: string
  /** 草稿保留的前 N 个字符 */
  keep?: number
  /** 重打的终稿（接在保留部分之后） */
  final?: string
  /** 终稿中的强调词（马克笔底色） */
  highlight?: string
  /** 眉题字标 */
  brand?: string
  /** 总时长（帧，30fps）；尾 8f 淡出 */
  duration?: number
}

export const TYPEWRITER_ERROR_RETYPE_DEFAULTS: Required<TypewriterErrorRetypeProps> = {
  draft: 'just a slideshow',
  keep: 5,
  final: 'your cinematic crew',
  highlight: 'cinematic crew',
  brand: 'Studio',
  duration: TYPEWRITER_ERROR_RETYPE_DURATION,
}

export const TYPEWRITER_ERROR_RETYPE_SCHEMA = [
  { type: 'text', key: 'draft', label: '草稿（第一遍）', default: 'just a slideshow', required: true },
  { type: 'number', key: 'keep', label: '保留前 N 字', default: 5, min: 0, max: 40, step: 1 },
  { type: 'text', key: 'final', label: '终稿（重打）', default: 'your cinematic crew', required: true },
  { type: 'text', key: 'highlight', label: '强调词（马克笔）', default: 'cinematic crew' },
  { type: 'text', key: 'brand', label: '眉题字标', default: 'Studio' },
  { type: 'number', key: 'duration', label: '总时长', default: TYPEWRITER_ERROR_RETYPE_DURATION, min: 80, max: 400, step: 1, unit: '帧' },
] as const

export const TypewriterErrorRetype: React.FC<TypewriterErrorRetypeProps> = (props) => {
  const p = { ...TYPEWRITER_ERROR_RETYPE_DEFAULTS, ...props }
  const f = useCurrentFrame()
  // 时间/版式常量（原 demo 按 16/19 字符手写；此处按 props 推导，节奏命门不变）
  const TEXT1 = p.draft
  const KEEP = Math.min(p.keep, TEXT1.length)
  const DEL = TEXT1.length - KEEP
  const TEXT2 = p.final
  const T1 = 2 // 第一遍打字起点，2f/字符
  const PAUSE_START = T1 + (TEXT1.length - 1) * 2
  const DS = PAUSE_START + 16 // 开删，1.5f/字符
  const RS = DS + DEL * 1.5 + 3.5 // 重打起点（删完小顿 3.5f；原 demo RS=68）
  const TYPE2_END = RS + (TEXT2.length - 1) * 1.5
  const CURSOR_OFF = TYPE2_END + 20
  const SIZE = 100
  const CHAR_W = 60
  const FINAL_LEN = KEEP + TEXT2.length
  const LEFT = (1920 - FINAL_LEN * CHAR_W) / 2 // 最终句整体居中，打字过程左缘锚定不横移
  const HL_START = TYPE2_END + 1
  const HL_DUR = 14
  const HL_FROM = KEEP + TEXT2.indexOf(p.highlight)
  const HL_LEN = p.highlight ? p.highlight.length : 0
  const tailFade = p.duration ? 1 - ramp(f, p.duration - 8, 8, EASE.out) : 1
  // 光标可见性：打字/删除时常亮；停顿段 8f 周期闪两下；打完后 10f 周期闪两下；之后永灭
  const cursorOn = (f: number): boolean => {
    if (f >= CURSOR_OFF) return false
    if (f >= TYPE2_END) {
    // f95 起：on[95,100) off[100,105) on[105,110) off[110,115)
      return Math.floor((f - TYPE2_END) / 5) % 2 === 0
    }
    if (f >= DS) return true // 删除 + 重打：常亮（果断）
    if (f >= PAUSE_START) {
    // 犹豫段 f32–48：on[32,36) off[36,40) on[40,44) off[44,48)
      return Math.floor((f - PAUSE_START) / 4) % 2 === 0
    }
    return true // 第一遍打字：常亮
  };


  // 第一遍已打出字符数
  const n1 = f < T1 ? 0 : Math.min(TEXT1.length, Math.floor((f - T1) / 2) + 1)
  // 已删除字符数（从尾部删）
  const removed = f < DS ? 0 : Math.min(DEL, Math.floor((f - DS) / 1.5) + 1)
  // 第二遍已打出字符数
  const n2 = f < RS ? 0 : Math.min(TEXT2.length, Math.floor((f - RS) / 1.5) + 1)

  const shown =
    TEXT1.slice(0, Math.max(KEEP, n1 - removed)).slice(0, n1) +
    TEXT2.slice(0, n2)

  const chars = shown.split('')

  const hl = HL_LEN > 0 && HL_FROM >= KEEP ? ramp(f, HL_START, HL_DUR, EASE.snappy) : 0

  return (
    <div style={{ width: 1920, height: 1080, position: 'relative', overflow: 'hidden', opacity: tailFade }}>
      {/* 马克笔底色：只铺在宣言词下半身，左→右 */}
      {hl > 0 && (
        <div style={{
          position: 'absolute', left: LEFT + HL_FROM * CHAR_W - 10, top: 540 + SIZE * 0.06,
          width: (HL_LEN * CHAR_W + 20) * hl, height: SIZE * 0.36, borderRadius: 6,
          background: 'linear-gradient(90deg, rgba(91,99,211,0.26) 0%, rgba(91,99,211,0.20) 100%)',
        }} />
      )}
      {/* 眉题：与打字行左缘对齐，开场 10f 淡入，交代"这是一句产品介绍"——video-shotcraft 标志 + 小写品牌名 */}
      <div style={{
        position: 'absolute', left: LEFT + 6, top: 540 - SIZE * 0.55 - 70,
        display: 'flex', alignItems: 'center', gap: 12,
        fontFamily: FONT.sans, fontSize: 34, fontWeight: 500, letterSpacing: '0.01em', color: G.ink3,
        opacity: ramp(f, 0, 10, EASE.out),
      }}>
        <span style={{ width: 40, height: 40, borderRadius: '50%', background: G.ink3, opacity: 0.5, display: 'inline-block', marginTop: -2 }} />
        <span>Introducing <span style={{ fontWeight: 700, letterSpacing: '0.03em', color: G.ink1 }}>{p.brand}</span></span>
      </div>
      {/* 左缘锚定：打字过程不横移（真打字机感）；行垂直居中于 540 */}
      <div
        style={{
          position: 'absolute',
          left: LEFT,
          top: 540 - (SIZE * 1.1) / 2,
          display: 'flex',
          alignItems: 'center',
          height: SIZE * 1.1,
        }}
      >
        {chars.map((c, i) => (
          <span
            key={i}
            style={{
              display: 'inline-block',
              width: CHAR_W,
              textAlign: 'center',
              fontFamily: FONT.mono,
              fontSize: SIZE,
              fontWeight: 600,
              color: G.ink1,
              lineHeight: 1.1,
            }}
          >
            {c === ' ' ? '\u00a0' : c}
          </span>
        ))}
        {/* 光标：强调色竖条，条件挂载而非 opacity 0 */}
        {cursorOn(f) && (
          <span
            style={{
              display: 'inline-block',
              width: 6,
              height: SIZE * 0.98,
              marginLeft: 4,
              borderRadius: 3,
              background: G.accent,
              boxShadow: '0 0 12px rgba(91,99,211,0.35)',
            }}
          />
        )}
      </div>
    </div>
  )
}
