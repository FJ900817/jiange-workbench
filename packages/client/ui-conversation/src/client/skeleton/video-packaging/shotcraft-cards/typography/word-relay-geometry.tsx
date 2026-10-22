// ─── 改编来源 ───
// video-shotcraft (Apache License 2.0) · https://github.com/Vincentwei1021/video-shotcraft
// 原卡: demos/typography/word-relay-geometry/WordRelayGeometry.tsx
// 参考: references/shots/typography/word-relay-geometry.md
// 改动:
//  1. 硬编码文案提为带默认值的 props：words（3 个接力词）/ subs（3 条副句）/
//     brand（字标，默认 'Studio'）；words/subs 接受 string[] | string
//  2. SLOTS 定时（in0/out0）按词数等比生成（原 3 词手写 2/56/116 入、52/112 出）；
//     节奏命门保持（入 14f snappy / 出 10f exit / 几何装饰动画）
//  3. 去掉 video-shotcraft 品牌（ShotcraftMark → 中性圆点；BRAND.name → brand prop）
//  4. 去掉 Stage（midnight 暗场），改为透明底；Dust 粒子保留；本卡为暗场设计，宜叠在暗画面上
//  5. 新增 duration prop：尾 8f 淡出跟 duration 走（不传则无淡出）

import React from 'react'
import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { EASE, FONT, mix, ramp } from '../_fixtures/Polish'
import { Dust, LOOKS, TextReveal, alpha, type } from '../_fixtures/Look'

export const WORD_RELAY_GEOMETRY_DURATION = 180 // 6000ms @30fps

const L = LOOKS.graphite
const W = 1920
const H = 1080
const CX = W / 2
const CY = 500 // 视觉中心略高于几何中心，给副句留位
const WORD_SIZE = 230
const STATIC_FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif'
const GEO = 'rgba(236,238,244,0.42)' // 几何线：比字暗一档，层级在字之下
const GOLD = L.accent2

type Slot = { word: string; sub: string; in0: number; out0: number | null }
const SLOTS_FALLBACK: { word: string; sub: string }[] = [
  { word: 'Faster', sub: 'One prompt to a finished promo.' },
  { word: 'Tighter', sub: 'Every cut locked to the beat.' },
  { word: 'Stronger', sub: 'Launch films that feel studio-made.' },
]

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)

// 一个词的进出场包络：入 14f（snappy，1.06→1 去虚）、出 10f（exit，1→0.86 退焦）
const envelope = (f: number, s: Slot) => {
  const tin = ramp(f, s.in0, 14, EASE.snappy)
  const tout = s.out0 === null ? 0 : ramp(f, s.out0, 10, EASE.exit)
  return { tin, tout, alive: f >= s.in0 - 1 && tout < 1 }
}

// ───────────── Faster：虚线环 + 刻度环 + 彗星弧 ─────────────
const FasterGeo: React.FC<{ f: number; fade: number }> = ({ f, fade }) => {
  const grow = ramp(f, 0, 22, EASE.snappy)
  const s = mix(0.4, 1, grow)
  // 自转：入场时多转 160° 并减速（像飞轮刹住），之后匀速慢转永不停
  const spin = -90 - 160 * (1 - grow) + f * 0.9
  const spinTicks = 40 * (1 - grow) - f * 0.35 // 刻度环反向慢转，两层相对运动读出"转速"
  const R = 400
  const RT = 452
  // 彗星：沿 r=400 飞跑的亮弧（头亮尾淡），角速度比环快得多
  const head = -90 + f * 7.5 - 220 * (1 - grow)
  const comet = Array.from({ length: 16 }, (_, k) => {
    const a0 = ((head - k * 4) * Math.PI) / 180
    const a1 = ((head - (k + 1) * 4) * Math.PI) / 180
    return { d: `M ${R * Math.cos(a0)} ${R * Math.sin(a0)} A ${R} ${R} 0 0 0 ${R * Math.cos(a1)} ${R * Math.sin(a1)}`, o: (1 - k / 16) ** 1.6 }
  })
  return (
    <g opacity={fade * mix(0.35, 1, grow)} transform={`translate(${CX} ${CY}) scale(${s})`}>
      <circle r={R} fill="none" stroke={GEO} strokeWidth={2} strokeDasharray="10 16" transform={`rotate(${spin})`} />
      <g transform={`rotate(${spinTicks})`}>
        {Array.from({ length: 120 }, (_, k) => {
          const a = (k / 120) * Math.PI * 2
          const long = k % 10 === 0
          const r0 = RT - (long ? 18 : 8)
          return (
            <line key={k} x1={r0 * Math.cos(a)} y1={r0 * Math.sin(a)} x2={RT * Math.cos(a)} y2={RT * Math.sin(a)}
              stroke={long ? 'rgba(236,238,244,0.55)' : 'rgba(236,238,244,0.2)'} strokeWidth={long ? 2 : 1.4} />
          )
        })}
      </g>
      <circle r={R - 58} fill="none" stroke="rgba(236,238,244,0.08)" strokeWidth={1.4} />
      <g opacity={grow} style={{ filter: `drop-shadow(0 0 10px ${alpha('#ffffff', 0.6)})` }}>
        {comet.map((c, k) => (
          <path key={k} d={c.d} fill="none" stroke="#ffffff" strokeOpacity={c.o} strokeWidth={4 - k * 0.15} strokeLinecap="round" />
        ))}
      </g>
    </g>
  )
}

// ───────────── Tighter：三圆 trim 生长 → 收拢咬紧 ─────────────
const TighterGeo: React.FC<{ f: number; fade: number; outF: number | null }> = ({ f, fade, outF }) => {
  const R = 218
  const tight = ramp(f, 92, 14, EASE.swift) // 长满后向中心收拢
  const gap = mix(340, 300, tight)
  // 收拢落定时圆线一次提亮（咬合的"咔"）
  const click = Math.sin(clamp01((f - 100) / 12) * Math.PI)
  return (
    <g opacity={fade} transform={`translate(${CX} ${CY})`}>
      {[-1, 0, 1].map((k, i) => {
        const grow = ramp(f, 58 + i * 6, 22, EASE.out)
        const back = outF === null ? 0 : ramp(f, outF - 4, 12, EASE.exit)
        const tr = Math.max(0, grow - back)
        const x = k * gap
        const a = -Math.PI / 2 + tr * Math.PI * 2
        const tip = tr > 0.001 && grow < 1 ? 1 - clamp01((grow - 0.85) / 0.15) : 0
        return (
          <g key={k}>
            <circle cx={x} cy={0} r={R} fill="none" stroke={alpha('#ffffff', 0.4 + 0.35 * click)} strokeWidth={2.2}
              pathLength={1} strokeDasharray="1" strokeDashoffset={1 - tr} transform={`rotate(-90 ${x} 0)`} />
            {tip > 0 && (
              <circle cx={x + Math.cos(a) * R} cy={Math.sin(a) * R} r={6} fill="#ffffff" opacity={tip}
                style={{ filter: `drop-shadow(0 0 8px #ffffff) drop-shadow(0 0 22px ${alpha('#ffffff', 0.6)})` }} />
            )}
          </g>
        )
      })}
      {/* 相邻两圆的交点：收拢落定时亮起四枚铆钉光点，证明"咬住了" */}
      {[-1, 1].flatMap(k => [-1, 1].map((sy) => {
        const h = Math.sqrt(Math.max(0, R * R - (gap / 2) ** 2))
        const on = ramp(f, 100 + (k + 1) * 1.5 + (sy + 1), 10, EASE.overshoot)
        return (
          <g key={`${k}${sy}`} transform={`translate(${(k * gap) / 2} ${sy * h}) rotate(45) scale(${on})`} opacity={clamp01(on)}>
            <rect x={-6} y={-6} width={12} height={12} fill="#ffffff" style={{ filter: `drop-shadow(0 0 10px ${alpha('#ffffff', 0.8)})` }} />
          </g>
        )
      }))}
    </g>
  )
}

// ───────────── 词组（描边 / 填充 / sheen 三层） ─────────────
const Word: React.FC<{ f: number; slot: Slot; last: boolean }> = ({ f, slot, last }) => {
  const { tin, tout } = envelope(f, slot)
  const scale = mix(1.06, 1, tin) * mix(1, 0.86, tout)
  const defocus = (1 - tin) * 10 + tout * 12
  const fillStart = slot.in0 + 10
  const fillp = ramp(f, fillStart, 18, EASE.swift)
  // 柔边擦入：前沿 ±7%
  const FE = 7
  const edge = fillp * (100 + FE * 2) - FE
  const mask = `linear-gradient(90deg, #000 ${(edge - FE).toFixed(2)}%, transparent ${(edge + FE).toFixed(2)}%)`
  // Stronger：sheen 出现 → 扫光 → 收白
  const sh = ramp(f, 120, 10, EASE.out)
  const sweep = ramp(f, 124, 24, EASE.smooth)
  const white = ramp(f, 146, 12, EASE.out)
  const bloom = Math.sin(clamp01((f - 146) / 22) * Math.PI) * 0.9 + white * 0.35

  const base: React.CSSProperties = {
    fontFamily: STATIC_FONT, fontSize: WORD_SIZE, fontWeight: 800, letterSpacing: '-0.045em', lineHeight: 1, whiteSpace: 'nowrap',
    // 三层共用留白：mask / background-clip 只画在盒内，不留白会把 g 的下伸部和末字右沿裁掉、露出描边层
    padding: '0.08em 0.1em 0.28em',
  }
  return (
    <div style={{
      position: 'absolute', left: CX, top: CY, transform: `translate(-50%, ${-0.6 * WORD_SIZE}px) scale(${scale.toFixed(4)})`, transformOrigin: `50% ${0.6 * WORD_SIZE}px`,
      opacity: clamp01(tin * 1.6) * (1 - tout), filter: defocus > 0.05 ? `blur(${defocus.toFixed(2)}px)` : undefined,
    }}>
      <div style={{ position: 'relative' }}>
        <div style={{ ...base, color: 'transparent', WebkitTextStroke: `2px ${alpha('#e9ebf0', 0.55)}`, opacity: last ? 1 - sh * 0.85 : 1 - fillp * 0.8 }}>
          {slot.word}
        </div>
        {last ? (
          <>
            {/* 金属底：竖向镀铬分层（亮顶—暗腰—亮底），读出"材质硬" */}
            <div style={{
              ...base, position: 'absolute', inset: 0, color: 'transparent',
              backgroundImage: 'linear-gradient(180deg, #f2f3f6 8%, #b9bdc6 40%, #4a4e57 52%, #8b909a 62%, #e1e3e8 88%)',
              WebkitBackgroundClip: 'text', backgroundClip: 'text', opacity: sh * (1 - white),
            }}>{slot.word}</div>
            {/* 扫光：一道带香槟暖色的窄白带从左扫到右（只给结论词一次，Q4） */}
            <div style={{
              ...base, position: 'absolute', inset: 0, color: 'transparent',
              backgroundImage: `linear-gradient(100deg, transparent 38%, ${alpha(GOLD, 0.7)} 45%, #ffffff 50%, ${alpha(GOLD, 0.7)} 55%, transparent 62%)`,
              backgroundSize: '300% 100%', backgroundPosition: `${mix(100, 0, sweep).toFixed(2)}% 0`,
              WebkitBackgroundClip: 'text', backgroundClip: 'text', opacity: sh * (1 - white) * (sweep > 0 && sweep < 1 ? 1 : 0),
            }}>{slot.word}</div>
            <div style={{
              ...base, position: 'absolute', inset: 0, color: L.ink, opacity: white,
              textShadow: `0 0 ${(30 * bloom).toFixed(1)}px ${alpha('#ffffff', 0.35 * bloom)}, 0 0 ${(90 * bloom).toFixed(1)}px ${alpha('#ffffff', 0.22 * bloom)}`,
            }}>{slot.word}</div>
          </>
        ) : (
          fillp > 0 && (
            <div style={{ ...base, position: 'absolute', inset: 0, color: L.ink, WebkitMaskImage: mask, maskImage: mask }}>{slot.word}</div>
          )
        )}
      </div>
    </div>
  )
}

export interface WordRelayGeometryProps {
  /** 接力词（3 个） */
  words?: string[] | string
  /** 每词副句（3 条） */
  subs?: string[] | string
  /** 字标 */
  brand?: string
  /** 总时长（帧，30fps）；尾 8f 淡出 */
  duration?: number
}

export const WORD_RELAY_GEOMETRY_DEFAULTS: Required<Omit<WordRelayGeometryProps, 'words' | 'subs'>> & { words: string[]; subs: string[] } = {
  words: SLOTS_FALLBACK.map(s => s.word),
  subs: SLOTS_FALLBACK.map(s => s.sub),
  brand: 'Studio',
  duration: WORD_RELAY_GEOMETRY_DURATION,
}

export const WORD_RELAY_GEOMETRY_SCHEMA = [
  { type: 'textarea', key: 'words', label: '接力词（3 个，逗号/换行分隔）', default: SLOTS_FALLBACK.map(s => s.word).join('\n') },
  { type: 'textarea', key: 'subs', label: '副句（3 条，换行分隔）', default: SLOTS_FALLBACK.map(s => s.sub).join('\n') },
  { type: 'text', key: 'brand', label: '字标', default: 'Studio' },
  { type: 'number', key: 'duration', label: '总时长', default: WORD_RELAY_GEOMETRY_DURATION, min: 100, max: 500, step: 1, unit: '帧' },
] as const

export const WordRelayGeometry: React.FC<WordRelayGeometryProps> = (props) => {
  const p = { ...WORD_RELAY_GEOMETRY_DEFAULTS, ...props }
  const f = useCurrentFrame()
  const norm = (v: string[] | string): string[] =>
    (Array.isArray(v) ? v : String(v).split(/[\n,，、]+/).map(w => w.trim()).filter(Boolean)).slice(0, 3)
  const _words = norm(p.words); while (_words.length < 3) _words.push(SLOTS_FALLBACK[_words.length].word)
  const _subs = norm(p.subs); while (_subs.length < 3) _subs.push(SLOTS_FALLBACK[_subs.length].sub)
  // SLOTS 定时按词数等比（原 3 词：入 2/56/116、出 52/112/末词常驻）
  const SLOTS: Slot[] = _words.map((word, i) => ({
    word, sub: _subs[i],
    in0: 2 + i * 54,
    out0: i < _words.length - 1 ? 52 + i * 60 : null,
  }))
  const tailFade = p.duration ? 1 - ramp(f, p.duration - 8, 8, EASE.out) : 1
  // 相机：全程极缓推进 1→1.025（smooth，起止无速度突变），给 hold 段一点呼吸
  const cam = mix(1, 1.025, ramp(f, 0, 180, EASE.smooth))
  const e = SLOTS.map(s => envelope(f, s))
  const active = Math.min(SLOTS.length - 1, SLOTS.filter(s => f >= s.in0).length - 1)
  // Stronger 收白时主光一次提亮
  const flare = Math.sin(clamp01((f - 146) / 26) * Math.PI)

  return (
    <AbsoluteFill style={{ background: L.bg[2] }}>
      <Dust look={L} count={26} seed={7} drift={0.18} opacity={0.35} />

      <AbsoluteFill style={{ transform: `scale(${cam.toFixed(4)})`, transformOrigin: `${CX}px ${CY}px` }}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          {e[0].alive && <FasterGeo f={f} fade={1 - e[0].tout} />}
          {e[1].alive && (
            <g transform={`translate(${CX} ${CY}) scale(${mix(1.04, 1, e[1].tin) * mix(1, 0.9, e[1].tout)}) translate(${-CX} ${-CY})`}>
              <TighterGeo f={f} fade={clamp01(e[1].tin * 2) * (1 - e[1].tout)} outF={SLOTS[1].out0} />
            </g>
          )}
        </svg>

        {/* Stronger 落定的地平线光带：结论词脚下一道横向冷白光，只出现一次 */}
        <div style={{
          position: 'absolute', left: CX - 700, width: 1400, top: CY + 158, height: 2,
          background: `linear-gradient(90deg, transparent, ${alpha('#ffffff', 0.7)} 50%, transparent)`,
          opacity: ramp(f, 148, 14, EASE.out) * 0.8, transform: `scaleX(${mix(0.2, 1, ramp(f, 146, 22, EASE.snappy))})`,
          boxShadow: `0 0 24px ${alpha('#ffffff', 0.4)}`,
        }} />

        {SLOTS.map((s, i) => (e[i].alive ? <Word key={s.word} f={f} slot={s} last={i === SLOTS.length - 1} /> : null))}

        {/* 副句：40px，词落定后从线下升起，随词一起退场 */}
        {SLOTS.map((s, i) =>
          e[i].alive ? (
            <div key={`sub${i}`} style={{
              position: 'absolute', left: 0, right: 0, top: CY + (i === 1 ? 246 : 210), textAlign: 'center',
              ...type(40, 450), color: L.ink2, opacity: 1 - e[i].tout,
              filter: e[i].tout > 0.02 ? `blur(${(e[i].tout * 6).toFixed(2)}px)` : undefined,
            }}>
              <TextReveal text={s.sub} by="word" variant="rise" start={s.in0 + (i === 2 ? 34 : 16)} each={16} gap={2.2} />
            </div>
          ) : null,
        )}
      </AbsoluteFill>

      {/* 画框装饰（不随相机）：左上计数、底部三段进度——label 级纹理字 */}
      <div style={{ position: 'absolute', left: 120, top: 96, fontFamily: FONT.mono, fontSize: 22, letterSpacing: '0.18em', color: L.ink3, opacity: ramp(f, 0, 14, EASE.out) }}>
        <span style={{ color: L.ink }}>{`0${active + 1}`}</span> / {`0${SLOTS.length}`}
      </div>
      {/* 右上品牌签：镜刻标志 + 小写字标（label 级，不抢词） */}
      <div style={{ position: 'absolute', right: 120, top: 90, display: 'flex', alignItems: 'center', gap: 12, fontFamily: FONT.mono, fontSize: 22, letterSpacing: '0.1em', color: L.ink3, opacity: ramp(f, 4, 14, EASE.out) }}>
        <span style={{ width: 34, height: 34, borderRadius: '50%', background: L.ink3, opacity: 0.5, display: 'inline-block' }} />
        {p.brand}
      </div>
      <div style={{ position: 'absolute', left: 120, right: 120, bottom: 96, display: 'flex', gap: 24 }}>
        {SLOTS.map((s, i) => {
          const start = s.in0
          const end = s.out0 ?? 158
          const p = ramp(f, start, end - start, EASE.linear)
          const on = i === active
          return (
            <div key={i} style={{ flex: 1 }}>
              <div style={{ height: 2, background: alpha('#ffffff', 0.1), position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 0, background: on ? L.ink : alpha('#ffffff', 0.45), transform: `scaleX(${p})`, transformOrigin: 'left' }} />
              </div>
              <div style={{ marginTop: 16, fontFamily: FONT.mono, fontSize: 22, letterSpacing: '0.18em', textTransform: 'uppercase', color: on ? L.ink : L.ink3, transition: 'none' }}>
                {`0${i + 1}  ${s.word}`}
              </div>
            </div>
          )
        })}
      </div>
    </AbsoluteFill>
  )
}
