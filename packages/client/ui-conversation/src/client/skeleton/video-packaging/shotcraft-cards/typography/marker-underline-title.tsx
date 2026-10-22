// ─── 改编来源 ───
// video-shotcraft (Apache License 2.0) · https://github.com/Vincentwei1021/video-shotcraft
// 原卡: demos/typography/marker-underline-title/MarkerUnderlineTitle.tsx
// 参考: references/shots/typography/marker-underline-title.md
// （"大标题落定后，关键词下方马克笔下划线从左到右快速描画"）
// 改动:
//  1. 硬编码文案提为带默认值的 props：title（*词* 标强调/下划线词）、sub（第二行，可空）
//  2. 去掉 video-shotcraft 品牌行（ShotcraftMark + 品牌名），改为通用 sub 副行
//  3. 去掉不透明 Backdrop 纸底，改为透明底（alpha 叠加渲染用）
//  4. 节奏命门保持常量：两行错峰 4f / 下划线 32–42f 描画 / 整段极缓推近 1→1.015
//  5. 新增 duration prop：尾 8f 淡出跟 duration 走（原 demo 75f 定长无淡出）
//  6. 干笔肌理（feTurbulence）与马克笔笔形原样保留
import React, { useId } from 'react'
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion'
import { EASE, FONT, ramp } from '../_fixtures/Polish'

export const MARKER_UNDERLINE_TITLE_DURATION = 75 // 标题 22f 落定 → f32–42 划线 → 静止

const mulberry32 = (a: number) => () => {
  let t = (a += 0x6d2b79f5)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// 马克笔笔画：中轴微歪的路径 + 变宽轮廓，一次生成多边形（原 demo 逐字保留）
const buildStroke = (len: number, seed: number) => {
  const rand = mulberry32(seed)
  const N = 40
  const top: string[] = []
  const bot: string[] = []
  const wob = Array.from({ length: N + 1 }, () => rand() - 0.5)
  for (let i = 0; i <= N; i++) {
    const t = i / N
    const x = t * len
    const mid = 19 - t * 9 + Math.sin(t * Math.PI * 1.6 + 0.4) * 2.6 + wob[i] * 1.6
    const wBase = 14 + Math.sin(t * Math.PI) * 6 - Math.max(0, t - 0.86) * 46 - Math.max(0, 0.06 - t) * 70
    const w = Math.max(2.2, wBase + wob[i] * 3)
    top.push(`${x.toFixed(1)},${(mid - w / 2).toFixed(1)}`)
    bot.push(`${x.toFixed(1)},${(mid + w / 2).toFixed(1)}`)
  }
  return `M${top.join('L')}L${bot.reverse().join('L')}Z`
}

const LEN = 252
const PATH = buildStroke(LEN, 77)
const MARKER_INK = '#1b1916' // 暖调近黑（马克笔墨，不是纯黑）

/** 文案 DSL：`*词*` 为下划线强调词（与 inkpress title-card 同记法；中文无空格也可用） */
export const parseAccentWords = (text: string) => {
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

export interface MarkerUnderlineTitleProps {
  /** 第一行文案，`*词*` 标下划线强调词 */
  title?: string
  /** 第二行副文案（空则隐藏） */
  sub?: string
  /** 主字号 px */
  fontSize?: number
  /** 总时长（帧，30fps）；尾 8f 淡出 */
  duration?: number
}

export const MARKER_UNDERLINE_TITLE_DEFAULTS: Required<MarkerUnderlineTitleProps> = {
  title: 'Meet the *new*',
  sub: '',
  fontSize: 118,
  duration: MARKER_UNDERLINE_TITLE_DURATION,
}

/** 属性面板 schema（workbench.md §3 字段类型） */
export const MARKER_UNDERLINE_TITLE_SCHEMA = [
  { type: 'text', key: 'title', label: '标题文案（*词* = 下划线强调）', default: 'Meet the *new*', required: true },
  { type: 'text', key: 'sub', label: '第二行副文案（空则隐藏）', default: '' },
  { type: 'slider', key: 'fontSize', label: '主字号', default: 118, min: 64, max: 180, step: 2, unit: 'px' },
  { type: 'number', key: 'duration', label: '总时长', default: MARKER_UNDERLINE_TITLE_DURATION, min: 45, max: 300, step: 1, unit: '帧' },
] as const

export const MarkerUnderlineTitle: React.FC<MarkerUnderlineTitleProps> = (props) => {
  const p = { ...MARKER_UNDERLINE_TITLE_DEFAULTS, ...props }
  const frame = useCurrentFrame()
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const revealId = `reveal-${uid}`
  const dryId = `dry-${uid}`
  const words = parseAccentWords(p.title)
  const duration = Math.max(45, p.duration)

  const line = (delay: number): React.CSSProperties => {
    const e = ramp(frame, delay, 22, EASE.snappy)
    return {
      opacity: Math.min(1, e * 1.4),
      transform: `translateY(${(1 - e) * 36}px)`,
      filter: e < 0.999 ? `blur(${((1 - e) * 8).toFixed(2)}px)` : undefined,
    }
  }

  // 下划线：标题落定停一拍后描画，10 帧从左到右（提速一档），ease-out
  const draw = interpolate(frame, [32, 42], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  })
  const drawE = 1 - Math.pow(1 - draw, 2.2)
  // 整段极缓推近（smooth，起止速度为 0）
  const push = 1 + 0.015 * ramp(frame, 0, 74, EASE.smooth)
  // 尾部淡出跟 duration 走
  const fadeOut = interpolate(frame, [duration - 8, duration], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  })

  const accentWord = (text: string, key: number) => (
    <span key={key} style={{ fontStyle: 'italic', position: 'relative', display: 'inline-block' }}>
      {text}
      <svg
        viewBox={`0 0 ${LEN} 44`} preserveAspectRatio="none"
        style={{ position: 'absolute', left: -12, right: -12, bottom: -20, width: 'calc(100% + 24px)', height: 44, overflow: 'visible', mixBlendMode: 'multiply' }}
      >
        <defs>
          <clipPath id={revealId}>
            <rect x={0} y={-20} width={drawE * (LEN + 6)} height={60} />
          </clipPath>
          <filter id={dryId} x="-5%" y="-40%" width="110%" height="180%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.09 0.5" numOctaves={2} seed={7} result="warp" />
            <feDisplacementMap in="SourceGraphic" in2="warp" scale={1.8} xChannelSelector="R" yChannelSelector="G" result="rough" />
            <feTurbulence type="fractalNoise" baseFrequency="0.035 0.9" numOctaves={2} seed={19} result="grain" />
            <feColorMatrix in="grain" type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -16 11.4" result="holes" />
            <feComposite in="rough" in2="holes" operator="in" />
          </filter>
        </defs>
        {draw > 0 && (
          <g clipPath={`url(#${revealId})`}>
            <path d={PATH} fill={MARKER_INK} fillOpacity={0.94} filter={`url(#${dryId})`} />
          </g>
        )}
      </svg>
    </span>
  )

  return (
    <AbsoluteFill style={{ opacity: fadeOut }}>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', transform: `scale(${push})` }}>
        <div style={{
          fontFamily: FONT.sans,
          fontWeight: 700, fontSize: p.fontSize, color: '#17181c',
          textAlign: 'center', lineHeight: 1.12, letterSpacing: '-0.028em',
        }}>
          <div style={line(0)}>
            {words.map((w, i) => (
              <React.Fragment key={i}>
                {w.accent ? accentWord(w.text, i) : w.text}
              </React.Fragment>
            ))}
          </div>
          {p.sub ? (
            <div style={{ ...line(4), fontSize: Math.round(p.fontSize * 0.24), fontWeight: 500, color: '#4a4c52', marginTop: 28, letterSpacing: '0.02em' }}>
              {p.sub}
            </div>
          ) : null}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
