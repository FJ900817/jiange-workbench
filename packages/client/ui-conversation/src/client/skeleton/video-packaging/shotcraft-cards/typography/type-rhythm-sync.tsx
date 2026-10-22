// ─── 改编来源 ───
// video-shotcraft (Apache License 2.0) · https://github.com/Vincentwei1021/video-shotcraft
// 原卡: demos/typography/type-rhythm-sync/
//   - FontWeightPump.tsx（字重随拍泵动）
//   - KaraokeFillSync.tsx（卡拉 OK 揭字同步）
// 参考: references/shots/typography/type-rhythm-sync.md
// 改动:
//  1. 两式合一文件，variant 参数切换：'font-weight-pump' | 'karaoke-fill-sync'
//  2. 硬编码文案提为带默认值的 props：word（A，默认 'LOUDER'）/ brand（A 眉题字标，
//     默认 'Studio'）/ line1+line2（B 两行词，默认 'FRAME MOTION' / 'CRAFT SHOTS'）
//  3. B 的词定时：原 demo 为逐词手写 start/end；改编版按行内词数在原时间窗
//     （行1: 20–75f / 行2: 85–130f）内均匀分配，节奏命门（揭字柔边/退墨/波形跟随）不变
//  4. 去掉 video-shotcraft 品牌（A 的 ShotcraftMark → 中性圆点；BRAND.name → brand prop）
//  5. 去掉 Stage（A，aurora）与 Backdrop（B），改为透明底；A 为亮场设计宜叠浅画面
//  6. 节奏命门保持常量（A：BEATS 拍点/字重 250→900 幂衰减 / DROP=128f；B：FEATHER 柔边）
//  7. duration prop：两变体尾 8f 淡出跟 duration 走（不传则无淡出）

import React from 'react'
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion'
import { G } from '../_fixtures/Fixtures'
import { EASE, FONT, mix, ramp, tracking } from '../_fixtures/Polish'
import { LOOKS, TextReveal, alpha, type } from '../_fixtures/Look'

export const FONT_WEIGHT_PUMP_DURATION = 165

const L = LOOKS.aurora

const BEATS = [16, 30, 44, 58, 72, 86, 100, 114]
const DROP = 128
const DOWN = new Set([0, 4]) // 每小节第 1 拍重音
const TEXT_FALLBACK = 'LOUDER'
const SIZE = 240
const CY = 505 // 主字行中心（略高于画面中心，给下方副标题与音序器让位）
const W_REST = 250 // 静止字重（细）
const W_PEAK = 900
const W_FINAL = 780 // drop 后定格字重
const DECAY = 9 // 中心字衰减窗
const SPREAD = 1.6 // 每离中心一字，衰减窗多 1.6f
const ECHO_IN = 64
const ECHO_DY = 0.85 * SIZE // 回声行距
const LAG = 2 // 回声比主字晚 2f

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const hex = (c: string) => [1, 3, 5].map(k => parseInt(c.slice(k, k + 2), 16))
const mixRgb = (a: string, b: string, k: number) => {
  const A = hex(a), B = hex(b)
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(',')})`
}

// 命中后幂衰减包络：t=0 → 1，t>=decay → 精确 0
const envAt = (frame: number, beat: number, decay: number) => {
  const t = frame - beat
  if (t < 0 || t >= decay) return 0
  return Math.pow(1 - t / decay, 0.8)
}
// 某帧最大包络 + 拍序号（拍距 14f > 最长衰减窗 13f，同一时刻只有一个活跃拍）
const pulse = (frame: number, decay: number) => {
  let env = 0
  let beat = -1
  BEATS.forEach((b, i) => {
    const e = envAt(frame, b, decay)
    if (e > env) { env = e; beat = i }
  })
  return { env, beat }
}
// drop：冲到 1 再回落到定格值（0→1 的 0.75 ≈ 780 字重）
const dropEnv = (frame: number, decay: number) => {
  const t = frame - DROP
  if (t < 0) return 0
  const fin = (W_FINAL - W_REST) / (W_PEAK - W_REST)
  return fin + (1 - fin) * Math.pow(1 - clamp01(t / (decay + 4)), 1.4)
}

const GRAD = (i: number, n: number) => mixRgb(L.accent, L.accent2, n <= 1 ? 0 : i / (n - 1)) // drop 后的紫→粉渐变（逐字取色）

// 一行字：每个字钉在 900 字重槽位里原位变粗
const Row: React.FC<{ frame: number; chars: string[]; lag?: number; outline?: boolean; opacity?: number }> = ({ frame, chars, lag = 0, outline = false, opacity = 1 }) => {
  const f = frame - lag
  const CENTER = (chars.length - 1) / 2
  const drop = clamp01(f - DROP + 1) > 0
  return (
    <div style={{ display: 'flex', whiteSpace: 'pre', ...type(SIZE, W_REST), letterSpacing: '-0.01em', lineHeight: 1, opacity }}>
      {chars.map((ch, i) => {
        const decay = DECAY + Math.max(0, Math.abs(i - CENTER) - 0.5) * SPREAD
        const { env: e0, beat } = pulse(f, decay)
        const de = dropEnv(f, decay)
        const e = Math.max(e0, de)
        const weight = Math.round(W_REST + (W_PEAK - W_REST) * e)
        const down = beat >= 0 && DOWN.has(beat)
        const hitCol = down ? L.accent2 : L.accent
        const tint = drop ? 1 : Math.min(1, e0 * 1.25)
        const col = drop ? GRAD(i, chars.length) : mixRgb(L.ink, hitCol === L.accent2 ? L.accent2 : '#c9b8ff', tint)
        const shine = drop ? 0.35 + 0.65 * Math.pow(1 - clamp01((f - DROP) / 24), 2) : e0
        return (
          <span key={i} style={{ position: 'relative', display: 'inline-block' }}>
            <span style={{ visibility: 'hidden', fontWeight: W_PEAK }}>{ch}</span>
            <span style={{
              position: 'absolute', left: '50%', top: 0, transform: 'translateX(-50%)', fontWeight: weight,
              color: outline ? 'transparent' : col,
              WebkitTextStroke: outline ? `2px ${alpha(drop ? L.accent : L.ink, 0.55)}` : undefined,
              textShadow: !outline && shine > 0.05
                ? `0 0 ${(18 * shine).toFixed(1)}px ${alpha(drop ? GRAD(i) : hitCol, 0.5 * shine)}, 0 0 ${(70 * shine).toFixed(1)}px ${alpha(drop ? GRAD(i) : hitCol, 0.35 * shine)}`
                : 'none',
            }}>
              {ch}
            </span>
          </span>
        )
      })}
    </div>
  )
}

export const FontWeightPump: React.FC<{ word?: string; brand?: string; duration?: number }> = ({
  word = TEXT_FALLBACK, brand = 'Studio', duration,
}) => {
  const frame = useCurrentFrame()
  const TEXT = word
  const chars = TEXT.split('')
  const { env, beat } = pulse(frame, DECAY)
  const dEnv = frame >= DROP ? Math.pow(1 - clamp01((frame - DROP) / 16), 1.2) : 0
  const down = beat >= 0 && DOWN.has(beat)
  const scaleX = 1 + 0.06 * (down ? env : 0) + 0.08 * dEnv // 重音拍 / drop 横向撑开（transform 不改排版）
  const intro = ramp(frame, 0, 12, EASE.out)
  // 回声：64f 起淡入并拉开；每拍晚 2f 被推开 26px；drop 推开 60px 后归位
  const echoIn = ramp(frame, ECHO_IN, 10, EASE.snappy)
  const { env: eEnv } = pulse(frame - LAG, DECAY + 2)
  const eDrop = frame >= DROP + LAG ? Math.pow(1 - clamp01((frame - DROP - LAG) / 18), 1.6) : 0
  const echoPush = mix(-40, 0, echoIn) + 26 * eEnv * echoIn + 60 * eDrop
  const breathe = 0.5 + 0.5 * Math.sin(frame / 9)
  const glowA = 0.1 + 0.05 * breathe * (1 - clamp01(frame / 16)) + 0.3 * env * (down ? 1.3 : 1) + 0.4 * dEnv + (frame >= DROP ? 0.12 : 0)
  // 横向光带：drop 时从左扫到右一次
  const streak = ramp(frame, DROP, 16, EASE.out)
  const bar = frame >= BEATS[4] ? 2 : 1

  const label: React.CSSProperties = { ...type(30, 600, { caps: true }), letterSpacing: '0.16em' }

  return (
    <AbsoluteFill style={{ overflow: 'hidden', opacity: duration ? 1 - ramp(frame, duration - 8, 8, EASE.out) : 1 }}>

      {/* 字后柔光：随拍明暗，只在标题身后 */}
      <div style={{
        position: 'absolute', left: 260, right: 260, top: CY - 240, height: 480, borderRadius: '50%',
        background: `radial-gradient(ellipse 50% 50% at 50% 50%, ${alpha(down || frame >= DROP ? L.accent2 : L.accent, Math.min(0.6, glowA))} 0%, ${alpha(L.accent, 0)} 100%)`,
        mixBlendMode: 'screen',
      }} />

      {/* 眉题 */}
      <div style={{ position: 'absolute', left: 120, top: 92, display: 'flex', alignItems: 'center', gap: 14, opacity: intro }}>
        <span style={{ width: 46, height: 46, borderRadius: '50%', background: L.ink3, opacity: 0.5, display: 'inline-block' }} />
        {/* 字标全小写，不走眉题的 caps 样式 */}
        <span style={{ ...type(30, 700), letterSpacing: '0.03em', color: L.ink }}>{brand}</span>
      </div>
      <div style={{ position: 'absolute', right: 120, top: 96, ...label, color: L.ink2, opacity: intro, fontVariantNumeric: 'tabular-nums' }}>
        128 BPM <span style={{ color: L.ink3, marginLeft: 18 }}>{`BAR ${bar} / 2`}</span>
      </div>

      {/* 回声行（描边）：上下各一行 */}
      {[-1, 1].map(s => (
        <div key={s} style={{
          position: 'absolute', left: 0, right: 0, top: CY - SIZE / 2 + s * (ECHO_DY + echoPush), display: 'flex', justifyContent: 'center',
          opacity: echoIn, transform: `scaleX(${(1 + (scaleX - 1) * 0.5).toFixed(4)})`,
        }}>
          <Row frame={frame} chars={chars} lag={LAG} outline opacity={0.75} />
        </div>
      ))}

      {/* 主字 */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: CY - SIZE / 2, display: 'flex', justifyContent: 'center',
        transform: `scaleX(${scaleX.toFixed(4)})`,
      }}>
        <Row frame={frame} chars={chars} />
      </div>

      {/* drop 光带：一次，横穿主字 */}
      {streak > 0 && streak < 1 && (
        <div style={{
          position: 'absolute', left: mix(-600, 1920, streak), top: CY - 4, width: 600, height: 6, borderRadius: 3,
          background: `linear-gradient(90deg, ${alpha('#ffffff', 0)} 0%, ${alpha('#ffffff', 0.9)} 70%, ${alpha('#ffffff', 0)} 100%)`,
          boxShadow: `0 0 30px ${alpha(L.accent2, 0.8)}`, opacity: 1 - streak * 0.6, mixBlendMode: 'screen',
        }} />
      )}

      {/* 副标题：drop 后逐词升起 */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 850, textAlign: 'center', ...type(40, 500), color: L.ink2 }}>
        <TextReveal text="Beat-synced cuts, right on the drop." by="word" variant="rise" start={DROP + 8} each={14} gap={2.5} />
      </div>

      {/* 步进音序器：8 拍 + drop */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 944, display: 'flex', justifyContent: 'center', gap: 16, opacity: intro }}>
        {[...BEATS, DROP].map((b, i) => {
          const isDrop = i === BEATS.length
          const e = isDrop ? dEnv : envAt(frame, b, DECAY)
          const passed = frame >= b
          const dn = DOWN.has(i) || isDrop
          const col = dn ? L.accent2 : L.accent
          return (
            <div key={i} style={{
              width: isDrop ? 132 : 54, height: 54, borderRadius: 12, position: 'relative', marginLeft: i === 4 || isDrop ? 22 : 0,
              background: alpha(L.ink, 0.05), boxShadow: `inset 0 0 0 1.5px ${alpha(dn ? L.accent2 : L.ink, dn ? 0.35 : 0.14)}`,
              transform: `scale(${(1 + 0.12 * e).toFixed(3)})`,
            }}>
              <div style={{
                position: 'absolute', inset: 0, borderRadius: 12, background: col,
                opacity: e > 0.02 ? Math.max(isDrop ? 0.9 : 0, 0.35 + 0.65 * e) : passed ? (isDrop ? 0.9 : 0.28) : 0,
                boxShadow: e > 0.02 ? `0 0 ${(30 * e).toFixed(1)}px ${alpha(col, 0.8)}` : 'none',
              }} />
              {isDrop && (
                <span style={{
                  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  ...type(22, 800, { caps: true }), letterSpacing: '0.2em', color: passed ? L.onAccent : L.ink3,
                }}>
                  Drop
                </span>
              )}
            </div>
          )
        })}
      </div>
    </AbsoluteFill>
  )
}


export const KARAOKE_FILL_SYNC_DURATION = 150

type Word = { text: string; start: number; end: number }

// 默认两行词；定时在组件内按行内词数均匀分配（原 demo 为手写 start/end）
const KSIZE = 150
const FEATHER = 4 // 揭开前沿柔边（%）
const ACC = [91, 99, 211] // G.accent
const INK = [23, 24, 28] // G.ink1

const rgbMix = (a: number[], b: number[], k: number) =>
  `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`

const KaraokeWord: React.FC<{ word: Word; frame: number }> = ({ word, frame }) => {
  // 词内 linear 填充进度，clamp 保证读完保持（跟语速，不加缓动）
  const p = interpolate(frame, [word.start, word.end], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const edge = p * (100 + FEATHER * 2) - FEATHER // 柔边中心（%），p=0/1 时完全藏 / 完全露
  const mask = `linear-gradient(90deg, #000 ${(edge - FEATHER).toFixed(2)}%, transparent ${(edge + FEATHER).toFixed(2)}%)`
  const settle = ramp(frame, word.end, 10, EASE.out) // 读完退成主墨色
  const fillColor = rgbMix(ACC, INK, settle)
  // 读指：读中跟随前沿，读完 6f 从左往右收掉
  const retract = ramp(frame, word.end, 6, EASE.swift)
  const showLine = frame >= word.start && retract < 1
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      {/* 底层：低透明墨色未读字 */}
      <span style={{ color: 'rgba(23,24,28,0.13)' }}>{word.text}</span>
      {/* 上层：按进度从左到右柔边揭开 */}
      {p > 0 && (
        <span style={{
          position: 'absolute', inset: 0, color: fillColor,
          WebkitMaskImage: mask, maskImage: mask,
        }}>
          {word.text}
        </span>
      )}
      {/* 读指下划线：右缘跟随填充前沿，读完从左收 */}
      {showLine && (
        <span style={{
          position: 'absolute', bottom: -6, height: 8, borderRadius: 4,
          left: `${(retract * p * 100).toFixed(2)}%`,
          width: `${(Math.max(0, p - retract * p) * 100).toFixed(2)}%`,
          background: G.accent, boxShadow: '0 2px 10px rgba(91,99,211,0.35)',
        }} />
      )}
    </span>
  )
}

// 旁白波形：48 根竖条，按"此刻是否在读词"给包络，确定性哈希给起伏
const BARS = 48
const WAVE_W = 560
const WAVE_T0 = 14
const WAVE_T1 = 136
const h = (n: number) => {
  const s = Math.sin(n * 91.7 + 13.1) * 43758.5453
  return s - Math.floor(s)
}
const speechAt = (f: number) => {
  let e = 0.06
  for (const w of ALL) {
    const fadeIn = ramp(f, w.start - 2, 3, EASE.out)
    const fadeOut = 1 - ramp(f, w.end - 2, 4, EASE.out)
    e = Math.max(e, fadeIn * fadeOut)
  }
  return e
}

export const KaraokeFillSync: React.FC<{ line1?: string; line2?: string; duration?: number }> = ({
  line1 = 'FRAME MOTION', line2 = 'CRAFT SHOTS', duration,
}) => {
  const frame = useCurrentFrame()
  // 两行词定时：行1 20–75f / 行2 85–130f，行内按词数均匀分配（含小间隔）
  const mkLine = (text: string, s0: number, s1: number): Word[] => {
    const ws = text.split(/\s+/).filter(Boolean)
    return ws.map((w, i) => {
      const span = (s1 - s0) / ws.length
      return { text: w, start: Math.round(s0 + i * span + 2), end: Math.round(s0 + (i + 1) * span - 3) }
    })
  }
  const LINES: Word[][] = [mkLine(line1, 20, 75), mkLine(line2, 85, 130)]
  const ALL = LINES.flat()
  const playhead = (frame - WAVE_T0) / (WAVE_T1 - WAVE_T0)
  const tailFade = duration ? 1 - ramp(frame, duration - 8, 8, EASE.out) : 1
  return (
    <div style={{ width: 1920, height: 1080, position: 'relative', overflow: 'hidden', fontFamily: FONT.sans, opacity: tailFade }}>

      {/* 标语：两行居中 */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: 0, bottom: 60,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        fontSize: KSIZE, fontWeight: 800, letterSpacing: tracking(KSIZE, true), lineHeight: 1.18,
      }}>
        {LINES.map((words, li) => (
          <div key={li} style={{ display: 'flex', gap: 56 }}>
            {words.map(w => (
              <KaraokeWord key={w.text} word={w} frame={frame} />
            ))}
          </div>
        ))}
      </div>

      {/* 旁白波形：已播部分强调色，未播部分淡墨 */}
      <div style={{
        position: 'absolute', left: 960 - WAVE_W / 2, top: 860, width: WAVE_W, height: 56,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        {Array.from({ length: BARS }, (_, i) => {
          const u = i / (BARS - 1)
          const at = WAVE_T0 + u * (WAVE_T1 - WAVE_T0) // 这根条对应的旁白时刻
          const env = speechAt(at)
          const amp = 0.12 + env * (0.35 + 0.65 * h(i * 3 + 1))
          const played = u <= playhead
          return (
            <div key={i} style={{
              width: 4, height: `${(amp * 100).toFixed(1)}%`, borderRadius: 2,
              background: played ? G.accent : 'rgba(23,24,28,0.16)',
              opacity: played ? 0.9 : 1,
            }} />
          )
        })}
      </div>
    </div>
  )
}


export const TYPE_RHYTHM_SYNC_DURATION = 165 // 两式中最长的 A；B=150

export interface TypeRhythmSyncProps {
  /** 两式切换 */
  variant?: 'font-weight-pump' | 'karaoke-fill-sync'
  /** A 的泵动词 */
  word?: string
  /** A 的眉题字标 */
  brand?: string
  /** B 的第一行词（空格分隔） */
  line1?: string
  /** B 的第二行词（空格分隔） */
  line2?: string
  /** 总时长（帧，30fps）；尾 8f 淡出 */
  duration?: number
}

export const TYPE_RHYTHM_SYNC_DEFAULTS: Required<TypeRhythmSyncProps> = {
  variant: 'font-weight-pump',
  word: 'LOUDER',
  brand: 'Studio',
  line1: 'FRAME MOTION',
  line2: 'CRAFT SHOTS',
  duration: TYPE_RHYTHM_SYNC_DURATION,
}

export const TYPE_RHYTHM_SYNC_SCHEMA = [
  { type: 'select', key: 'variant', label: '两式', default: 'font-weight-pump',
    options: ['font-weight-pump', 'karaoke-fill-sync'], required: true },
  { type: 'text', key: 'word', label: '泵动词（A）', default: 'LOUDER', required: true },
  { type: 'text', key: 'brand', label: '眉题字标（A）', default: 'Studio' },
  { type: 'text', key: 'line1', label: '第一行（B）', default: 'FRAME MOTION' },
  { type: 'text', key: 'line2', label: '第二行（B）', default: 'CRAFT SHOTS' },
  { type: 'number', key: 'duration', label: '总时长', default: TYPE_RHYTHM_SYNC_DURATION, min: 80, max: 400, step: 1, unit: '帧' },
] as const

export const TypeRhythmSync: React.FC<TypeRhythmSyncProps> = (props) => {
  const p = { ...TYPE_RHYTHM_SYNC_DEFAULTS, ...props }
  return p.variant === 'karaoke-fill-sync'
    ? <KaraokeFillSync line1={p.line1} line2={p.line2} duration={p.duration} />
    : <FontWeightPump word={p.word} brand={p.brand} duration={p.duration} />
}
