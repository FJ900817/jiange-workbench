// ─── 改编来源 ───
// video-shotcraft (Apache License 2.0) · https://github.com/Vincentwei1021/video-shotcraft
// 原卡: demos/ui-entrance/draw-svg-trace/DrawSvgTrace.tsx
// 参考: references/shots/ui-entrance/draw-svg-trace.md
// 改动:
//  1. 硬编码文案提为带默认值的 props：title（默认 'Cuts on the beat'）/
//     bigNumber（默认 '100%'）/ desc（默认 'Every cut snaps to the downbeat. Rendered by video-shotcraft.'，
//     品牌词已改为中性 'Rendered in Remotion.'）/ brand（默认 'Studio'）/ byline（默认 'agent · rendered 2m ago'）
//  2. 去掉 video-shotcraft 品牌（ShotcraftMark → 中性圆点；BRAND.name → brand prop）
//  3. 去掉 Stage（浅场），改为透明底；本卡为浅场设计，宜叠在浅画面上
//  4. 描边节奏命门保持常量（TRACE0/TRACE1 描边 / 50–52 闭合闪 / 74–92 下划线）
//  5. 柱图 BARS/MONTHS 为数据纹理，原样保留
//  6. 新增 duration prop：尾 8f 淡出跟 duration 走（不传则无淡出）

import React from 'react'
import { AbsoluteFill, useCurrentFrame, interpolate, Easing } from 'remotion'
import { EASE, FONT, ramp, softShadow } from '../_fixtures/Polish'
import { LOOKS, alpha, type } from '../_fixtures/Look'

export const DRAW_SVG_TRACE_DURATION = 132

const L = LOOKS.paper
const CW = 1120
const CH = 660
const CX = (1920 - CW) / 2 // 400
const CY = (1080 - CH) / 2 // 210
const RX = 28 // 与卡片圆角一致（交棒不错型）
const PEN = 0.04 // 笔头 dash 长度（占整圈比例）
const INK = L.ink
const TRACE0 = 10, TRACE1 = 50

// 圆角矩形轮廓上弧长比例 u∈[0,1] 的点（与 SVG <rect> 的路径起点/方向一致：从上边 (x+rx, y) 顺时针）
const rrPoint = (u: number, x: number, y: number, w: number, h: number, r: number): [number, number] => {
  const sx = w - 2 * r, sy = h - 2 * r, arc = (Math.PI * r) / 2
  const Ltot = 2 * sx + 2 * sy + 4 * arc
  let s = (((u % 1) + 1) % 1) * Ltot
  const segs: Array<[number, (k: number) => [number, number]]> = [
    [sx, k => [x + r + k * sx, y]],
    [arc, k => [x + w - r + r * Math.sin((k * Math.PI) / 2), y + r - r * Math.cos((k * Math.PI) / 2)]],
    [sy, k => [x + w, y + r + k * sy]],
    [arc, k => [x + w - r + r * Math.cos((k * Math.PI) / 2), y + h - r + r * Math.sin((k * Math.PI) / 2)]],
    [sx, k => [x + w - r - k * sx, y + h]],
    [arc, k => [x + r - r * Math.sin((k * Math.PI) / 2), y + h - r + r * Math.cos((k * Math.PI) / 2)]],
    [sy, k => [x, y + h - r - k * sy]],
    [arc, k => [x + r - r * Math.cos((k * Math.PI) / 2), y + r - r * Math.sin((k * Math.PI) / 2)]],
  ]
  for (const [len, f] of segs) {
    if (s <= len) return f(len > 0 ? s / len : 0)
    s -= len
  }
  return [x + r, y]
}

const BARS = [34, 40, 37, 48, 45, 54, 58, 56, 66, 74, 81, 96]
const MONTHS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'] // 镜头 A–L（沿用原变量名）

// 下划线：略带弧度的手绘笔画（本地坐标，宽 300）
const UL_PATH = 'M4,14 C70,6 150,18 230,9 S290,10 300,8'

export interface DrawSvgTraceProps {
  /** 大标题 */
  title?: string
  /** 大数字 */
  bigNumber?: string
  /** 说明句 */
  desc?: string
  /** 字标 */
  brand?: string
  /** 署名副行 */
  byline?: string
  /** 总时长（帧，30fps）；尾 8f 淡出 */
  duration?: number
}

export const DRAW_SVG_TRACE_DEFAULTS: Required<DrawSvgTraceProps> = {
  title: 'Cuts on the beat',
  bigNumber: '100%',
  desc: 'Every cut snaps to the downbeat. Rendered in Remotion.',
  brand: 'Studio',
  byline: 'agent · rendered 2m ago',
  duration: DRAW_SVG_TRACE_DURATION,
}

export const DRAW_SVG_TRACE_SCHEMA = [
  { type: 'text', key: 'title', label: '大标题', default: 'Cuts on the beat', required: true },
  { type: 'text', key: 'bigNumber', label: '大数字', default: '100%' },
  { type: 'text', key: 'desc', label: '说明句', default: 'Every cut snaps to the downbeat. Rendered in Remotion.' },
  { type: 'text', key: 'brand', label: '字标', default: 'Studio' },
  { type: 'text', key: 'byline', label: '署名副行', default: 'agent · rendered 2m ago' },
  { type: 'number', key: 'duration', label: '总时长', default: DRAW_SVG_TRACE_DURATION, min: 60, max: 400, step: 1, unit: '帧' },
] as const

export const DrawSvgTrace: React.FC<DrawSvgTraceProps> = (props) => {
  const cfg = { ...DRAW_SVG_TRACE_DEFAULTS, ...props }
  const frame = useCurrentFrame()
  const tailFade = cfg.duration ? 1 - ramp(frame, cfg.duration - 8, 8, EASE.out) : 1

  const p = interpolate(frame, [TRACE0, TRACE1], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) })

  // 闭合闪：50–52 冲峰，52–58 回落（纯黑 + 加粗，不发光）
  const flash = frame < 52 ? ramp(frame, 50, 2, EASE.linear) : 1 - ramp(frame, 52, 6, EASE.out)
  const strokeW = 6 + flash * 5
  const strokeColor = flash > 0.5 ? '#000000' : INK

  const traceOp = 1 - ramp(frame, 56, 10, EASE.linear)
  const borderOp = 1 - traceOp
  const lift = ramp(frame, 50, 22, EASE.out)
  const inkIn = (k: number) => ramp(frame, 52 + k * 3, 12, EASE.out)
  const rise = (k: number): React.CSSProperties => {
    const t = inkIn(k)
    return { opacity: t, transform: `translateY(${((1 - t) * 14).toFixed(2)}px)`, filter: t < 1 ? `blur(${((1 - t) * 6).toFixed(2)}px)` : undefined }
  }

  const penOp = interpolate(p, [0, 0.02, 0.97, 0.995], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const [nx, ny] = rrPoint(p, 0, 0, CW, CH, RX)

  // 裁切标记：0–12 长出，闭合时外弹 + 淡出
  const marksIn = (k: number) => ramp(frame, k * 2, 12, EASE.snappy)
  const marksPop = ramp(frame, 50, 10, EASE.out)
  const marksOp = 1 - ramp(frame, 52, 12, EASE.out)

  // 下划线
  const up = interpolate(frame, [74, 92], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) })
  const upenOp = interpolate(up, [0, 0.04, 0.92, 0.99], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  const push = 1 + 0.009 * ramp(frame, 60, 72, EASE.smooth)

  return (
    <AbsoluteFill style={{ fontFamily: FONT.sans, overflow: 'hidden', opacity: tailFade }}>
      {/* 绘图纸点阵：48px 网格的墨点，中心清晰、四周隐去——描边阶段的"画板"，也给第 1 帧一个底 */}
      <div
        style={{
          position: 'absolute', inset: 0,
          backgroundImage: `radial-gradient(circle, ${alpha(L.ink, 0.24)} 2px, transparent 2.4px)`,
          backgroundSize: '48px 48px', backgroundPosition: '24px 18px',
          WebkitMaskImage: 'radial-gradient(ellipse 62% 66% at 50% 50%, #000 30%, transparent 100%)',
          maskImage: 'radial-gradient(ellipse 62% 66% at 50% 50%, #000 30%, transparent 100%)',
        }}
      />

      <AbsoluteFill style={{ transform: `scale(${push.toFixed(5)})`, transformOrigin: '960px 540px' }}>
        {/* 卡片底面：闭合后上墨、从贴地升起 */}
        <div
          style={{
            position: 'absolute', left: CX, top: CY, width: CW, height: CH, borderRadius: RX,
            background: `linear-gradient(180deg, #fffefb 0%, ${L.surface} 100%)`,
            boxShadow: `inset 0 1px 0 #ffffff, ${softShadow(4 + lift * 26, { color: L.shadow, strength: 0.9 })}`,
            opacity: ramp(frame, 50, 10, EASE.out),
          }}
        />

        {/* 卡片内容 */}
        <div style={{ position: 'absolute', left: CX, top: CY, width: CW, height: CH, padding: '52px 64px 46px', boxSizing: 'border-box' }}>
          {/* 眉题行 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, ...rise(0) }}>
            <div style={{ width: 12, height: 12, borderRadius: 6, background: L.accent }} />
            <div style={{ ...type(26, 600, { mono: true }), letterSpacing: '0.14em', color: L.ink2 }}>LAUNCH FILM · RENDER</div>
            <div style={{ flex: 1 }} />
            <div style={{ ...type(26, 500, { mono: true }), color: L.ink3 }}>v3 · 1080p30</div>
          </div>

          {/* 左栏：两段式大标题 + 说明 */}
          <div style={{ position: 'absolute', left: 64, top: 128, width: 560 }}>
            <div style={{ ...type(72, 650), color: L.ink2, ...rise(1) }}>{cfg.title}</div>
            <div style={{ position: 'relative', display: 'inline-block', marginTop: 2, ...rise(2) }}>
              {/* 四位数比原「38%」宽：字号 212→188 给右栏柱图留出呼吸 */}
              <div style={{ ...type(188, 820), letterSpacing: '-0.055em', color: L.ink, lineHeight: 0.92 }}>{cfg.bigNumber}</div>
              {/* 第二用法：重点词下方一笔朱红马克笔下划线 */}
              {up > 0.001 && (
                <svg width={300} height={24} viewBox="0 0 300 24" style={{ position: 'absolute', left: 6, bottom: -26, width: 'calc(100% - 12px)', overflow: 'visible' }} preserveAspectRatio="none">
                  <path d={UL_PATH} fill="none" stroke={L.accent} strokeWidth={12} strokeLinecap="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - up} opacity={0.92} />
                  {upenOp > 0 && (
                    <path d={UL_PATH} fill="none" stroke={L.accent} strokeWidth={16} strokeLinecap="round" pathLength={1}
                      strokeDasharray={`${0.06} ${0.94}`} strokeDashoffset={0.06 - up} opacity={upenOp} />
                  )}
                </svg>
              )}
            </div>
            <div style={{ marginTop: 44, ...type(32, 450), lineHeight: 1.35, color: L.ink2, ...rise(3) }}>
              {cfg.desc}
            </div>
          </div>

          {/* 右栏：逐镜头能量柱（从基线长出，末三根朱红） */}
          <div style={{ position: 'absolute', left: 680, top: 150, width: 376, height: 300, display: 'flex', alignItems: 'flex-end', gap: 10, opacity: inkIn(3) > 0 ? 1 : 0 }}>
            {BARS.map((v, i) => {
              const g = ramp(frame, 56 + i * 1.5, 14, EASE.snappy)
              const hot = i >= 9
              return (
                <div key={i} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}>
                  <div
                    style={{
                      width: '100%', height: `${(v * g).toFixed(2)}%`, borderRadius: 8,
                      background: hot ? `linear-gradient(180deg, #f2674f 0%, ${L.accent} 100%)` : alpha(L.ink, 0.1),
                      opacity: hot ? 0.6 + (i - 9) * 0.2 : 1,
                    }}
                  />
                </div>
              )
            })}
          </div>
          <div style={{ position: 'absolute', left: 680, top: 462, width: 376, display: 'flex', gap: 10, ...rise(4) }}>
            {MONTHS.map((m, i) => (
              <div key={i} style={{ flex: 1, textAlign: 'center', ...type(20, 600, { mono: true }), color: i >= 9 ? L.accent : L.ink3 }}>{m}</div>
            ))}
          </div>
          <div style={{ position: 'absolute', left: 680, top: 128, ...type(22, 600, { mono: true }), letterSpacing: '0.1em', color: L.ink3, ...rise(4) }}>ENERGY · PER SHOT</div>

          {/* 署名行：video-shotcraft 标志 + 字标（亮底用 light 版） */}
          <div style={{ position: 'absolute', left: 64, right: 64, bottom: 44, display: 'flex', alignItems: 'center', gap: 16, ...rise(5) }}>
            <div style={{ position: 'absolute', left: 0, right: 0, top: -26, height: 1, background: L.line }} />
            <span style={{ width: 52, height: 52, borderRadius: '50%', background: L.ink3, opacity: 0.5, display: 'inline-block' }} />
            <div style={{ ...type(28, 700), letterSpacing: '0.03em', color: L.ink }}>{cfg.brand}</div>
            <div style={{ ...type(28, 450), color: L.ink3 }}>{cfg.byline}</div>
          </div>
        </div>

        {/* 卡片自身发丝边：描边淡出时接棒 */}
        <div style={{ position: 'absolute', left: CX, top: CY, width: CW, height: CH, borderRadius: RX, border: `1.5px solid ${alpha(L.ink, 0.14)}`, boxSizing: 'border-box', opacity: borderOp }} />

        {/* 裁切标记（印刷对位线）：四角外侧 */}
        {marksOp > 0.001 && (
          <svg width={1920} height={1080} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', opacity: marksOp }}>
            {[[CX, CY, -1, -1], [CX + CW, CY, 1, -1], [CX + CW, CY + CH, 1, 1], [CX, CY + CH, -1, 1]].map(([x, y, sx, sy], k) => {
              const t = marksIn(k)
              const off = 26 + 22 * marksPop
              const len = 54 * t
              const ox = x + sx * off, oy = y + sy * off
              return (
                <g key={k} stroke={L.ink2} strokeWidth={2.5} strokeLinecap="round">
                  <line x1={ox} y1={oy} x2={ox - sx * len} y2={oy} opacity={t} />
                  <line x1={ox} y1={oy} x2={ox} y2={oy - sy * len} opacity={t} />
                  <circle cx={ox} cy={oy} r={3.5} fill={L.accent} stroke="none" opacity={t} />
                </g>
              )
            })}
          </svg>
        )}

        {/* 描边生长层：主线 + 渐细笔头 + 圆形笔尖 */}
        {traceOp > 0.001 && (
          <svg width={CW} height={CH} style={{ position: 'absolute', left: CX, top: CY, overflow: 'visible', opacity: traceOp }}>
            <rect x={0} y={0} width={CW} height={CH} rx={RX} fill="none" stroke={strokeColor} strokeWidth={strokeW}
              pathLength={1} strokeDasharray="1" strokeDashoffset={1 - p} strokeLinecap="round" />
            {penOp > 0 &&
              [
                { len: PEN, w: 6.4 },
                { len: PEN * 0.6, w: 8 },
                { len: PEN * 0.28, w: 9.6 },
              ].map(({ len, w }, k) => (
                <rect key={k} x={0} y={0} width={CW} height={CH} rx={RX} fill="none" stroke={INK} strokeWidth={w} opacity={penOp}
                  pathLength={1} strokeDasharray={`${len} ${1 - len}`} strokeDashoffset={len - p} strokeLinecap="round" />
              ))}
            {penOp > 0 && (
              <g opacity={penOp}>
                <circle cx={nx + 1.5} cy={ny + 4} r={10} fill={alpha(L.shadow, 0.16)} />
                <circle cx={nx} cy={ny} r={7.5} fill={INK} />
                <circle cx={nx - 2.2} cy={ny - 2.4} r={2} fill="rgba(255,255,255,0.4)" />
              </g>
            )}
          </svg>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
