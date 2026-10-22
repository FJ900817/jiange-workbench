// ─── 改编来源 ───
// video-shotcraft (Apache License 2.0) · https://github.com/Vincentwei1021/video-shotcraft
// 原卡: demos/ui-entrance/research-card-stack-scroll/ResearchCardStackScroll.tsx
// 参考: references/shots/ui-entrance/research-card-stack-scroll.md
// 改动:
//  1. 硬编码文案提为带默认值的 props：titles（13 条卡片标题，接受 string[] | string）
//  2. 作者行（A. Author…preprint）为纹理，原样保留
//  3. DesignStage 背景改为透明（原 #FAFAFA）；本卡为亮场设计，宜叠在浅画面上
//  4. 滚动节奏命门保持常量（PER=12f/卡 / GAP=30 / 6f 入场 / 落位 1 帧压缩）
//  5. Motion fixture（E/seg/lerp/useT/DesignStage）拷贝自 demos/_fixtures/Motion.tsx（原样）
//  6. duration prop 仅作时长声明（原卡用 useT 归一化时间轴）

import React from 'react'
import { DesignStage, E, lerp, rand, seg, useT } from '../_fixtures/Motion'

export const RESEARCH_CARD_STACK_SCROLL_DURATION = 144 // 4800ms @30fps

const ORANGE = '#FF6A1F'
const ORANGE_SOFT = '#FF8A44'
const INK = '#1A1A1A'
const FONT = '-apple-system,system-ui,"SF Pro Text","PingFang SC",sans-serif'

// 原 setup 里的 stage.clientWidth/clientHeight 分支——原渲染 stage 恒为 480×270
const W = 480
const H = 270
const F = 144 // recipe 帧总数（f = t·F）
const PER = 12 // 每 12 帧进一张卡
const GAP = 30 // 叠压后每张卡的下移间距
const XOFF = 9 // 滚流时的右移量

// 逻辑画布 420×250 → 实际 stage 的等比缩放
const LW = 420
const LH = 250
const S = Math.min(W / LW, H / LH)

const TITLES_FALLBACK = [
  'Sparse Attention Mechanisms for Long-Context Reasoning',
  'Retrieval Drift in Multi-Hop Agent Pipelines',
  'Latent Caching Reduces Tool-Call Latency by 41%',
  'On the Calibration of Preference Reward Models',
  'Grid-Aligned Motion Priors for UI Animation',
  'Cheap Verifiers Beat Expensive Samplers',
  'Structured Decoding Without Grammar Loss',
  'Depth-Ordered Compositing for Live Interfaces',
  'Token-Budget Routing in Agent Fleets',
  'Contrastive Layouts for Document Understanding',
  'Fast Approximate Re-Ranking at Query Time',
  'Signal Propagation in Deep Residual Agents',
  'A Note on Deterministic Replay of Motion',
]
const CW = 296
const CH = 96

export interface ResearchCardStackScrollProps {
  /** 卡片标题（数组或换行分隔，最多 13 条） */
  titles?: string[] | string
  /** 总时长（帧，30fps） */
  duration?: number
}

export const RESEARCH_CARD_STACK_SCROLL_DEFAULTS: Required<Omit<ResearchCardStackScrollProps, 'titles'>> & { titles: string[] } = {
  titles: TITLES_FALLBACK,
  duration: RESEARCH_CARD_STACK_SCROLL_DURATION,
}

export const RESEARCH_CARD_STACK_SCROLL_SCHEMA = [
  { type: 'textarea', key: 'titles', label: '卡片标题（换行分隔）', default: TITLES_FALLBACK.join('\n') },
  { type: 'number', key: 'duration', label: '总时长', default: RESEARCH_CARD_STACK_SCROLL_DURATION, min: 60, max: 400, step: 1, unit: '帧' },
] as const

export const ResearchCardStackScroll: React.FC<ResearchCardStackScrollProps> = (props) => {
  const p = { ...RESEARCH_CARD_STACK_SCROLL_DEFAULTS, ...props }
  const t = useT()
  const TITLES = (Array.isArray(p.titles) ? p.titles : String(p.titles).split(/[\n]+/).map(w => w.trim()).filter(Boolean)).slice(0, 13)
  const f = t * F
  const focus = Math.floor(f / PER) // 只有最上一张卡渲染正文
  return (
    <DesignStage bg="transparent">
      {/* 背景横向 grid：随滚流同步下移做速度参照 */}
      <div
        style={{
          position: 'absolute',
          inset: -40,
          backgroundImage: 'linear-gradient(rgba(0,0,0,.055) 1px,transparent 1px)',
          backgroundSize: '100% 24px',
          transform: `translateY(${((f / PER) * GAP * S) % 24}px)`,
        }}
      />
      {/* 逻辑画布 track：中心锚点 + 等比缩放 */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 0,
          height: 0,
          transformOrigin: '0 0',
          transform: `scale(${S})`,
        }}
      >
        {TITLES.map((tt, i) => {
          const e = f - i * PER // 该卡的本地帧
          const p = seg(Math.max(0, Math.min(1, (e + 6) / 6)), 0, 1, E.outCubic) // 6 帧入场
          const drift = (Math.max(0, e) / PER) * GAP // 叠压后随流下移
          const squash = e >= 0 && e < 1.6 ? 0.97 : 1 // 落位 1 帧压缩
          const y = lerp(p, -40, 0) + drift
          const x = (Math.max(0, e) / PER) * XOFF
          const depth = Math.min(1, drift / (GAP * 3)) // depth 递增 blur + 变暗
          const opacity =
            e < -6 ? 0 : Math.min(1, (e + 6) / 2) * (1 - Math.max(0, (drift - GAP * 3.2) / (GAP * 1.6)))
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: -CW / 2,
                top: -CH / 2 - 14,
                width: CW,
                height: CH,
                background: INK,
                borderRadius: 11,
                overflow: 'hidden',
                fontFamily: FONT,
                zIndex: i,
                opacity,
                boxShadow: '0 14px 34px rgba(0,0,0,.22)',
                border: '1px solid #2A2A2A',
                boxSizing: 'border-box',
                transform: `translate(${x}px,${y}px) scale(${lerp(p, 0.94, 1)},${lerp(p, 0.94, 1) * squash})`,
                filter: `blur(${(depth * 4).toFixed(2)}px) brightness(${(1 - depth * 0.25).toFixed(3)})`,
              }}
            >
              {/* 左侧色条：每 4 张一根橙色 */}
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: 3,
                  height: '100%',
                  background: i % 4 === 1 ? ORANGE : '#2E2E2E',
                }}
              />
              {/* 标题条：所有卡都渲染 */}
              <div
                style={{
                  position: 'absolute',
                  left: 14,
                  top: 11,
                  width: 264,
                  font: `650 9.5px/1.35 ${FONT}`,
                  color: '#F0F0F0',
                }}
              >
                {tt}
              </div>
              {/* 正文（作者 + 摘要骨架线）：只有 focus 卡可见 */}
              <div style={{ position: 'absolute', left: 14, top: 40, width: 266, opacity: i === focus ? 1 : 0 }}>
                <div style={{ font: `500 8px/1 ${FONT}`, color: ORANGE_SOFT, letterSpacing: '.3px' }}>
                  {`A. Author, B. Writer, C. Reader · preprint:24${10 + i}.0${i % 9}${i % 7}`}
                </div>
                {[0, 1, 2, 3].map(k => (
                  <div
                    key={k}
                    style={{
                      marginTop: k ? 5 : 9,
                      width: `${100 - k * 11 - rand(i * 5 + k) * 12}%`,
                      height: 4,
                      borderRadius: 2,
                      background: '#3A3A3A',
                    }}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </DesignStage>
  )
}
