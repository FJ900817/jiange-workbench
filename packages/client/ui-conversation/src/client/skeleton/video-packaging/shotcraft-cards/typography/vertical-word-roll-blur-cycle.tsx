// ─── 改编来源 ───
// video-shotcraft (Apache License 2.0) · https://github.com/Vincentwei1021/video-shotcraft
// 原卡: demos/typography/vertical-word-roll-blur-cycle/VerticalWordRollBlurCycle.tsx
// 参考: references/shots/typography/vertical-word-roll-blur-cycle.md
// 改动:
//  1. 硬编码文案提为带默认值的 props：prefix（默认 'Crafted for'）/ words（滚动词，
//     默认 4 词；接受 string[] | string，最多 8 词）
//  2. STEPS 换词步数改由组件内按词数生成（原 4 词手写 3 步；节奏命门：每步 0.11、
//     0.7·outQuint + 0.3·outBack 保持）
//  3. DesignStage 背景改为透明（原 #F4F4F2 纸色），去掉 Backdrop；本卡为亮场设计
//     宜叠在浅画面上；组内原有"结束整组淡出"（seg 0.9–0.985）保留
//  4. Motion fixture（E/seg/useT/DesignStage）拷贝自 demos/_fixtures/Motion.tsx（原样）
//  5. duration prop 仅作时长声明（原卡用 useT 归一化时间轴）

import React from 'react'
import { DesignStage, E, seg, useT } from '../_fixtures/Motion'
import { FONT, Grain } from '../_fixtures/Polish'

export const VERTICAL_WORD_ROLL_BLUR_CYCLE_DURATION = 150 // 5000ms @30fps

const ROW = 44
// 默认滚词（原 demo 内容）
const DEFAULT_WORDS = ['Launches', 'Demos', 'Promos', 'Every Shot']

const ACCENT = '#5b63d3'
const ACCENT_DIM = '#B9B9BE'
const INK = '#17181c'
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
// 十六进制颜色按 k 混合（与原 effect.js 的 mixHex 等价）
const mixHex = (a: string, b: string, k: number) => {
  k = clamp01(k)
  const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16))
  const pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16))
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * k))
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

/* reelAt 改由组件内按词数生成 STEPS 后计算 */
const DT = 0.5 / (VERTICAL_WORD_ROLL_BLUR_CYCLE_DURATION - 1) // 半帧对应的 t

export interface VerticalWordRollBlurCycleProps {
  /** 滚轮前的固定前缀 */
  prefix?: string
  /** 滚动词（数组或逗号/换行分隔） */
  words?: string[] | string
  /** 总时长（帧，30fps） */
  duration?: number
}

export const VERTICAL_WORD_ROLL_BLUR_CYCLE_DEFAULTS: Required<Omit<VerticalWordRollBlurCycleProps, 'words'>> & { words: string[] } = {
  prefix: 'Crafted for',
  words: DEFAULT_WORDS,
  duration: VERTICAL_WORD_ROLL_BLUR_CYCLE_DURATION,
}

export const VERTICAL_WORD_ROLL_BLUR_CYCLE_SCHEMA = [
  { type: 'text', key: 'prefix', label: '前缀', default: 'Crafted for' },
  { type: 'textarea', key: 'words', label: '滚动词（逗号/换行分隔）', default: DEFAULT_WORDS.join('\n') },
  { type: 'number', key: 'duration', label: '总时长', default: VERTICAL_WORD_ROLL_BLUR_CYCLE_DURATION, min: 60, max: 400, step: 1, unit: '帧' },
] as const

export const VerticalWordRollBlurCycle: React.FC<VerticalWordRollBlurCycleProps> = (props) => {
  const cfg = { ...VERTICAL_WORD_ROLL_BLUR_CYCLE_DEFAULTS, ...props }
  const t = useT()
  const WORDS = (Array.isArray(cfg.words) ? cfg.words : String(cfg.words).split(/[\n,，、]+/).map(w => w.trim()).filter(Boolean)).slice(0, 8)
  // 换词步数 = 词数-1；每次 0.11（≈0.55s），起始 0.16、间隔 0.2（原 demo：4 词 3 次）
  const STEPS = WORDS.slice(1).map((_, i) => 0.16 + i * 0.2)
  // 滚轮进度 p：每步 0.7·outQuint + 0.3·outBack（前快后极慢 + 轻微过冲回落）
  const reelAt = (tt: number) => {
    let pp = 0
    for (const s of STEPS) {
      const u = seg(tt, s, s + 0.11)
      pp += 0.7 * E.outQuint(u) + 0.3 * E.outBack(u)
    }
    return pp
  }
  const p = reelAt(t)
  // 滚轮速度（行/帧）→ 纵向运动模糊（设计 px），静止时为 0
  const speed = Math.abs(reelAt(t + DT) - reelAt(t - DT))
  const motionBlur = Math.min(4, speed * ROW * 0.22)

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <DesignStage bg="transparent">
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: FONT.sans,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              // 结束整组淡出
              opacity: 1 - seg(t, 0.9, 0.985) * 0.999,
            }}
          >
            <div
              style={{
                fontSize: 30,
                fontWeight: 800,
                color: INK,
                letterSpacing: -0.5,
              }}
            >
              {cfg.prefix}
            </div>
            {/* 三行高的视窗，滚轮列在其中滑动，中心行 = 第二行；上下沿柔边渐隐 */}
            <div
              style={{
                position: 'relative',
                height: ROW * 3,
                width: 190,
                overflow: 'hidden',
                WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, #000 26%, #000 74%, transparent 100%)',
                maskImage: 'linear-gradient(180deg, transparent 0%, #000 26%, #000 74%, transparent 100%)',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  transform: `translateY(${ROW - p * ROW}px)`,
                }}
              >
                {WORDS.map((w, i) => {
                  const d = Math.abs(i - p)
                  // 相邻行纵向 blur：距中心 1 行内线性 0→3px，更远 3→5px；转动时叠运动模糊
                  const blur = (d < 1 ? 3 * d : 3 + 2 * Math.min(d - 1, 1)) + motionBlur
                  const op = d < 1 ? 1 - 0.65 * d : Math.max(0.1, 0.35 - 0.23 * (d - 1))
                  // 滚筒曲面：离中心越远越扁（最多 14%）
                  const squash = 1 - 0.14 * Math.min(1, d / 1.4)
                  const fid = `vroll-${i}`
                  return (
                    <div key={w} style={{ position: 'relative', height: ROW }}>
                      <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
                        <filter id={fid} x="-10%" y="-120%" width="120%" height="340%" colorInterpolationFilters="sRGB">
                          <feGaussianBlur stdDeviation={`0 ${blur.toFixed(2)}`} />
                        </filter>
                      </svg>
                      <div
                        style={{
                          height: ROW,
                          display: 'flex',
                          alignItems: 'center',
                          fontSize: 30,
                          fontWeight: 800,
                          letterSpacing: -0.5,
                          whiteSpace: 'nowrap', // 末词 "Every Shot" 带空格，禁止折行
                          filter: blur > 0.05 ? `url(#${fid})` : undefined,
                          opacity: op,
                          transform: `scaleY(${squash.toFixed(4)})`,
                          // 落定染色：中心词灰→强调色（d 越小越彩）
                          color: mixHex(ACCENT_DIM, ACCENT, clamp01(1 - d * 2.4)),
                        }}
                      >
                        {w}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </DesignStage>
      {/* 颗粒放在设计坐标容器外，按成片像素取样，不随 4× 放大变粗 */}
      <Grain opacity={0.05} />
    </div>
  )
}
