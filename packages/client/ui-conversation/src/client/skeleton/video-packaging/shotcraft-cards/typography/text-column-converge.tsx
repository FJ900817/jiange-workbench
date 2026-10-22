// ─── 改编来源 ───
// video-shotcraft (Apache License 2.0) · https://github.com/Vincentwei1021/video-shotcraft
// 原卡: demos/typography/text-column-converge/TextColumnConverge.tsx
// 参考: references/shots/typography/text-column-converge.md
// 改动:
//  1. 硬编码文案提为带默认值的 props：prefix（默认 'NEW'）/ words（特性词轮换表）/
//     lastWord（末词收尾字标，默认 'video-shotcraft'）/ sub（斜体小字，默认 'CRAFT THE SHOT.'）
//  2. words 接受 string[] | string（逗号/换行分隔），组件内归一化
//  3. 去掉 video-shotcraft 品牌绑定（原末词 BRAND_WORD 改为 lastWord prop）
//  4. 去掉 #08090c 暗场底，改为透明底（alpha 叠加渲染用）；注意本卡为暗场设计，
//     宜叠在暗画面上（浅字 INK=#eeeef2）
//  5. 合拢节奏命门保持常量（CONVERGE_DUR=36f / CONVERGE_DELAY=10f / SUB_DELAY=18f）
//  6. 新增 duration prop：尾 8f 淡出跟 duration 走（不传则无淡出）

import React from 'react'
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion'
import { FONT, Grain, SpeedBlur, Vignette, ramp, EASE } from '../_fixtures/Polish'

// 默认轮换词（原 demo 内容；末词由 lastWord prop 追加）
const DEFAULT_WORDS = [
  'SHOT RECIPE CARDS', 'PAGE CAPTURES', '2.5D CAMERA MOVES', 'BEAT-SYNCED CUTS',
  'FILM-GRADE SFX', 'MOTION WORKBENCH', 'REMOTION RENDER', 'JIANYING EXPORT',
]
const STEP_DURS = [16, 12, 9, 7, 7, 8, 10, 12] // 停留帧数不均（机器节奏）

const START = 8 // 开场黑场立静

// 原片 1280 宽 → 1920 宽换算（×1.5）
const NEW_LEFT_EDGE = 618 // 412×1.5：NEW 左缘（= 左屏边距）
const WORD_RIGHT_EDGE = 1302 // 868×1.5：特性词右缘（= 右屏边距，1920-1302=618 对称）

const FS = 42 // 原片字高很小（720p 下 cap ~20px → 1080p ~30px → 字号 ~42）
const LSP = 3 // letterSpacing
// 合拢终点按本字体实际步进计算（监视器等宽：0.6em + letterSpacing），
// 保证 "NEW video-shotcraft" 恰好一个空格咬合、整行居中于 960，不会重叠
const ADV = 0.6 * FS + LSP // 每字符步进
/* LINE_W / MERGED_LEFT / MERGED_RIGHT 改由组件内按 lastWord 计算 */
const CONVERGE_DUR = 36 // 合拢时长：原片 ~1.2s ≈ 36 帧
const CONVERGE_DELAY = 10 // 字标停稳后先静置 10 帧再合拢（原片 32.4→32.7s）
const SUB_DELAY = 18 // 合拢定格后 ~0.6s 出斜体小字

// 8f 黑场 + 82f 轮换 + 10f 停稳 + 36f 合拢 + 18f 定格 + 4f 小字 + 22f 静置 = 180f（6.0s）
export const TEXT_COLUMN_CONVERGE_DURATION = 180

const INK = '#eeeef2'
const INK_NEW = '#8a8c96' // 轮换期 NEW 的次级灰
const INK_SUB = '#a3a5ae'

/* LAST_START / cvAt 改由组件内按 STEPS 计算 */

// 简单 hex 混色（NEW 由次级灰提亮到主色）
const mixHex = (a: string, b: string, t: number) => {
  const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16))
  const pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16))
  return `rgb(${pa.map((v, k) => Math.round(v + (pb[k] - v) * t)).join(',')})`
}

export interface TextColumnConvergeProps {
  /** 前缀标签 */
  prefix?: string
  /** 轮换特性词（数组或逗号/换行分隔） */
  words?: string[] | string
  /** 末词：收尾字标（触发合拢） */
  lastWord?: string
  /** 合拢后斜体小字 */
  sub?: string
  /** 总时长（帧，30fps）；尾 8f 淡出 */
  duration?: number
}

export const TEXT_COLUMN_CONVERGE_DEFAULTS: Required<Omit<TextColumnConvergeProps, 'words'>> & { words: string[] } = {
  prefix: 'NEW',
  words: DEFAULT_WORDS,
  lastWord: 'video-shotcraft',
  sub: 'CRAFT THE SHOT.',
  duration: TEXT_COLUMN_CONVERGE_DURATION,
}

export const TEXT_COLUMN_CONVERGE_SCHEMA = [
  { type: 'text', key: 'prefix', label: '前缀标签', default: 'NEW', required: true },
  { type: 'textarea', key: 'words', label: '轮换词（逗号/换行分隔）', default: DEFAULT_WORDS.join('\n') },
  { type: 'text', key: 'lastWord', label: '末词（收尾字标）', default: 'video-shotcraft', required: true },
  { type: 'text', key: 'sub', label: '斜体小字', default: 'CRAFT THE SHOT.' },
  { type: 'number', key: 'duration', label: '总时长', default: TEXT_COLUMN_CONVERGE_DURATION, min: 60, max: 400, step: 1, unit: '帧' },
] as const

export const TextColumnConverge: React.FC<TextColumnConvergeProps> = (props) => {
  const p = { ...TEXT_COLUMN_CONVERGE_DEFAULTS, ...props }
  const f = useCurrentFrame()
  const wordList: string[] = Array.isArray(p.words)
    ? p.words
    : String(p.words).split(/[\n,，、]+/).map(w => w.trim()).filter(Boolean)
  // 词轮换表：停留帧数不均（机器节奏）；末词停稳后触发唯一一次合拢
  const STEPS: { word: string; dur: number }[] = [
    ...wordList.map((word, i) => ({ word, dur: STEP_DURS[i % STEP_DURS.length] })),
    { word: p.lastWord, dur: 999 },
  ]
  const LINE_W = (p.prefix.length + 1 + p.lastWord.length) * ADV // "NEW " + 字标
  const MERGED_LEFT = 960 - LINE_W / 2 // 合拢后前缀左缘
  const MERGED_RIGHT = 960 + LINE_W / 2 // 合拢后字标右缘
  const LAST_START = START + STEPS.slice(0, -1).reduce((a, s) => a + s.dur, 0)
  const cvAt = (frame: number) =>
    interpolate(frame - LAST_START - CONVERGE_DELAY, [0, CONVERGE_DUR], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
      easing: Easing.inOut(Easing.cubic),
    })
  const tailFade = p.duration ? 1 - ramp(f, p.duration - 8, 8, EASE.out) : 1
  const t = f - START

  // 定位当前步
  let acc = 0
  let idx = 0
  let stepStart = 0
  for (let i = 0; i < STEPS.length; i++) {
    if (t >= acc) { idx = i; stepStart = acc }
    acc += STEPS[i].dur
  }
  const cur = STEPS[idx]
  const isLast = idx === STEPS.length - 1
  const local = t - stepStart

  // 唯一一次合拢：字标停稳 CONVERGE_DELAY 帧后，ease-in-out 连续滑动
  const cvT = isLast ? local - CONVERGE_DELAY : -1
  const cv = interpolate(cvT, [0, CONVERGE_DUR], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.cubic),
  })

  // NEW 左缘：618 → 692；特性词右缘：1302 → 1228
  const newLeft = interpolate(cv, [0, 1], [NEW_LEFT_EDGE, MERGED_LEFT])
  const wordRight = interpolate(cv, [0, 1], [WORD_RIGHT_EDGE, MERGED_RIGHT])

  const converged = cv >= 1

  // 斜体小字：合拢定格后 SUB_DELAY 帧，近乎硬切（4 帧快速淡入，无位移）
  const subT = converged ? cvT - CONVERGE_DUR - SUB_DELAY : -1
  const subOp = interpolate(subT, [0, 4], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  })

  const visible = t >= 0

  const font: React.CSSProperties = {
    fontFamily: FONT.mono,
    fontWeight: 500,
    fontSize: FS,
    letterSpacing: LSP,
    color: INK,
    whiteSpace: 'nowrap',
    lineHeight: 1,
  }

  // 词换瞬间 1 帧提亮（首词不闪）
  const flash = local === 0 && idx > 0 ? 1 : 0
  const wordColor = flash ? '#ffffff' : INK
  const wordGlow = flash ? '0 0 14px rgba(200,210,255,0.35)' : 'none'

  // 合拢速度（px/帧）→ 水平运动模糊；两词相向
  const span = MERGED_LEFT - NEW_LEFT_EDGE
  const v = (cvAt(f + 0.5) - cvAt(f - 0.5)) * span
  // 落定后背后柔光
  const glow = ramp(cvT, CONVERGE_DUR - 6, 24, EASE.out)

  return (
    <AbsoluteFill style={{ background: 'transparent', overflow: 'hidden', opacity: tailFade }}>
      {/* 冷色深底 + 中线上方极淡顶光 */}
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse 60% 55% at 50% 40%, rgba(120,130,170,0.10), rgba(120,130,170,0) 70%), ' +
            'linear-gradient(180deg, #0d0e12 0%, #08090c 60%, #060709 100%)',
        }}
      />
      {/* 合拢落定后背后柔光微亮 */}
      <div
        style={{
          position: 'absolute', left: 960 - 520, top: 540 - 150, width: 1040, height: 300,
          background: 'radial-gradient(ellipse 50% 50% at 50% 50%, rgba(170,180,230,0.10), rgba(170,180,230,0) 70%)',
          opacity: glow,
        }}
      />
      {visible && (
        <div style={{ position: 'absolute', inset: 0 }}>
          {/* NEW：左缘定位（轮换期间钉死在左屏边距处）；随合拢由次级灰提亮 */}
          <SpeedBlur vx={v} amount={0.35} max={4}>
            <div style={{
              ...font, position: 'absolute',
              left: newLeft, top: 519,
              color: mixHex(INK_NEW, INK, ramp(cvT, 0, CONVERGE_DUR * 0.8, EASE.smooth)),
            }}>
              {p.prefix}
            </div>
          </SpeedBlur>
          {/* 特性词：右缘定位（词换长换短，右缘不动） */}
          <SpeedBlur vx={-v} amount={0.35} max={4}>
            <div style={{
              ...font, position: 'absolute',
              right: 1920 - wordRight, top: 519,
              color: wordColor, textShadow: wordGlow,
            }}>
              {cur.word}
            </div>
          </SpeedBlur>

          {/* 斜体小字：合拢后在整行正下方浮现，与整行同左缘 */}
          <div style={{
            ...font,
            fontStyle: 'italic',
            color: INK_SUB,
            position: 'absolute',
            left: MERGED_LEFT, top: 519 + FS + 14,
            opacity: subOp,
          }}>
            {p.sub}
          </div>
        </div>
      )}
      <Vignette strength={0.5} inner={0.45} color="#000000" />
      <Grain opacity={0.07} blend="soft-light" />
    </AbsoluteFill>
  )
}
