// ─── 改编来源 ───
// video-shotcraft (Apache License 2.0) · https://github.com/Vincentwei1021/video-shotcraft
// 原卡: demos/typography/paper-title-card/PaperTitleCard.tsx
// 参考: references/shots/typography/paper-title-card.md
// （"一句话逐词压印上纸、一个词标强调色斜体、短划线收束"：章节转场/价值主张字卡）
// 改动:
//  1. 硬编码文案提为带默认值的 props：text（*词* = 强调，\n 换行）、sub、subDigits（滚动数字）
//  2. 去掉不透明暖白纸底，改为透明底（alpha 叠加渲染用）；墨色文字在亮画面上可读
//  3. 节奏命门保持常量：逐词 4f 错峰 / 9f 入场 / 下划线 16–34f / 尾 8f 淡出
//  4. duration prop：尾部淡出跟 duration 走（原 demo 55f 定长）
//  5. DigitRoll 数字滚动列原样保留（odometer 风格，tabular-nums 防抖）
import React from 'react'
import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from 'remotion'

export const PAPER_TITLE_CARD_DURATION = 55 // ≈1.8s @30fps

const SERIF = 'ui-serif, Georgia, "Times New Roman", serif'
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'
const INK = '#1c1a17'
const ACCENT = '#b5651d'

/** 文案 DSL：`*词*` 为琥珀斜体强调词；`\n` 强制换行 */
export const parsePaperWords = (text: string): { text: string; accent: boolean; br: boolean }[] =>
  String(text ?? '')
    .split('\n')
    .flatMap((line, li) =>
      line
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => {
          const m = w.match(/^\*(.+)\*$/)
          return { text: m ? m[1] : w, accent: !!m, br: false }
        })
        .concat(li < String(text ?? '').split('\n').length - 1 ? [{ text: '', accent: false, br: true }] : []),
    )
    .filter(w => w.text || w.br)

const DIGITS = '0123456789'
const DigitColumn: React.FC<{ ch: string; delay: number; lineH: number; color: string }> = ({ ch, delay, lineH, color }) => {
  const frame = useCurrentFrame()
  if (ch < '0' || ch > '9') {
    return <span style={{ fontSize: 26, lineHeight: `${lineH}px`, color }}>{ch}</span>
  }
  const target = DIGITS.indexOf(ch)
  const t = interpolate(frame, [delay, delay + 22], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.25, 0.8, 0.25, 1),
  })
  const offset = (10 + target) * t * lineH
  return (
    <span style={{ display: 'inline-block', height: lineH }}>
      <span style={{ display: 'block', transform: `translateY(${-offset}px)` }}>
        {(DIGITS + DIGITS).split('').map((d, j) => (
          <span
            key={j}
            style={{
              display: 'block',
              fontSize: 26,
              lineHeight: `${lineH}px`,
              color,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {d}
          </span>
        ))}
      </span>
    </span>
  )
}

const DigitRoll: React.FC<{ value: string; delay: number; color: string }> = ({ value, delay, color }) => {
  const lineH = 26 * 1.15
  return (
    <span style={{ display: 'inline-flex', overflow: 'hidden', height: lineH, verticalAlign: 'bottom' }}>
      {value.split('').map((c, i) => (
        <DigitColumn key={i} ch={c} delay={delay + i * 4} lineH={lineH} color={color} />
      ))}
    </span>
  )
}

export interface PaperTitleCardProps {
  /** 主文案（*词* = 强调；\n 换行） */
  text?: string
  /** 副行（等宽小字，可空） */
  sub?: string
  /** 副行滚动数字（可空） */
  subDigits?: string
  /** 主字号 px */
  fontSize?: number
  /** 总时长（帧，30fps）；尾 8f 淡出 */
  duration?: number
}

export const PAPER_TITLE_CARD_DEFAULTS: Required<PaperTitleCardProps> = {
  text: 'Direct the\nfilm. Let the agent *shoot* it.',
  sub: 'shots rendered today',
  subDigits: '12',
  fontSize: 116,
  duration: PAPER_TITLE_CARD_DURATION,
}

export const PAPER_TITLE_CARD_SCHEMA = [
  { type: 'textarea', key: 'text', label: '主文案（*词* = 强调，换行分行）', default: 'Direct the\nfilm. Let the agent *shoot* it.', required: true },
  { type: 'text', key: 'sub', label: '副行（空则隐藏）', default: 'shots rendered today' },
  { type: 'text', key: 'subDigits', label: '副行滚动数字', default: '12' },
  { type: 'slider', key: 'fontSize', label: '主字号', default: 116, min: 64, max: 180, step: 2, unit: 'px' },
  { type: 'number', key: 'duration', label: '总时长', default: PAPER_TITLE_CARD_DURATION, min: 40, max: 300, step: 1, unit: '帧' },
] as const

export const PaperTitleCard: React.FC<PaperTitleCardProps> = (props) => {
  const p = { ...PAPER_TITLE_CARD_DEFAULTS, ...props }
  const frame = useCurrentFrame()
  const duration = Math.max(40, p.duration)
  const words = parsePaperWords(p.text)
  const fadeOut = interpolate(frame, [duration - 8, duration], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const underline = interpolate(frame, [16, 34], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.3, 0, 0.2, 1),
  })
  const subT = interpolate(frame, [10, 22], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  let wordIndex = 0
  return (
    <AbsoluteFill
      style={{
        background: 'transparent',
        justifyContent: 'center',
        alignItems: 'center',
        opacity: fadeOut,
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 1500 }}>
        <div
          style={{
            fontFamily: SERIF,
            fontSize: p.fontSize,
            fontWeight: 600,
            lineHeight: 1.14,
            color: INK,
            letterSpacing: '-0.012em',
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            columnGap: '0.26em',
          }}
        >
          {words.map((w, i) => {
            if (w.br) return <span key={i} style={{ flexBasis: '100%', height: 0 }} />
            const delay = 4 + wordIndex * 4
            wordIndex++
            const t = interpolate(frame, [delay, delay + 9], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
              easing: Easing.bezier(0.2, 0.75, 0.3, 1),
            })
            return (
              <span
                key={i}
                style={{
                  opacity: t,
                  transform: `scale(${1.28 - 0.28 * t})`,
                  filter: `blur(${((1 - t) * 7).toFixed(2)}px)`,
                  display: 'inline-block',
                  fontStyle: w.accent ? 'italic' : 'normal',
                  color: w.accent ? ACCENT : undefined,
                }}
              >
                {w.text}
              </span>
            )
          })}
        </div>
        <div
          style={{
            height: 6,
            width: 220,
            margin: '38px auto 0',
            borderRadius: 3,
            background: ACCENT,
            transform: `scaleX(${underline})`,
          }}
        />
        {p.sub ? (
          <div
            style={{
              fontFamily: MONO,
              fontSize: 26,
              letterSpacing: '0.12em',
              color: 'rgba(28,26,23,0.62)',
              marginTop: 34,
              opacity: subT,
              textTransform: 'uppercase',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'baseline',
              gap: '0.5em',
            }}
          >
            {p.subDigits ? <DigitRoll value={p.subDigits} delay={12} color={ACCENT} /> : null}
            <span>{p.sub}</span>
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  )
}
