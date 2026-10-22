// ─── 改编来源 ───
// video-shotcraft (Apache License 2.0) · https://github.com/Vincentwei1021/video-shotcraft
// 原卡: demos/typography/blur-slide/BlurSlide.tsx
// 参考: references/shots/typography/blur-slide.md
// （"标题逐词入场，y+blur+opacity 三通道走同一条 ease-out 同步收敛；副标题错峰跟进"）
// 改动:
//  1. 硬编码文案提为带默认值的 props：masthead（刊头字标，可空）/ issue / kicker /
//     title1 / title2（*词* = 朱红斜体强调词，最后落定）/ sub；刊号数字 folioNo
//  2. 去掉 video-shotcraft 字标（ShotcraftWordmark → masthead prop，默认空即隐藏）
//  3. 去掉 Stage 纸底（暖白底+主光+颗粒+暗角），改为透明底（alpha 叠加渲染用）；
//     纸面右下朱红余温一并去掉；后景刊号保留（4.5% 墨色，叠加时近乎不可见）
//  4. 节奏命门保持常量：词间 4f / 入场 22f / 三通道共用 EASE.out / 推近 1→1.03
//  5. 新增 duration prop：尾 8f 淡出跟 duration 走（原 demo 120f 定长无淡出）
//  6. 词定时按词序号自动排布（start = 10 + i*4），换文案后节奏自动适配
import React from 'react'
import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { LOOKS, SERIF, alpha } from '../_fixtures/Look'
import { EASE, FONT, ramp } from '../_fixtures/Polish'

export const BLUR_SLIDE_DURATION = 120 // 4000ms @30fps

const L = LOOKS.paper
const LEFT = 168 // 左侧安全边距 / 网格起点

type Word = { text: string; start: number; dur: number; style?: React.CSSProperties; track?: [number, number] }

const Words: React.FC<{ words: Word[]; dy: number; blur: number; gap: string; style: React.CSSProperties }> = ({ words, dy, blur, gap, style }) => {
  const frame = useCurrentFrame()
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap, whiteSpace: 'nowrap', ...style }}>
      {words.map((w, i) => {
        const p = ramp(frame, w.start, w.dur, EASE.out)
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              opacity: p,
              transform: `translateY(${((1 - p) * dy).toFixed(2)}px)`,
              filter: p >= 0.999 ? undefined : `blur(${((1 - p) * blur).toFixed(2)}px)`,
              letterSpacing: w.track ? `${(w.track[0] + (w.track[1] - w.track[0]) * p).toFixed(4)}em` : undefined,
              ...w.style,
            }}
          >
            {w.text}
          </span>
        )
      })}
    </div>
  )
}

/** 把 `*词*` 拆成强调词（原 demo：第二行末词朱红斜体、入场窗更长） */
const splitAccent = (text: string): { text: string; accent: boolean }[] => {
  const out: { text: string; accent: boolean }[] = []
  const re = /\*([^*]+)\*/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), accent: false })
    out.push({ text: m[1], accent: true })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last), accent: false })
  return out.filter(s => s.text.length > 0)
}

const toWords = (text: string, start0: number, step: number, dur: number, accentDur: number): Word[] => {
  const words: Word[] = []
  let i = 0
  for (const seg of splitAccent(text)) {
    for (const w of seg.text.split(/\s+/).filter(Boolean)) {
      words.push(seg.accent
        ? { text: w, start: start0 + i * step, dur: accentDur, track: [0.03, -0.025], style: { fontStyle: 'italic', color: L.accent } }
        : { text: w, start: start0 + i * step, dur })
      i++
    }
  }
  return words
}

export interface BlurSlideProps {
  /** 刊头字标（空则隐藏） */
  masthead?: string
  /** 刊头右侧期号 */
  issue?: string
  /** 栏目眉题 */
  kicker?: string
  /** 主标题第一行 */
  title1?: string
  /** 主标题第二行（*词* = 朱红斜体强调词） */
  title2?: string
  /** 副标题 */
  sub?: string
  /** 后景刊号大数字 */
  folioNo?: string
  /** 总时长（帧，30fps）；尾 8f 淡出 */
  duration?: number
}

export const BLUR_SLIDE_DEFAULTS: Required<BlurSlideProps> = {
  masthead: '',
  issue: 'N° 07 — OCTOBER 2026',
  kicker: 'RELEASE NOTES',
  title1: 'Make every launch',
  title2: 'feel *cinematic.*',
  sub: 'Shot recipes and camera moves, crafted by your agent.',
  folioNo: '07',
  duration: BLUR_SLIDE_DURATION,
}

export const BLUR_SLIDE_SCHEMA = [
  { type: 'text', key: 'masthead', label: '刊头字标（空则隐藏）', default: '' },
  { type: 'text', key: 'issue', label: '刊头期号', default: 'N° 07 — OCTOBER 2026' },
  { type: 'text', key: 'kicker', label: '栏目眉题', default: 'RELEASE NOTES' },
  { type: 'text', key: 'title1', label: '主标题第一行', default: 'Make every launch', required: true },
  { type: 'text', key: 'title2', label: '主标题第二行（*词* = 强调）', default: 'feel *cinematic.*', required: true },
  { type: 'textarea', key: 'sub', label: '副标题', default: 'Shot recipes and camera moves, crafted by your agent.' },
  { type: 'text', key: 'folioNo', label: '后景刊号', default: '07' },
  { type: 'number', key: 'duration', label: '总时长', default: BLUR_SLIDE_DURATION, min: 90, max: 400, step: 1, unit: '帧' },
] as const

export const BlurSlide: React.FC<BlurSlideProps> = (props) => {
  const p = { ...BLUR_SLIDE_DEFAULTS, ...props }
  const frame = useCurrentFrame()
  const duration = Math.max(90, p.duration)
  const push = 1 + 0.03 * ramp(frame, 0, 119, EASE.smooth)
  const rule = ramp(frame, 0, 24, EASE.snappy)
  const kick = ramp(frame, 4, 18, EASE.out)
  const folio = ramp(frame, 0, 48, EASE.out)
  const foot = ramp(frame, 72, 26, EASE.snappy)
  const fadeOut = 1 - ramp(frame, duration - 8, 8, EASE.out)
  const headline: React.CSSProperties = {
    fontFamily: SERIF, fontSize: 170, fontWeight: 400, lineHeight: 1, letterSpacing: '-0.035em', color: L.ink,
  }
  const H1_A = toWords(p.title1, 10, 4, 22, 22)
  const H1_B = toWords(p.title2, 26, 4, 22, 30)
  const H2: Word[] = p.sub.split(/\s+/).filter(Boolean).map((text, i) => ({ text, start: 34 + i * 2.4, dur: 20 }))

  return (
    <AbsoluteFill style={{ opacity: fadeOut }}>
      <div
        style={{
          position: 'absolute', right: 120, top: 150, fontFamily: SERIF, fontSize: 760, fontWeight: 400, lineHeight: 1, letterSpacing: '-0.06em',
          color: alpha(L.ink, 0.045 * folio), filter: folio >= 0.999 ? undefined : `blur(${((1 - folio) * 24).toFixed(2)}px)`,
          transform: `translateX(${(-24 * ramp(frame, 0, 119, EASE.smooth)).toFixed(2)}px)`,
        }}
      >
        {p.folioNo}
      </div>
      <div style={{ position: 'absolute', left: LEFT, right: LEFT, top: 92, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: FONT.sans, fontSize: 24, fontWeight: 600, letterSpacing: '0.2em', color: L.ink2, opacity: 0.4 + 0.6 * rule }}>
        <span>{p.masthead}</span>
        <span style={{ color: L.ink3 }}>{p.issue}</span>
      </div>
      <div style={{ position: 'absolute', left: LEFT, top: 140, width: 1920 - LEFT * 2, height: 1.5, background: alpha(L.ink, 0.22), transform: `scaleX(${rule.toFixed(4)})`, transformOrigin: '0 50%' }} />

      <div style={{ position: 'absolute', left: LEFT, top: 972, width: 1920 - LEFT * 2, height: 1.5, background: alpha(L.ink, 0.18), transform: `scaleX(${foot.toFixed(4)})`, transformOrigin: '100% 50%' }} />
      <div style={{ position: 'absolute', right: LEFT, top: 994, fontFamily: FONT.sans, fontSize: 24, fontWeight: 600, letterSpacing: '0.2em', color: L.ink3, opacity: foot }}>
        PAGE {p.folioNo}
      </div>

      <div style={{ position: 'absolute', inset: 0, transform: `scale(${push.toFixed(5)})`, transformOrigin: `${LEFT}px 560px` }}>
        <div
          style={{
            position: 'absolute', left: LEFT, top: 318, display: 'flex', alignItems: 'center', gap: 18,
            fontFamily: FONT.sans, fontSize: 30, fontWeight: 650, letterSpacing: '0.16em', color: L.accent,
            opacity: kick, transform: `translateY(${((1 - kick) * 18).toFixed(2)}px)`, filter: kick >= 0.999 ? undefined : `blur(${((1 - kick) * 6).toFixed(2)}px)`,
          }}
        >
          <span style={{ width: 14, height: 14, background: L.accent, display: 'inline-block' }} />
          {p.kicker}
        </div>

        <Words words={H1_A} dy={64} blur={18} gap="0.24em" style={{ ...headline, position: 'absolute', left: LEFT - 6, top: 384 }} />
        <Words words={H1_B} dy={64} blur={18} gap="0.24em" style={{ ...headline, position: 'absolute', left: LEFT - 6, top: 556 }} />

        <Words
          words={H2}
          dy={26}
          blur={9}
          gap="0.26em"
          style={{ position: 'absolute', left: LEFT, top: 800, fontFamily: FONT.sans, fontSize: 46, fontWeight: 400, letterSpacing: '-0.012em', color: L.ink2, lineHeight: 1.2 }}
        />
      </div>
    </AbsoluteFill>
  )
}
