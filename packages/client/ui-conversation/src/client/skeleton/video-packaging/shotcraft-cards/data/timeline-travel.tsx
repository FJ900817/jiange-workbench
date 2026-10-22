// ─── 改编来源 ───
// video-shotcraft (Apache License 2.0) · https://github.com/Vincentwei1021/video-shotcraft
// 原卡: demos/data/timeline-travel/TimelineTravel.tsx
// 参考: references/shots/data/timeline-travel.md
// 改动:
//  1. 硬编码文案提为带默认值的 props：events（每行 label|year|far|title|desc|metric）/
//     kicker（页眉眉题，默认 'Release history'）/ headline（默认 'Shipping every month'）
//  2. 去掉 video-shotcraft 品牌（ShotcraftMark → 中性圆点）
//  3. 去掉 Backdrop，改为透明底；为浅场设计，宜叠浅画面
//  4. 节奏命门保持常量（TRAVEL_START→TRAVEL_END 相机穿越 / 急停帧 / 视差大字）
//  5. 新增 duration prop：尾 8f 淡出跟 duration 走（不传则无淡出）

import React from 'react'
import { EASE, FONT, Grain, SpeedBlur, innerHighlight, softShadow, tracking, ramp, mix } from '../_fixtures/Polish'
import { useCurrentFrame, interpolate, Easing, spring } from 'remotion'
import { G } from '../_fixtures/Fixtures'

export const TIMELINE_TRAVEL_DURATION = 160

const W = 1920
const AXIS_Y = 700
const TICK_GAP = 1400 // 刻度间距（世界坐标）
const TICKS_FALLBACK = [
  { label: 'v1.0', year: 'Jul 2026', far: 'Jul', title: 'Public launch', desc: 'Shot recipe cards, a template and a gallery.', metric: 'Remotion render' },
  { label: 'v2.0', year: 'Aug 2026', far: 'Aug', title: 'Camera & sound', desc: '2.5D camera moves with beat-synced SFX.', metric: 'Beat-synced cuts' },
  { label: 'v3.0', year: 'Sep 2026', far: 'Sep', title: 'Motion workbench', desc: 'Every shot, tuned in one place.', metric: 'Live preview' },
  { label: 'Today', year: 'Oct 2026', far: 'Oct', title: 'One-prompt promos', desc: 'Direct the film. Let the agent shoot it.', metric: 'Claude Code & Codex' },
]
const WORLD_W_OF = (n: number) => 960 + TICK_GAP * (n - 1) + 960

const TRAVEL_START = 12
const TRAVEL_END = 104 // 急停帧
const ZOOM_END = 114

// 相机 X：in-out 但前段慢后段快（poly(3) in 为主，末端 out 急收）
// 用两段拼：0–0.82 加速段（Easing.in(poly(2.2))），0.82–1 急刹段
const camXAt = (f: number, total: number): number => {
  const t = interpolate(f, [TRAVEL_START, TRAVEL_END], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  // 加速→巡航→急刹：分段缓动，前 15% 缓起，中段近匀加速冲刺，末 12% 急收
  const eased = interpolate(t, [0, 0.15, 0.88, 1], [0, 0.055, 0.9, 1], {
    easing: Easing.inOut(Easing.quad),
  })
  return eased * total
}

// 每张卡的弹立帧：相机中心扫过该刻度的时刻（数值上预先求好，避免逐帧求逆）
// 通过 camXAt 反查：找到 camX == tick.x - 960 的帧
const popFrameOf = (tickX: number, total: number): number => {
  for (let f = TRAVEL_START; f <= TRAVEL_END; f++) {
    if (camXAt(f, total) >= tickX - 960) return f
  }
  return TRAVEL_END
}

const CARD_W = 360
const CARD_H = 240
const STEM = 36 // 卡底到轴的连杆长度


export interface TimelineTravelProps {
  /** 事件（每行 label|year|far|title|desc|metric） */
  events?: { label: string; year: string; far: string; title: string; desc: string; metric: string }[] | string
  /** 页眉眉题 */
  kicker?: string
  /** 页眉标题 */
  headline?: string
  /** 总时长（帧，30fps）；尾 8f 淡出 */
  duration?: number
}

export const TIMELINE_TRAVEL_DEFAULTS: Required<Omit<TimelineTravelProps, 'events'>> & {
  events: { label: string; year: string; far: string; title: string; desc: string; metric: string }[]
} = {
  events: TICKS_FALLBACK,
  kicker: 'Release history',
  headline: 'Shipping every month',
  duration: TIMELINE_TRAVEL_DURATION,
}

export const TIMELINE_TRAVEL_SCHEMA = [
  { type: 'textarea', key: 'events', label: '事件（每行 label|year|far|title|desc|metric）',
    default: TICKS_FALLBACK.map(t => `${t.label}|${t.year}|${t.far}|${t.title}|${t.desc}|${t.metric}`).join('\n') },
  { type: 'text', key: 'kicker', label: '页眉眉题', default: 'Release history' },
  { type: 'text', key: 'headline', label: '页眉标题', default: 'Shipping every month' },
  { type: 'number', key: 'duration', label: '总时长', default: TIMELINE_TRAVEL_DURATION, min: 80, max: 400, step: 1, unit: '帧' },
] as const

export const TimelineTravel: React.FC<TimelineTravelProps> = (props) => {
  const p = { ...TIMELINE_TRAVEL_DEFAULTS, ...props }
  const TICKS = (Array.isArray(p.events) ? p.events : String(p.events).split(/\n+/).map((ln) => {
    const [label = '', year = '', far = '', title = '', desc = '', metric = ''] = ln.split('|').map(s => s.trim())
    return { label, year, far, title, desc, metric }
  }).filter(t => t.label || t.title)).slice(0, 6).map((t, i) => ({ ...t, x: 960 + TICK_GAP * i }))
  const total = TICK_GAP * (TICKS.length - 1) // 需要位移的世界距离

  const MilestoneCard: React.FC<{ i: number }> = ({ i }) => {
    const t = TICKS[i]
    const hero = i === TICKS.length - 1
    return (
      <div
        style={{
          width: CARD_W,
          height: CARD_H,
          boxSizing: 'border-box',
          borderRadius: 18,
          padding: '24px 26px',
          background: hero ? 'linear-gradient(180deg, #ffffff 0%, #f7f7ff 100%)' : '#ffffff',
          border: hero ? '1px solid rgba(91,99,211,0.35)' : `1px solid ${G.hairline}`,
          boxShadow: `${innerHighlight(0.9)}, ${softShadow(hero ? 18 : 8, { strength: hero ? 1.3 : 1 })}`,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: FONT.sans,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              height: 30,
              padding: '0 12px',
              borderRadius: 8,
              background: hero ? G.accent : G.fill,
              color: hero ? '#fff' : G.ink2,
              fontFamily: FONT.mono,
              fontSize: 18,
              fontWeight: 650,
              lineHeight: '30px',
            }}
          >
            {hero ? 'v4.0' : t.label}
          </div>
          <div style={{ marginLeft: 'auto', fontSize: 20, color: G.ink3, fontVariantNumeric: 'tabular-nums' }}>{t.year}</div>
        </div>
        <div style={{ marginTop: 18, fontSize: 32, fontWeight: 700, letterSpacing: tracking(32), color: G.ink1 }}>{t.title}</div>
        <div style={{ marginTop: 8, fontSize: 23, lineHeight: 1.3, color: G.ink2 }}>{t.desc}</div>
        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 8, fontSize: 20, fontWeight: 600, color: hero ? G.accent : G.ink3 }}>
          <div style={{ width: 8, height: 8, borderRadius: 4, background: hero ? G.accent : '#c4c6cc' }} />
          {t.metric}
        </div>
      </div>
    )
  };

  const TickStop: React.FC<{ i: number; frame: number }> = ({ i, frame }) => {
    const tick = TICKS[i]
    const hero = i === TICKS.length - 1
    const pop = popFrameOf(tick.x, total) - 6 // 提前 6f 起弹，掠过时正好立起
    const s = spring({
      frame: frame - pop,
      fps: 30,
      config: { damping: 11, stiffness: 160, mass: 0.9 }, // 明显过冲
      durationInFrames: 26,
    })
    const appeared = frame >= pop
    // 节点被"点亮"：卡片起弹同拍从空心灰变实心
    const lit = interpolate(frame, [pop, pop + 6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

    return (
      <div style={{ position: 'absolute', left: tick.x, top: 0 }}>
        {/* 刻度节点：外圈光晕 + 实心芯 */}
        <div
          style={{
            position: 'absolute',
            left: -16,
            top: AXIS_Y - 16,
            width: 32,
            height: 32,
            borderRadius: 16,
            background: hero ? 'rgba(91,99,211,0.16)' : 'rgba(20,22,28,0.06)',
            transform: `scale(${(0.6 + 0.4 * lit).toFixed(3)})`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: -8,
            top: AXIS_Y - 8,
            width: 16,
            height: 16,
            borderRadius: 8,
            boxSizing: 'border-box',
            border: `3px solid ${hero ? G.accent : G.ink1}`,
            background: lit > 0.5 ? (hero ? G.accent : G.ink1) : '#f4f4f2',
          }}
        />
        {/* 刻度标签：版本 + 年份 */}
        <div style={{ position: 'absolute', left: -110, top: AXIS_Y + 34, width: 220, textAlign: 'center', fontFamily: FONT.sans }}>
          <div style={{ fontWeight: 720, fontSize: 40, letterSpacing: tracking(40), color: hero ? G.accent : G.ink1 }}>{tick.label}</div>
          <div style={{ marginTop: 2, fontSize: 28, fontWeight: 500, color: G.ink3, fontVariantNumeric: 'tabular-nums' }}>{tick.year}</div>
        </div>
        {/* 卡片从刻度线弹立：以底边为轴 scaleY 0→1（带过冲），伴随轻微横向收拢 */}
        {appeared && (
          <>
            <div
              style={{
                position: 'absolute',
                left: -0.5,
                top: AXIS_Y - 8 - STEM * Math.min(1, s),
                width: 1,
                height: STEM * Math.min(1, s),
                background: hero ? 'rgba(91,99,211,0.5)' : 'rgba(20,22,28,0.22)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: -CARD_W / 2,
                top: AXIS_Y - 8 - STEM - CARD_H,
                transform: `scaleY(${s}) scaleX(${0.85 + 0.15 * s})`,
                transformOrigin: '50% 100%',
                opacity: Math.min(1, s * 2),
              }}
            >
              <MilestoneCard i={i} />
            </div>
          </>
        )}
      </div>
    )
  };
  const frame = useCurrentFrame()
  const tailFade = p.duration ? 1 - ramp(frame, p.duration - 8, 8, EASE.out) : 1
  const camX = camXAt(frame, total)
  const vx = -(camXAt(frame + 0.5, total) - camXAt(frame - 0.5, total)) // 世界层屏幕速度（px/f，向左为负）

  // 急停后推近末刻度：scale 1 → 1.28，中心对准 Today 刻度
  const zoom = interpolate(frame, [TRAVEL_END, ZOOM_END], [1, 1.28], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const headIn = interpolate(frame, [0, 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) })

  return (
    <div style={{ width: W, height: 1080, overflow: 'hidden', position: 'relative', fontFamily: FONT.sans }}>
      {/* 远景视差：大号年份以 0.35× 速度平移、只推近 0.35 倍幅度（远景在推近层之外）；
          按与镜头中心的距离淡入淡出，同一时刻只读到当前年份 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `scale(${(1 + (zoom - 1) * 0.35).toFixed(4)})`,
          transformOrigin: '50% 62%',
        }}
      >
        {TICKS.map((t, i) => {
          const d = Math.abs(camX - i * TICK_GAP) / TICK_GAP // 0 = 该年份刻度正对镜头
          const op = Math.max(0, 1 - d / 0.62)
          if (op <= 0) return null
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: 960 + i * TICK_GAP * 0.35 - camX * 0.35 - 500,
                width: 1000,
                top: 210,
                textAlign: 'center',
                fontSize: 280,
                lineHeight: 1,
                fontWeight: 800,
                letterSpacing: '-0.05em',
                color: `rgba(20,22,28,${(0.04 * op).toFixed(4)})`,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {t.far}
            </div>
          )
        })}
      </div>
      {/* 推近层：以画面中央偏下（末刻度落点）为原点放大 */}
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${zoom})`, transformOrigin: '50% 62%' }}>
        {/* 世界层：唯一横移的容器；冲刺段横向运动模糊 */}
        <SpeedBlur vx={vx} amount={0.16} max={9}>
          <div style={{ position: 'absolute', left: 0, top: 0, width: WORLD_W_OF(TICKS.length), height: 1080, transform: `translateX(${(-camX).toFixed(2)}px)` }}>
            {/* 主轴线 */}
            <div
              style={{
                position: 'absolute',
                left: 200,
                top: AXIS_Y - 1,
                width: WORLD_W_OF(TICKS.length) - 400,
                height: 2,
                background: 'linear-gradient(90deg, rgba(20,22,28,0) 0%, rgba(20,22,28,0.22) 4%, rgba(20,22,28,0.22) 96%, rgba(20,22,28,0) 100%)',
              }}
            />
            {/* 次刻度（细短杠，速度参照物） */}
            {Array.from({ length: 22 }).map((_, i) =>
              i % 5 === 0 ? null : (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    left: 960 + i * (TICK_GAP / 5) - 1,
                    top: AXIS_Y - 9,
                    width: 2,
                    height: 18,
                    background: 'rgba(20,22,28,0.2)',
                    borderRadius: 1,
                  }}
                />
              ),
            )}
            {TICKS.map((_, i) => (
              <TickStop key={i} i={i} frame={frame} />
            ))}
          </div>
        </SpeedBlur>
      </div>
      {/* 固定页眉 */}
      <div style={{ position: 'absolute', left: 120, top: 96, opacity: headIn, transform: `translateY(${((1 - headIn) * 8).toFixed(2)}px)` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 30, fontWeight: 650, letterSpacing: tracking(30, true), textTransform: 'uppercase', color: G.accent }}>
          <span style={{ width: 36, height: 36, borderRadius: '50%', background: G.ink3, opacity: 0.5, display: 'inline-block' }} />
          {p.kicker}
        </div>
        <div style={{ marginTop: 6, fontSize: 56, fontWeight: 720, letterSpacing: tracking(56), color: G.ink1 }}>{p.headline}</div>
      </div>
      <Grain opacity={0.05} />
    </div>
  )
}
