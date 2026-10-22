// ─── 改编来源 ───
// video-shotcraft (Apache License 2.0) · https://github.com/Vincentwei1021/video-shotcraft
// 原卡: demos/typography/type-entrance-moves/LetterDropPhysics.tsx
// 参考: references/shots/typography/type-entrance-moves.md
// 改动:
//  1. 硬编码文案提为带默认值的 props：word（默认 'Shotcraft'，原为 BRAND.short）
//  2. 去掉 video-shotcraft 品牌绑定（WORD 原为 BRAND.short）
//  3. 去掉 Backdrop 浅底，改为透明底（alpha 叠加渲染用）
//  4. 落体节奏命门保持常量（T_FALL=24f 重力加速 / 两次弹跳 30%+9% / 三次触地挤压 / SNAP 齐整回正）
//  5. startOf 改由组件内按 word.length 计算（原模块级依赖 WORD）
//  6. 新增 duration prop：尾 8f 淡出跟 duration 走（不传则无淡出）

import React from 'react'
import { useCurrentFrame } from 'remotion'
import { G } from '../_fixtures/Fixtures'
import { EASE, FONT, Grain, SpeedBlur, mix, ramp, tracking } from '../_fixtures/Polish'

export const LETTER_DROP_PHYSICS_DURATION = 150

// 确定性伪随机
const h = (n: number) => {
  const s = Math.sin(n * 127.3) * 43758.5453
  return s - Math.floor(s)
}

const WORD_FALLBACK = 'Shotcraft'
const SIZE = 176 // 字号
const FLOOR_Y = 600 // 地面线（字符基线）
const BASE = Math.round(SIZE * 0.886) // 字行盒顶到基线（SF Pro，lineHeight 1 实测）
const ROW_TOP = FLOOR_Y - BASE // 字行盒顶：基线正好压在地面线上

const PAD = 200 // 运动模糊层外扩
const DROP = 720 // 下落距离
const T_FALL = 24 // 落到地面用时
const T_B1 = 16 // 第一次弹跳时长（高 30%）
const T_B2 = 8 // 第二次弹跳时长（高 9%）
const SNAP = 110 // 齐整回正的一拍
const SNAP_DUR = 6

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

/* startOf 改由组件内按 word 长度计算 */

// 单字符纵向位移（相对地面，负 = 在上方）
const dropY = (t: number): number => {
  if (t <= 0) return -DROP
  if (t < T_FALL) return -DROP + DROP * (t / T_FALL) ** 2 // 重力加速
  if (t < T_FALL + T_B1) {
    const u = (t - T_FALL) / T_B1
    return -DROP * 0.3 * 4 * u * (1 - u) // 弹跳 1：30%
  }
  if (t < T_FALL + T_B1 + T_B2) {
    const u = (t - T_FALL - T_B1) / T_B2
    return -DROP * 0.09 * 4 * u * (1 - u) // 弹跳 2：9%
  }
  return 0
}

// 触地挤压量：三次触地（落地 / 一跳落 / 二跳落）各给一次阻尼振荡，强度 1 / 0.45 / 0.18
const IMPACTS: [number, number][] = [
  [T_FALL, 1],
  [T_FALL + T_B1, 0.45],
  [T_FALL + T_B1 + T_B2, 0.18],
]
const squashAt = (t: number) => {
  let s = 0
  for (const [t0, k] of IMPACTS) {
    const d = t - t0
    if (d < 0 || d > 16) continue
    s += k * Math.exp(-d / 2.6) * Math.cos(d * 0.85)
  }
  return s
}

export interface LetterDropPhysicsProps {
  /** 落体单词 */
  word?: string
  /** 总时长（帧，30fps）；尾 8f 淡出 */
  duration?: number
}

export const LETTER_DROP_PHYSICS_DEFAULTS: Required<LetterDropPhysicsProps> = {
  word: WORD_FALLBACK,
  duration: LETTER_DROP_PHYSICS_DURATION,
}

export const LETTER_DROP_PHYSICS_SCHEMA = [
  { type: 'text', key: 'word', label: '落体单词', default: WORD_FALLBACK, required: true },
  { type: 'number', key: 'duration', label: '总时长', default: LETTER_DROP_PHYSICS_DURATION, min: 60, max: 400, step: 1, unit: '帧' },
] as const

export const LetterDropPhysics: React.FC<LetterDropPhysicsProps> = (props) => {
  const { word, duration } = { ...LETTER_DROP_PHYSICS_DEFAULTS, ...props }
  const frame = useCurrentFrame()
  // 起跳帧：非等差错峰，越来越密（按 word 长度）
  const startOf = (i: number) => 4 + 36 * (1 - Math.pow(1 - i / (Math.max(2, word.length) - 1), 1.5))
  const tailFade = duration ? 1 - ramp(frame, duration - 8, 8, EASE.out) : 1
  // 帧 110 回正：108–110 吸气撑起，110–116 ease-out 回落
  const inhale = ramp(frame, SNAP - 2, 2, EASE.out)
  const snap = ramp(frame, SNAP, SNAP_DUR, EASE.snappy)
  const snapRot = ramp(frame, SNAP, SNAP_DUR + 2, EASE.overshoot) // 歪角回正带一点过冲
  const pulse = 0.06 * inhale * (1 - snap)
  // 副标题：回正后浮出
  const sub = ramp(frame, SNAP + 4, 18, EASE.out)

  return (
    <div style={{ width: 1920, height: 1080, overflow: 'hidden', position: 'relative', fontFamily: FONT.sans }}>

      {/* 地面：地平线以下一块向下渐深的台面 + 两端淡出的发丝地平线 */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: FLOOR_Y, bottom: 0,
        background: 'linear-gradient(180deg, rgba(40,42,52,0.035) 0%, rgba(40,42,52,0.012) 30%, rgba(40,42,52,0) 64%)',
      }} />
      <div style={{
        position: 'absolute', left: 160, right: 160, top: FLOOR_Y, height: 1,
        background: 'linear-gradient(90deg, rgba(20,22,28,0) 0%, rgba(20,22,28,0.16) 22%, rgba(20,22,28,0.16) 78%, rgba(20,22,28,0) 100%)',
      }} />
      <div style={{
        position: 'absolute', left: 160, right: 160, top: FLOOR_Y + 1, height: 1,
        background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.7) 30%, rgba(255,255,255,0.7) 70%, rgba(255,255,255,0) 100%)',
      }} />

      {/* 字行：flex 按自然字宽排槽位，每个槽内字符只做 transform */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: ROW_TOP, height: SIZE,
        display: 'flex', justifyContent: 'center',
        fontSize: SIZE, fontWeight: 800, lineHeight: 1, letterSpacing: tracking(SIZE, true), color: G.ink1,
      }}>
        {word.split('').map((ch, i) => {
          const t = frame - startOf(i)
          const y = dropY(t)
          const vy = dropY(t + 0.5) - dropY(t - 0.5)
          const air = -y // 离地高度
          // 落地瞬间歪到 seed 小角度（±6°），落地前为 0；snap 一拍齐整归零
          const tiltTarget = (h(i + 1) - 0.5) * 12
          const landP = EASE.out(clamp01((t - T_FALL) / 6))
          const rot = tiltTarget * landP * (1 - snapRot)
          // 歪着站 = 一个底角着地：按歪角把字抬起 sin|θ|·半字宽，底角始终贴地不穿地面
          const jitter = -Math.sin((Math.abs(rot) * Math.PI) / 180) * 48
          // 拉伸（下落速度）+ 挤压（触地），保体积：scaleX ≈ 1/scaleY
          const stretch = Math.min(1, Math.abs(vy) / 60) * 0.1 * (t < T_FALL ? 1 : 0.6)
          const sq = squashAt(t)
          const sy = (1 + stretch) * (1 - 0.2 * sq) + pulse
          const sx = (1 - stretch * 0.55) * (1 + 0.15 * sq) + pulse
          // 接触影：贴地小而实，离地大而虚而淡；未入画时几乎不可见
          const lift = clamp01(air / 420)
          const shOp = (t < 0 ? 0 : 0.2) * (1 - lift * 0.85) * clamp01((t + 2) / 8)
          const shW = mix(0.74, 1.3, lift) * (1 + 0.12 * Math.max(0, sq))
          const shBlur = mix(7, 28, lift)
          return (
            <span key={i} style={{ position: 'relative', display: 'inline-block' }}>
              {/* 占位字：撑出自然字宽，不可见 */}
              <span style={{ visibility: 'hidden' }}>{ch}</span>
              {/* 接触影 */}
              <div style={{
                position: 'absolute', left: '50%', top: BASE - 7, width: '84%', height: 14,
                transform: `translateX(-50%) scaleX(${shW.toFixed(3)})`,
                borderRadius: '50%', background: 'rgba(22,24,34,1)',
                opacity: shOp, filter: `blur(${shBlur.toFixed(1)}px)`,
              }} />
              {/* 运动层：位移在外，模糊随之移动（下落段全量、弹跳段减半，防触地时糊成一团）；挤压 / 歪角绕触地点 */}
              {/* 模糊层四周外扩 PAD：SVG 滤镜区域按元素盒计算，盒子太紧会把拖影裁成硬边 */}
              <div style={{
                position: 'absolute', left: -PAD, right: -PAD, top: -PAD, bottom: -PAD,
                transform: `translateY(${(y + jitter).toFixed(2)}px)`,
              }}>
                <SpeedBlur vx={0} vy={vy} amount={t < T_FALL ? 0.26 : 0.12} max={16}>
                  <div style={{
                    position: 'absolute', left: PAD, right: PAD, top: PAD, bottom: PAD, textAlign: 'center',
                    transform: `rotate(${rot.toFixed(3)}deg) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`,
                    transformOrigin: '50% 86%',
                  }}>
                    {ch}
                  </div>
                </SpeedBlur>
              </div>
            </span>
          )
        })}
      </div>

      {/* 副标题：回正一拍后的句号 */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: FLOOR_Y + 70, textAlign: 'center',
        fontSize: 36, fontWeight: 500, letterSpacing: tracking(36), color: G.ink2,
        opacity: sub, transform: `translateY(${((1 - sub) * 10).toFixed(2)}px)`,
      }}>
        Every shot lands on the beat.
      </div>

      <Grain opacity={0.05} />
    </div>
  )
}
