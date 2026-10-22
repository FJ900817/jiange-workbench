// ─── 改编来源 ───
// video-shotcraft (Apache License 2.0) · https://github.com/Vincentwei1021/video-shotcraft
// 原卡: demos/typography/pill-chip-slot-cycle-handled/PillChipSlotCycleHandled.tsx
// 参考: references/shots/typography/pill-chip-slot-cycle-handled.md
// （"白底句式 Your [chip] Handled：深色胶囊内词竖向滚轮轮换，胶囊宽度按词宽插值伸缩"）
// 改动:
//  1. 硬编码文案提为带默认值的 props：prefix（"Your"）/ words（轮换词，逗号分隔或数组）/ suffix（"Handled"）
//  2. 去掉 emoji（原 WORDS 带 🎬 等；包装场景默认纯文字）
//  3. DesignStage 底色改透明（alpha 叠加渲染用）；设计坐标 480×270 等比放大保留
//  4. 节奏命门保持常量：切换点按词数等比排布（原 4 词：0.25/0.47/0.69）/ 每次 0.12 inOutCubic 推进
//  5. 新增 duration prop（useT 归一化时间，任意时长自适应；默认 150f）
// 注意：本卡用 useLayoutEffect 做 DOM 实测词宽，渲染时需真实排版环境

// pill-chip-slot-cycle-handled — Chip Slot Cycle 胶囊滚轮挤开（motion-lab 定稿转原生 Remotion）
// 白底句式 "Your [chip] Handled"：深色胶囊内词垂直滚轮轮换（Shots→Camera→Sound→Renders，
// video-shotcraft 替你包办的四件事：镜头 / 运镜 / 音效 / 渲染），
// 上下露出灰色幽灵项，胶囊宽度随词长平滑变化，两侧文字被自然挤开收拢。
// 设计坐标 480×270（DesignStage 等比放大），参数表数值以此坐标系标定。
import React, { useLayoutEffect, useRef, useState } from 'react'
import { DesignStage, E, lerp, seg, useT } from '../_fixtures/Motion'

export const PILL_CHIP_SLOT_CYCLE_HANDLED_DURATION = 150 // 5000ms @30fps

export interface PillChipSlotCycleHandledProps {
  /** 句式前缀 */
  prefix?: string
  /** 胶囊内轮换词（逗号/换行分隔或数组） */
  words?: string[] | string
  /** 句式后缀 */
  suffix?: string
  /** 总时长（帧，30fps；useT 归一化，任意时长自适应） */
  duration?: number
}

export const PILL_CHIP_SLOT_CYCLE_HANDLED_DEFAULTS: Required<PillChipSlotCycleHandledProps> = {
  prefix: 'Your',
  words: WORDS_FALLBACK as string[] | string,
  suffix: 'Handled',
  duration: PILL_CHIP_SLOT_CYCLE_HANDLED_DURATION,
}

export const PILL_CHIP_SLOT_CYCLE_HANDLED_SCHEMA = [
  { type: 'text', key: 'prefix', label: '句式前缀', default: 'Your' },
  { type: 'textarea', key: 'words', label: '轮换词（逗号/换行分隔）', default: 'Shots,Camera,Sound,Renders', required: true },
  { type: 'text', key: 'suffix', label: '句式后缀', default: 'Handled' },
  { type: 'number', key: 'duration', label: '总时长', default: PILL_CHIP_SLOT_CYCLE_HANDLED_DURATION, min: 60, max: 400, step: 1, unit: '帧' },
] as const

const WORDS_FALLBACK = ['Shots', 'Camera', 'Sound', 'Renders']
const FONT = '700 22px -apple-system,system-ui,sans-serif'
// 兜底词宽（原 effect.js 未挂载时的估算：字符数×13，再加胶囊内留白 74）；
// 首帧 useLayoutEffect 用 offsetWidth 实测替换，与原渲染逐像素一致
const FALLBACK_WIDTHS = WORDS_FALLBACK.map(w => w.length * 13 + 74)

// 两侧静态文字（"Your" / "Handled"）
const SIDE: React.CSSProperties = {
  color: '#15171d',
  fontWeight: 800,
  fontSize: 30,
  letterSpacing: -0.5,
  flex: 'none',
}

export const PillChipSlotCycleHandled: React.FC<PillChipSlotCycleHandledProps> = (props) => {
  const p = { ...PILL_CHIP_SLOT_CYCLE_HANDLED_DEFAULTS, ...props }
  const t = useT()
  const WORDS = (Array.isArray(p.words) ? p.words : String(p.words ?? '').split(/[,，\n]/).map(w => w.trim()).filter(Boolean))
  const N = Math.max(2, WORDS.length)
  const SWITCHES = Array.from({ length: N - 1 }, (_, i) => (i + 1) / N + 0.0)

  // 量宽：与原 effect.js 相同，用隐藏 span 实测每个词的 offsetWidth（+74 胶囊留白），
  // 只在首次布局量一次；量到前用兜底估算，避免首帧闪动
  const measRef = useRef<HTMLDivElement>(null)
  const [widths, setWidths] = useState<number[]>(FALLBACK_WIDTHS)
  useLayoutEffect(() => {
    const spans = measRef.current?.children
    if (!spans) return
    setWidths(
      WORDS.map((w, i) => ((spans[i] as HTMLElement).offsetWidth || w.length * 13) + 74),
    )
  }, [])

  // 三次切换：0.25 / 0.47 / 0.69，每次用 0.12 的 inOutCubic 推进一格
  let pos = 0
  for (const s0 of SWITCHES) pos += seg(t, s0, s0 + 0.12, E.inOutCubic)
  const ci = Math.min(WORDS.length - 1, Math.floor(pos))
  const frac = pos - ci
  // 胶囊宽度随当前词→下一词插值，平滑挤开两侧文字
  const chipW = lerp(frac, widths[ci], widths[Math.min(ci + 1, WORDS.length - 1)])

  // 幽灵项：当前词的前/后邻居，随滚动微移，落定时回到基准透明度
  const near = Math.round(pos)
  const roll = (pos - near) * 48 * 0.5
  const settle = 1 - Math.min(1, Math.abs(pos - near) * 3)
  const ghost = (top: number): React.CSSProperties => ({
    position: 'absolute',
    left: '50%',
    top,
    font: FONT,
    color: '#15171d',
    whiteSpace: 'nowrap',
    transform: `translateX(-50%) translateY(${-roll}px)`,
    opacity: 0.13 * (0.4 + settle * 0.6),
  })

  return (
    <DesignStage bg="transparent">
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: '-apple-system,system-ui,sans-serif',
        }}
      >
        {/* 隐藏量宽 span（与原 setup 的 meas 等价，不参与布局显示） */}
        <div ref={measRef} style={{ position: 'absolute', visibility: 'hidden' }}>
          {WORDS.map(w => (
            <span key={w} style={{ whiteSpace: 'nowrap', font: FONT }}>
              {w}
            </span>
          ))}
        </div>
        <div style={SIDE}>{p.prefix}</div>
        <div style={{ position: 'relative', flex: 'none' }}>
          {/* 深色胶囊：overflow hidden 里放 4 行词的滚轮列 */}
          <div
            style={{
              position: 'relative',
              height: 48,
              width: chipW,
              margin: '0 14px',
              flex: 'none',
              borderRadius: 99,
              background: '#1a1c24',
              boxShadow: '0 8px 24px rgba(20,22,40,.22)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                transform: `translateY(${-pos * 48}px)`,
              }}
            >
              {WORDS.map(w => (
                <div
                  key={w}
                  style={{
                    height: 48,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 9,
                    paddingLeft: 18,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span style={{ fontSize: 18 }}>{e}</span>
                  <span style={{ font: FONT, color: '#fff' }}>{w}</span>
                </div>
              ))}
            </div>
          </div>
          {/* 胶囊外上下的灰色幽灵项 */}
          <div style={ghost(-38)}>{near > 0 ? WORDS[near - 1] : ''}</div>
          <div style={ghost(58)}>{near < WORDS.length - 1 ? WORDS[near + 1] : ''}</div>
        </div>
        <div style={SIDE}>{p.suffix}</div>
      </div>
    </DesignStage>
  )
}
