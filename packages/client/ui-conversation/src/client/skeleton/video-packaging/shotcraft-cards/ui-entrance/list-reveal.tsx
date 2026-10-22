// ─── 改编来源 ───
// video-shotcraft (Apache License 2.0) · https://github.com/Vincentwei1021/video-shotcraft
// 原卡: demos/ui-entrance/list-reveal/ListReveal.tsx
// 参考: references/shots/ui-entrance/list-reveal.md
// 改动:
//  1. 硬编码文案提为带默认值的 props：items（6 个菜单项，label/key 对；接受数组或
//     "label|key" 换行分隔，最多 8 项；图标按序号 6 键轮换）
//  2. 去掉 Stage（graphite 暗场），改为透明底；Dust 粒子保留；本卡为暗场设计，宜叠在暗画面上
//  3. 节奏命门保持常量（START=2f / STAGGER=10f / EACH=24f / 软过冲 1.5% / 全程线性漂移）
//  4. 新增 duration prop：尾 8f 淡出跟 duration 走（不传则无淡出）

import React from 'react'
import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { EASE, bezier, ramp } from '../_fixtures/Polish'
import { Dust, LOOKS, Sheen, TextReveal, alpha, type } from '../_fixtures/Look'

export const LIST_REVEAL_DURATION = 120

const L = LOOKS.graphite

const ITEMS_FALLBACK = [
  { label: 'Home', key: '⌘1' },
  { label: 'Shots', key: '⌘2' },
  { label: 'Renders', key: '⌘3' },
  { label: 'Reviews', key: '' },
  { label: 'Settings', key: '⌘,' },
  { label: 'Sign out', key: '' },
]

const ROW_W = 700
const ROW_H = 92
const GAP = 14
const LIST_X = 170
const LIST_Y = 236 // 漂移中点处的列表顶
const DRIFT = 96 // 全程总漂移（+48 → −48）

const START = 2 // 首项起点
const STAGGER = 10
const EACH = 24
const softBack = bezier(0.3, 1.18, 0.5, 1) // 软过冲 ~1.5%

const Icon: React.FC<{ i: number; color: string }> = ({ i, color }) => {
  const p = { fill: 'none', stroke: color, strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <svg width={34} height={34} viewBox="0 0 24 24">
      {i === 0 && (<><path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19Z" {...p} /><path d="M9.5 20.5v-6h5v6" {...p} /></>)}
      {i === 1 && <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.2h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" {...p} />}
      {i === 2 && (<><rect x={3.5} y={5} width={17} height={14} rx={2.5} {...p} /><path d="M10.2 9.2v5.6l4.6-2.8Z" {...p} /></>)}
      {i === 3 && <path d="M4 6.5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2V14a2 2 0 0 1-2 2h-7l-4.5 3.5V16H6a2 2 0 0 1-2-2Z" {...p} />}
      {i === 4 && (<><circle cx={12} cy={12} r={3} {...p} /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" {...p} /></>)}
      {i === 5 && (<><path d="M14 4h3.5A1.5 1.5 0 0 1 19 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14" {...p} /><path d="M10 8l-4 4 4 4M6 12h9" {...p} /></>)}
    </svg>
  )
}

export interface ListRevealProps {
  /** 菜单项（label/key 对数组，或 "label|key" 换行分隔） */
  items?: { label: string; key: string }[] | string
  /** 右侧眉题 */
  kicker?: string
  /** 右侧大标题（\n 换行） */
  headline?: string
  /** 右侧副句（\n 换行） */
  sub?: string
  /** 总时长（帧，30fps）；尾 8f 淡出 */
  duration?: number
}

export const LIST_REVEAL_DEFAULTS: Required<Omit<ListRevealProps, 'items'>> & { items: { label: string; key: string }[] } = {
  items: ITEMS_FALLBACK,
  kicker: 'video-shotcraft · workbench',
  headline: 'Every shot,\nwithin reach.',
  sub: 'Every recipe, render and storyboard,\none keystroke away.',
  duration: LIST_REVEAL_DURATION,
}

export const LIST_REVEAL_SCHEMA = [
  { type: 'textarea', key: 'items', label: '菜单项（每行 label|key）', default: ITEMS_FALLBACK.map(i => `${i.label}|${i.key}`).join('\n') },
  { type: 'text', key: 'kicker', label: '右侧眉题', default: 'video-shotcraft · workbench' },
  { type: 'text', key: 'headline', label: '右侧大标题', default: 'Every shot,\\nwithin reach.' },
  { type: 'text', key: 'sub', label: '右侧副句', default: 'Every recipe, render and storyboard,\\none keystroke away.' },
  { type: 'number', key: 'duration', label: '总时长', default: LIST_REVEAL_DURATION, min: 60, max: 400, step: 1, unit: '帧' },
] as const

export const ListReveal: React.FC<ListRevealProps> = (props) => {
  const p = { ...LIST_REVEAL_DEFAULTS, ...props }
  const ITEMS = (Array.isArray(p.items) ? p.items : String(p.items).split(/[\n]+/).map((ln) => {
    const [label, key] = ln.split('|')
    return { label: (label || '').trim(), key: (key || '').trim() }
  }).filter(i => i.label)).slice(0, 8)
  const frame = useCurrentFrame()
  const tailFade = p.duration ? 1 - ramp(frame, p.duration - 8, 8, EASE.out) : 1
  // 整体漂移：全程匀速（"呼吸"层，故意线性，与逐项曲线无关）
  const drift = DRIFT / 2 - (DRIFT * frame) / (LIST_REVEAL_DURATION - 1)

  return (
    <AbsoluteFill style={{ background: 'transparent', overflow: 'hidden', opacity: tailFade }}>
      <Dust look={L} count={22} seed={7} drift={0.12} opacity={0.3} />

      {/* 列表：整体漂移层 */}
      <div style={{ position: 'absolute', left: LIST_X, top: LIST_Y, width: ROW_W, transform: `translateY(${drift.toFixed(3)}px)` }}>
        {ITEMS.map((it, i) => {
          const t0 = START + i * STAGGER
          const lin = ramp(frame, t0, EACH, EASE.linear)
          const p = softBack(lin)
          const pIcon = softBack(ramp(frame, t0 + 2, EACH, EASE.linear))
          const pKey = ramp(frame, t0 + 4, EACH - 4, EASE.out)
          const active = i === 0
          const last = i === ITEMS.length - 1
          const y = i * (ROW_H + GAP) + (last ? 22 : 0)
          const blur = (1 - EASE.out(lin)) * 8
          return (
            <React.Fragment key={i}>
              {last && (
                <div style={{
                  position: 'absolute', left: 24, right: 24, top: y - 18, height: 1, background: alpha('#ffffff', 0.1),
                  transform: `scaleX(${ramp(frame, t0, EACH, EASE.snappy).toFixed(4)})`, transformOrigin: '0 50%',
                }} />
              )}
              <div style={{
                position: 'absolute', left: 0, top: y, width: ROW_W, height: ROW_H, borderRadius: 24, boxSizing: 'border-box',
                display: 'flex', alignItems: 'center', gap: 26, padding: '0 34px 0 30px',
                background: active ? 'linear-gradient(180deg, #f7f6f2 0%, #e9e8e3 100%)' : 'linear-gradient(180deg, #1c1d21 0%, #161719 100%)',
                boxShadow: active
                  ? `inset 0 1px 0 #ffffff, 0 18px 40px -14px rgba(0,0,0,0.75), 0 0 60px -10px ${alpha('#ffffff', 0.16)}`
                  : `inset 0 0 0 1px ${alpha('#ffffff', 0.07)}, inset 0 1px 0 ${alpha('#ffffff', 0.06)}, 0 14px 30px -14px rgba(0,0,0,0.8)`,
                opacity: Math.min(1, lin * 2.2),
                filter: blur > 0.3 ? `blur(${blur.toFixed(2)}px)` : undefined,
                transform: `translateY(${((1 - p) * 44).toFixed(2)}px) scale(${(0.82 + 0.18 * p).toFixed(4)})`,
                transformOrigin: '30% 50%', overflow: 'hidden',
              }}>
                {/* 当前项落位后一次扫光（Q4：只给主角一次，裁进圆角） */}
                {active && <Sheen progress={ramp(frame, 22, 26, EASE.swift)} strength={0.6} width={0.18} />}
                <div style={{
                  width: 56, height: 56, borderRadius: 16, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: active ? alpha('#000000', 0.06) : alpha('#ffffff', 0.05),
                  transform: `scale(${(0.72 + 0.28 * pIcon).toFixed(4)})`, opacity: Math.min(1, Math.max(0, pIcon) * 2),
                }}>
                  <Icon i={i} color={active ? '#141416' : last ? L.ink3 : L.ink2} />
                </div>
                <div style={{ ...type(46, active ? 680 : 560), color: active ? '#0f0f11' : last ? L.ink3 : L.ink, whiteSpace: 'nowrap' }}>{it.label}</div>
                <div style={{ marginLeft: 'auto', opacity: pKey, transform: `translateX(${((1 - pKey) * 14).toFixed(2)}px)` }}>
                  {i === 3 ? (
                    <div style={{
                      minWidth: 50, height: 40, padding: '0 14px', boxSizing: 'border-box', borderRadius: 20, background: L.accent2,
                      color: '#1a1408', display: 'flex', alignItems: 'center', justifyContent: 'center', ...type(26, 750),
                      boxShadow: `0 0 24px -4px ${alpha(L.accent2, 0.7)}`,
                    }}>3</div>
                  ) : it.key ? (
                    <div style={{ ...type(26, 500, { mono: true }), color: active ? alpha('#000000', 0.45) : L.ink3 }}>{it.key}</div>
                  ) : null}
                </div>
              </div>
            </React.Fragment>
          )
        })}
      </div>

      {/* 右侧标题：列表铺到一半才进 */}
      <div style={{ position: 'absolute', left: 1010, top: 336, width: 780 }}>
        <div style={{ ...type(24, 600, { mono: true }), letterSpacing: '0.16em', color: L.accent2, opacity: ramp(frame, 40, 16, EASE.out) }}>
          {p.kicker}
        </div>
        <div style={{ ...type(120, 760), color: L.ink, marginTop: 26 }}>
          <TextReveal text={p.headline} by="line" start={46} each={22} gap={7} />
        </div>
        <div style={{
          ...type(36, 450), color: L.ink2, marginTop: 34, lineHeight: 1.35, maxWidth: 760, whiteSpace: 'pre-line',
          opacity: ramp(frame, 66, 18, EASE.out), transform: `translateY(${((1 - ramp(frame, 66, 18, EASE.snappy)) * 16).toFixed(2)}px)`,
        }}>
          {p.sub}
        </div>
      </div>
    </AbsoluteFill>
  )
}
