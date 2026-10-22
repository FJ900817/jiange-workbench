// ─── 改编来源 ───
// video-shotcraft (Apache License 2.0) · https://github.com/Vincentwei1021/video-shotcraft
// 原卡: demos/data/before-after-slider-scrub/BeforeAfterSliderScrub.tsx
// 参考: references/shots/data/before-after-slider-scrub.md
// 改动:
//  1. 硬编码文案提为带默认值的 props：beforeLabel（默认 'Before'）/ afterLabel（默认 'After'）
//  2. 前后两层均为 FakeDashboard（fixture 通用仪表盘占位）；真实业务内容接入时替换这两层
//  3. 根背景改为透明（原 G.bg）；FakeDashboard 自带画布底
//  4. 滑杆节奏命门保持常量（PRE 蓄力 / 12f 快甩到 76% / 回弹 70% / 48f 慢扫到 40%）
//  5. 新增 duration prop：尾 8f 淡出跟 duration 走（不传则无淡出）

import React from 'react'
import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { G, FakeDashboard } from '../_fixtures/Fixtures'
import { EASE, FONT, Grain, SpeedBlur, mix, ramp, softShadow, tracking, velocity } from '../_fixtures/Polish'

export const BEFORE_AFTER_SLIDER_SCRUB_DURATION = 150 // 110f 动作 + 40f 真静止

// 时间轴（杆位置以画面宽度百分比表示）
const PRE = 10 // 预备：10→14 先向左回拉 1.5%（甩之前"蓄力"）
const T0 = 14 // 快甩起点
const FLING = 26 // 快甩：14→26（12f 冲到 76%）
const BOUNCE = 38 // 回弹：26→38 落到 70%
const HOLD = 56 // 停顿看清
const SCRUB = 104 // 慢扫：56→104（48f 回到 40%）——速度约为快甩的 1/5

const posAt = (f: number): number => {
  if (f < T0) return mix(8, 6.5, ramp(f, PRE, T0 - PRE, EASE.smooth))
  if (f < FLING) return mix(6.5, 76, ramp(f, T0, FLING - T0, EASE.out))
  if (f < BOUNCE) return mix(76, 70, ramp(f, FLING, BOUNCE - FLING, EASE.smooth))
  if (f < HOLD) return 70
  return mix(70, 40, ramp(f, HOLD, SCRUB - HOLD, EASE.smooth))
}

const W = 1920
const H = 1080

// 角标胶囊：放在顶栏中段的空白处（不压卡片标题/侧栏）；before 白底暗字，after 深底白字 + 强调色点
const Tag: React.FC<{ label: string; x: number; accent?: boolean; muted?: boolean }> = ({ label, x, accent, muted }) => (
  <div
    style={{
      position: 'absolute',
      left: x,
      top: 15,
      height: 42,
      padding: '0 18px 0 15px',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      borderRadius: 21,
      background: accent ? G.ink1 : 'rgba(255,255,255,0.88)',
      border: accent ? '1px solid rgba(255,255,255,0.08)' : `1px solid ${G.hairlineStrong}`,
      boxShadow: `inset 0 1px 0 rgba(255,255,255,${accent ? 0.12 : 0.9}), ${softShadow(accent ? 10 : 4)}`,
      fontFamily: FONT.sans,
      fontSize: 20,
      fontWeight: 600,
      letterSpacing: tracking(20, false),
      color: accent ? '#ffffff' : muted ? G.ink2 : G.ink1,
      whiteSpace: 'nowrap',
    }}
  >
    <span
      style={{
        width: 9,
        height: 9,
        borderRadius: 5,
        background: accent ? '#8f96f0' : G.ink3,
        boxShadow: accent ? '0 0 0 3px rgba(143,150,240,0.22)' : 'none',
      }}
    />
    {label}
  </div>
)

export interface BeforeAfterSliderScrubProps {
  /** 前标签 */
  beforeLabel?: string
  /** 后标签 */
  afterLabel?: string
  /** 总时长（帧，30fps）；尾 8f 淡出 */
  duration?: number
}

export const BEFORE_AFTER_SLIDER_SCRUB_DEFAULTS: Required<BeforeAfterSliderScrubProps> = {
  beforeLabel: 'Before',
  afterLabel: 'After',
  duration: BEFORE_AFTER_SLIDER_SCRUB_DURATION,
}

export const BEFORE_AFTER_SLIDER_SCRUB_SCHEMA = [
  { type: 'text', key: 'beforeLabel', label: '前标签', default: 'Before' },
  { type: 'text', key: 'afterLabel', label: '后标签', default: 'After' },
  { type: 'number', key: 'duration', label: '总时长', default: BEFORE_AFTER_SLIDER_SCRUB_DURATION, min: 80, max: 400, step: 1, unit: '帧' },
] as const

export const BeforeAfterSliderScrub: React.FC<BeforeAfterSliderScrubProps> = (props) => {
  const cfg = { ...BEFORE_AFTER_SLIDER_SCRUB_DEFAULTS, ...props }
  const frame = useCurrentFrame()
  const tailFade = cfg.duration ? 1 - ramp(frame, cfg.duration - 8, 8, EASE.out) : 1
  const p = posAt(frame) // 杆位置 %
  const x = (p / 100) * W

  // 速度（px/帧）：驱动手柄拉伸与运动模糊，静止时为 0
  const vx = velocity(f => (posAt(f) / 100) * W, frame)
  const speed = Math.abs(vx)
  const squish = 1 + Math.min(speed / 110, 1) * 0.18 // 峰值 1.18
  const press = 1 - 0.06 * Math.sin(Math.PI * ramp(frame, PRE, FLING - PRE, EASE.linear)) // 甩动期间手柄被"捏住"微缩

  return (
    <AbsoluteFill style={{ background: 'transparent', overflow: 'hidden', opacity: tailFade }}>
      {/* before：可信的"处理前"——轻微失焦 + 降饱和 + 低对比，再盖一层暖灰雾面 */}
      <div style={{ position: 'absolute', inset: 0, filter: 'blur(1.6px) saturate(0.18) contrast(0.72) brightness(1.04)' }}>
        <FakeDashboard variant="A" />
      </div>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(214,212,206,0.30), rgba(196,194,188,0.38))' }} />
      <Tag label={cfg.beforeLabel} x={1372} muted />

      {/* after：正常清晰版，杆左侧揭出；After 角标长在这一层，随分割线一起被裁 */}
      <div style={{ position: 'absolute', inset: 0, clipPath: `inset(0 ${W - x}px 0 0)` }}>
        <FakeDashboard variant="A" />
        {/* x 随 FakeDashboard 品牌化后变长的面包屑（video-shotcraft › Overview）右移，两侧（时段切换 / 定格时的分割杆）各留 ~20px */}
        <Tag label={cfg.afterLabel} x={646} accent />
      </div>

      {/* 揭示边沿：after 一侧 24px 极淡的接触暗影，让两层有前后关系（裁进 after 内） */}
      <div
        style={{
          position: 'absolute',
          left: x - 24,
          top: 0,
          width: 24,
          height: H,
          background: 'linear-gradient(90deg, rgba(16,18,26,0), rgba(16,18,26,0.07))',
        }}
      />

      {/* 分割杆 + 圆手柄：快甩时手柄按速度横向拉伸，杆与手柄一起做方向性运动模糊 */}
      <SpeedBlur vx={vx} amount={0.12} max={14}>
        {/* 分割杆：2px 白线 + 发丝描边 + 两侧软影 */}
        <div
          style={{
            position: 'absolute',
            left: x - 1,
            top: 0,
            width: 2,
            height: H,
            background: '#ffffff',
            boxShadow: '0 0 0 1px rgba(16,18,26,0.10), 0 0 22px rgba(16,18,26,0.22)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: x - 38,
            top: H / 2 - 38,
            width: 76,
            height: 76,
            borderRadius: 38,
            background: 'linear-gradient(180deg, #ffffff, #f4f4f2)',
            border: `1px solid ${G.hairlineStrong}`,
            boxShadow: `inset 0 1px 0 #ffffff, ${softShadow(14 + Math.min(speed / 8, 18))}`,
            transform: `scale(${press * squish}, ${press})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxSizing: 'border-box',
          }}
        >
          <svg width={36} height={20} viewBox="0 0 36 20" style={{ display: 'block' }}>
            <path d="M11 3 L4 10 L11 17" fill="none" stroke={G.ink2} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
            <path d="M25 3 L32 10 L25 17" fill="none" stroke={G.ink2} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </SpeedBlur>

      <Grain opacity={0.04} />
    </AbsoluteFill>
  )
}
