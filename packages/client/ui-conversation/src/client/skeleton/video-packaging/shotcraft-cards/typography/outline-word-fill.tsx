// ─── 改编来源 ───
// video-shotcraft (Apache License 2.0) · https://github.com/Vincentwei1021/video-shotcraft
// 原卡: demos/typography/outline-word-fill/OutlineWordFill.tsx
// 参考: references/shots/typography/outline-word-fill.md
// （"空心词 3.2 倍急缓收缩落位 → 实心白热字一帧硬切点亮"：单词式利益点的重锤一拍）
// 改动:
//  1. 硬编码文案提为带默认值的 props：word（主词）/ kicker（眉题）/ sub（副行）/
//     beforeLabel+beforeValue / afterLabel+afterValue（左右读数）
//  2. 去掉 video-shotcraft 品牌落款（ShotcraftMark + 品牌名 → kicker prop，默认空）
//  3. 去掉不透明暗底（L.bg + Stage + Dust），改为透明底（alpha 叠加渲染用）；
//     注意：本卡为空心描边+白热字设计，透明底下在亮画面上可读性下降，宜叠在暗画面上
//  4. 节奏命门保持常量：收缩 2–13f / 点亮 POP=54f 硬切 / 虚线圆自转到点亮锁死
//  5. 新增 duration prop：尾 8f 淡出跟 duration 走（原 demo 90f 定长无淡出）
import React from 'react'
import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { LOOKS, alpha, type } from '../_fixtures/Look'
import { mix } from '../_fixtures/Polish'
import { EASE, ramp } from '../_fixtures/Polish'

export const OUTLINE_WORD_FILL_DURATION = 90 // 3.0s @30fps

const L = LOOKS.ember
const CX = 960
const CY = 540
const R = 410 // 虚线圆半径
const POP = 54 // 硬切点亮帧
const STATIC_SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif'

const lerpColor = (a: [number, number, number], b: [number, number, number], t: number) =>
  `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`
const GREY: [number, number, number] = [138, 118, 104] // 暖灰描边 / 制图线
const HOT: [number, number, number] = [255, 196, 150] // 预热后的亮橙白
const ORANGE: [number, number, number] = [255, 107, 44]

const wordScaleAt = (f: number) => mix(3.2, 1, ramp(f, 2, 11, EASE.snappy))

export interface OutlineWordFillProps {
  /** 主词（单词式利益点） */
  word?: string
  /** 眉题（空则隐藏，原为品牌落款） */
  kicker?: string
  /** 副行 */
  sub?: string
  beforeLabel?: string
  beforeValue?: string
  afterLabel?: string
  afterValue?: string
  /** 主字号 px */
  fontSize?: number
  /** 总时长（帧，30fps）；尾 8f 淡出 */
  duration?: number
}

export const OUTLINE_WORD_FILL_DEFAULTS: Required<OutlineWordFillProps> = {
  word: 'Faster',
  kicker: '',
  sub: 'One prompt to a finished promo.',
  beforeLabel: 'BEFORE',
  beforeValue: '1 week',
  afterLabel: 'AFTER',
  afterValue: '4 hrs',
  fontSize: 220,
  duration: OUTLINE_WORD_FILL_DURATION,
}

export const OUTLINE_WORD_FILL_SCHEMA = [
  { type: 'text', key: 'word', label: '主词（单词利益点）', default: 'Faster', required: true },
  { type: 'text', key: 'kicker', label: '眉题（空则隐藏）', default: '' },
  { type: 'text', key: 'sub', label: '副行', default: 'One prompt to a finished promo.' },
  { type: 'text', key: 'beforeLabel', label: '左读数标签', default: 'BEFORE' },
  { type: 'text', key: 'beforeValue', label: '左读数值', default: '1 week' },
  { type: 'text', key: 'afterLabel', label: '右读数标签', default: 'AFTER' },
  { type: 'text', key: 'afterValue', label: '右读数值（点亮时变橙）', default: '4 hrs' },
  { type: 'slider', key: 'fontSize', label: '主字号', default: 220, min: 120, max: 320, step: 4, unit: 'px' },
  { type: 'number', key: 'duration', label: '总时长', default: OUTLINE_WORD_FILL_DURATION, min: 60, max: 300, step: 1, unit: '帧' },
] as const

export const OutlineWordFill: React.FC<OutlineWordFillProps> = (props) => {
  const p = { ...OUTLINE_WORD_FILL_DEFAULTS, ...props }
  const frame = useCurrentFrame()
  const duration = Math.max(60, p.duration)
  const born = ramp(frame, 2, 6, EASE.out)
  const ws = wordScaleAt(frame)
  const zoomBlur = Math.min(6, Math.abs(wordScaleAt(frame + 0.5) - wordScaleAt(frame - 0.5)) * 9)
  const cin = ramp(frame, 8, 10, EASE.out)
  const shrink = ramp(frame, 8, 44, EASE.out)
  const ext = ramp(frame, 28, 18, EASE.out)
  const warm = ramp(frame, 44, 9, EASE.swift)
  const lit = frame >= POP ? 1 : 0 // 硬切：不存在中间态
  const flash = lit * (1 - ramp(frame, POP, 8, EASE.out))
  const lock = lit * (0.55 + 0.45 * flash)
  const shock = ramp(frame, POP, 14, EASE.out)
  const rot = 0.22 * Math.min(frame, POP) + (frame > POP ? 6 * ramp(frame, POP, 14, EASE.out) : 0)
  const rotIn = -0.14 * frame
  const sub = (d: number) => ramp(frame, 56 + d, 14, EASE.snappy)
  const push = 1 + 0.015 * ramp(frame, 0, OUTLINE_WORD_FILL_DURATION, EASE.swift)
  const fadeOut = 1 - ramp(frame, duration - 8, 8, EASE.out)

  const strokeC = lerpColor(GREY, HOT, warm)
  const lineC = lit ? lerpColor([150, 120, 100], ORANGE, lock) : lerpColor(GREY, [150, 120, 100], warm)
  const lineEnd = CX - R - 28

  return (
    <AbsoluteFill style={{ opacity: fadeOut }}>
      <AbsoluteFill style={{ transform: `scale(${push.toFixed(5)})` }}>
        <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: 'absolute', inset: 0 }}>
          {lit > 0 && shock < 1 && (
            <circle cx={CX} cy={CY} r={R + shock * 160} fill="none" stroke={alpha('#ff8a4c', 0.55 * (1 - shock))} strokeWidth={2 + 10 * (1 - shock)} />
          )}
          <g transform={`translate(${CX} ${CY}) scale(${mix(2.8, 1, shrink).toFixed(5)})`} opacity={cin}>
            <g transform={`rotate(${rot.toFixed(3)})`}>
              <circle r={R} fill="none" stroke={lineC} strokeWidth={2} strokeDasharray="22 18" />
              {[0, 90, 180, 270].map(a => (
                <line key={a} x1={0} y1={-R - 22} x2={0} y2={-R + 10} stroke={lineC} strokeWidth={2.5} strokeLinecap="round" transform={`rotate(${a})`} />
              ))}
            </g>
            <g transform={`rotate(${rotIn.toFixed(3)})`}>
              <circle r={R - 34} fill="none" stroke={lineC} strokeWidth={1} opacity={0.35} />
              {Array.from({ length: 72 }, (_, i) => {
                const major = i % 6 === 0
                return (
                  <line key={i} x1={0} y1={-(R - 34)} x2={0} y2={-(R - (major ? 58 : 44))} stroke={lineC}
                    strokeWidth={major ? 2 : 1.2} opacity={major ? 0.7 : 0.32} transform={`rotate(${i * 5})`} />
                )
              })}
            </g>
          </g>
          <line x1={0} y1={CY} x2={lineEnd * ext} y2={CY} stroke={lineC} strokeWidth={2} strokeDasharray="14 12" opacity={ext} />
          <line x1={1920} y1={CY} x2={1920 - lineEnd * ext} y2={CY} stroke={lineC} strokeWidth={2} strokeDasharray="14 12" opacity={ext} />
          <circle cx={lineEnd * ext} cy={CY} r={5} fill={lineC} opacity={ext} />
          <circle cx={1920 - lineEnd * ext} cy={CY} r={5} fill={lineC} opacity={ext} />
        </svg>

        <div style={{ position: 'absolute', left: 120, top: CY - 74, opacity: ext, transform: `translateX(${((1 - ext) * -30).toFixed(2)}px)`, ...type(30, 500, { mono: true }), letterSpacing: '0.12em', color: L.ink3 }}>
          {p.beforeLabel} <span style={{ color: L.ink2 }}>{p.beforeValue}</span>
        </div>
        <div style={{ position: 'absolute', right: 120, top: CY - 74, opacity: ext, transform: `translateX(${((1 - ext) * 30).toFixed(2)}px)`, ...type(30, 500, { mono: true }), letterSpacing: '0.12em', color: L.ink3, textAlign: 'right' }}>
          {p.afterLabel} <span style={{ color: lit ? L.accent : L.ink2, textShadow: lit && flash > 0.02 ? `0 0 ${(18 * flash).toFixed(1)}px ${alpha(L.accent, 0.8)}` : undefined }}>{p.afterValue}</span>
        </div>

        {p.kicker ? (
          <div style={{ position: 'absolute', left: 0, right: 0, top: CY - 200, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, opacity: sub(0), transform: `translateY(${((1 - sub(0)) * 16).toFixed(2)}px)`, ...type(28, 600, { mono: true }), letterSpacing: '0.16em', color: L.ink2 }}>
            <span>{p.kicker}</span>
          </div>
        ) : null}
        {p.sub ? (
          <div style={{ position: 'absolute', left: 0, right: 0, top: CY + 128, textAlign: 'center', opacity: sub(3), transform: `translateY(${((1 - sub(3)) * 16).toFixed(2)}px)`, ...type(40, 450), letterSpacing: '-0.01em', color: L.ink2 }}>
            {p.sub}
          </div>
        ) : null}

        <div style={{
          position: 'absolute', left: CX, top: CY, fontFamily: STATIC_SANS, fontSize: p.fontSize, fontWeight: 500, letterSpacing: '0.005em', lineHeight: 1,
          opacity: born, transform: `translate(-50%, -54%) scale(${ws.toFixed(5)})`, whiteSpace: 'nowrap',
        }}>
          <div style={{
            color: 'transparent', WebkitTextStroke: `2px ${strokeC}`, opacity: 1 - lit,
            filter: zoomBlur > 0.05 ? `blur(${(zoomBlur / ws).toFixed(2)}px)` : warm > 0.01 ? `drop-shadow(0 0 ${(10 * warm).toFixed(1)}px ${alpha('#ff9a5c', 0.5 * warm)})` : undefined,
          }}>
            {p.word}
          </div>
          <div style={{
            position: 'absolute', inset: 0, color: '#fff5ee', opacity: lit,
            textShadow: flash > 0.01 ? `0 0 ${(14 * flash).toFixed(1)}px rgba(255,255,255,${(0.7 * flash).toFixed(3)}), 0 0 ${(60 * flash).toFixed(1)}px ${alpha(L.accent, 0.65 * flash)}` : `0 0 40px ${alpha(L.accent, 0.18)}`,
          }}>
            {p.word}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
