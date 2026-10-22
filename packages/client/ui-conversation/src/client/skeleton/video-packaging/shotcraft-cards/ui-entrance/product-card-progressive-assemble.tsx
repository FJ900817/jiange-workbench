// ─── 改编来源 ───
// video-shotcraft (Apache License 2.0) · https://github.com/Vincentwei1021/video-shotcraft
// 原卡: demos/ui-entrance/product-card-progressive-assemble/ProductCardProgressiveAssemble.tsx
// 参考: references/shots/ui-entrance/product-card-progressive-assemble.md
// 改动:
//  1. 硬编码文案提为带默认值的 props：kicker/title/pills/oldPrice/price/chip/
//     body（3 行，支持 *词* 马克笔强调）/cta
//  2. 商品图 ProductMark 原为 video-shotcraft 镜刻标志 → 中性圆角方块（取 title 首字）
//  3. SWATCHES 原为品牌四色 → 中性四色（Ink/Paper/Amber/Slate 通用色名保留）
//  4. 去掉 Stage（porcelain 浅场），改为透明底；本卡为浅场设计，宜叠在浅画面上
//  5. 组装节奏命门保持常量（F 各槽位 at / LAND 落位 / 价格降级 strike / Free 弹簧）
//  6. 新增 duration prop：尾 8f 淡出跟 duration 走（不传则无淡出）

import React from 'react'
import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { EASE, FONT, mix, ramp } from '../_fixtures/Polish'
import { LOOKS, alpha, springAt, type } from '../_fixtures/Look'

export const PRODUCT_CARD_PROGRESSIVE_ASSEMBLE_DURATION = 172

const L = LOOKS.porcelain
const BLUE = L.accent

// 卡片几何（画面坐标）
const CW = 1520
const CH = 840
const CL = (1920 - CW) / 2
const CT = (1080 - CH) / 2 + 6
const PAD = 60
const IMG = { x: PAD, y: PAD, w: 640, h: CH - PAD * 2 }
const COL = PAD + 640 + 64 // 右列 x（卡片局部）
const COLW = CW - COL - PAD

// 字段槽位（卡片局部坐标）+ 光标到达帧
type Box = { x: number; y: number; w: number; h: number }
const F = {
  img: { box: { ...IMG }, at: 8 },
  title: { box: { x: COL, y: 66, w: 560, h: 150 }, at: 20 },
  pills: { box: { x: COL, y: 244, w: 560, h: 52 }, at: 30 },
  price: { box: { x: COL, y: 322, w: 670, h: 112 }, at: 42 }, // w 670：框住 OPEN SOURCE chip
  body: { box: { x: COL, y: 462, w: COLW, h: 150 }, at: 76 },
  swatch: { box: { x: COL, y: 636, w: 520, h: 56 }, at: 96 },
  cta: { box: { x: COL, y: 716, w: COLW, h: 64 }, at: 114 },
}
const ORDER: (keyof typeof F)[] = ['img', 'title', 'pills', 'price', 'body', 'swatch', 'cta']
const HOP = 6 // 光标跳格帧数
const LAND = 2 // 字段在光标到达后几帧开始落位
const PRICE_DROP = 62

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)

// 光标当前框：在相邻两个字段框之间按 swift 插值
const cursorBox = (f: number): Box & { k: number } => {
  let prev = F[ORDER[0]].box as Box
  for (let i = 0; i < ORDER.length; i++) {
    const cur = F[ORDER[i]]
    const t0 = cur.at - HOP
    if (f < cur.at) {
      const k = i === 0 ? 1 : ramp(f, t0, HOP, EASE.swift)
      const b = cur.box as Box
      return { x: mix(prev.x, b.x, k), y: mix(prev.y, b.y, k), w: mix(prev.w, b.w, k), h: mix(prev.h, b.h, k), k }
    }
    prev = cur.box as Box
  }
  return { ...prev, k: 1 }
}

// 字段落位：骨架淡出 + 内容上移 18px 失焦淡入（snappy 14f）
const landP = (f: number, key: keyof typeof F, extra = 0) => ramp(f, F[key].at + LAND + extra, 14, EASE.snappy)
const rise = (p: number, dist = 18): React.CSSProperties => ({
  opacity: clamp01(p * 1.8),
  transform: `translateY(${((1 - p) * dist).toFixed(2)}px)`,
  filter: p < 0.98 ? `blur(${((1 - p) * 6).toFixed(2)}px)` : undefined,
})
const pop = (f: number, start: number): React.CSSProperties => {
  const s = springAt(f, start, { damping: 13, stiffness: 260 })
  return { opacity: clamp01((f - start) / 4), transform: `scale(${mix(0.4, 1, s).toFixed(4)})` }
}

// 骨架条（字段落位前的浅灰占位）
const Skeleton: React.FC<{ box: Box; fade: number; rows?: number[]; radius?: number }> = ({ box, fade, rows = [1], radius = 10 }) =>
  fade >= 1 ? null : (
    <div style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, opacity: 1 - fade, display: 'flex', flexDirection: 'column', gap: 14, justifyContent: 'center' }}>
      {rows.map((w, i) => (
        <div key={i} style={{ height: Math.min(28, (box.h - 14 * (rows.length - 1)) / rows.length), width: `${w * 100}%`, borderRadius: radius, background: '#e8edf5' }} />
      ))}
    </div>
  )

// 商品：中性圆角方块（取 title 首字）当棚拍主体，下方一团独立的地面接触影
const ProductMark: React.FC<{ label: string }> = ({ label }) => (
  <div style={{ position: 'relative', width: '100%', height: '100%' }}>
    <div style={{
      position: 'absolute', left: 40, right: 40, top: 326, height: 52, borderRadius: '50%',
      background: `radial-gradient(closest-side, ${alpha(L.shadow, 0.26)}, ${alpha(L.shadow, 0)})`,
    }} />
    <div style={{
      position: 'absolute', left: 46, top: 26, width: 368, height: 368, borderRadius: 72,
      background: `linear-gradient(135deg, ${L.accent}, ${L.accent2})`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: FONT.sans, fontWeight: 800, fontSize: 180, color: '#ffffff',
    }}>{label}</div>
  </div>
)

const BODY_FALLBACK = [
  'Shot recipes that *direct every move*.',
  'Built on *real page captures* and 2.5D,',
  'cut to the beat, rendered in Remotion.',
]
// 色卡（成片 look 可选）
const SWATCHES: [string, string][] = [['#17181c', 'Ink'], ['#f4f4f2', 'Paper'], ['#e8a33d', 'Amber'], ['#5b6472', 'Slate']]

export interface ProductCardProgressiveAssembleProps {
  /** 眉标 */
  kicker?: string
  /** 商品标题 */
  title?: string
  /** 分类 pill（数组或逗号分隔） */
  pills?: string[] | string
  /** 原价（会被划掉降级） */
  oldPrice?: string
  /** 现价 */
  price?: string
  /** 价格旁 chip */
  chip?: string
  /** 正文 3 行（支持 *词* 马克笔强调） */
  body?: string[] | string
  /** CTA 按钮文案 */
  cta?: string
  /** 总时长（帧，30fps）；尾 8f 淡出 */
  duration?: number
}

export const PRODUCT_CARD_PROGRESSIVE_ASSEMBLE_DEFAULTS: Required<Omit<ProductCardProgressiveAssembleProps, 'pills' | 'body'>> & { pills: string[]; body: string[] } = {
  kicker: 'VIDEO-SHOTCRAFT · AGENT SKILL',
  title: 'Shotcraft',
  pills: ['Agent skill', 'Remotion', 'Shot recipes'],
  oldPrice: '$449',
  price: 'Free',
  chip: 'OPEN SOURCE',
  body: BODY_FALLBACK,
  cta: 'Get the skill — Free',
  duration: PRODUCT_CARD_PROGRESSIVE_ASSEMBLE_DURATION,
}

export const PRODUCT_CARD_PROGRESSIVE_ASSEMBLE_SCHEMA = [
  { type: 'text', key: 'kicker', label: '眉标', default: 'VIDEO-SHOTCRAFT · AGENT SKILL' },
  { type: 'text', key: 'title', label: '商品标题', default: 'Shotcraft', required: true },
  { type: 'textarea', key: 'pills', label: '分类 pill（逗号/换行分隔）', default: 'Agent skill\nRemotion\nShot recipes' },
  { type: 'text', key: 'oldPrice', label: '原价', default: '$449' },
  { type: 'text', key: 'price', label: '现价', default: 'Free' },
  { type: 'text', key: 'chip', label: '价格 chip', default: 'OPEN SOURCE' },
  { type: 'textarea', key: 'body', label: '正文（3 行，*词* 强调）', default: BODY_FALLBACK.join('\n') },
  { type: 'text', key: 'cta', label: 'CTA 文案', default: 'Get the skill — Free' },
  { type: 'number', key: 'duration', label: '总时长', default: PRODUCT_CARD_PROGRESSIVE_ASSEMBLE_DURATION, min: 100, max: 400, step: 1, unit: '帧' },
] as const

// *词* inline 解析（支持中文无空格）→ [文本, 是否强调] 分段
const parseEm = (line: string): [string, boolean][] => {
  const segs: [string, boolean][] = []
  const re = /\*([^*]+)\*/g
  let last = 0; let m: RegExpExecArray | null
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) segs.push([line.slice(last, m.index), false])
    segs.push([m[1], true])
    last = m.index + m[0].length
  }
  if (last < line.length) segs.push([line.slice(last), false])
  return segs.length ? segs : [[line, false]]
}

export const ProductCardProgressiveAssemble: React.FC<ProductCardProgressiveAssembleProps> = (props) => {
  const p = { ...PRODUCT_CARD_PROGRESSIVE_ASSEMBLE_DEFAULTS, ...props }
  const frame = useCurrentFrame()
  const tailFade = p.duration ? 1 - ramp(frame, p.duration - 8, 8, EASE.out) : 1
  const pills = (Array.isArray(p.pills) ? p.pills : String(p.pills).split(/[\n,，、]+/).map(w => w.trim()).filter(Boolean)).slice(0, 4)
  const bodyLines = (Array.isArray(p.body) ? p.body : String(p.body).split(/[\n]+/).map(w => w.trim()).filter(Boolean)).slice(0, 3)
  const LINES = bodyLines.map(parseEm)

  const enter = ramp(frame, 0, 14, EASE.snappy)
  const push = 1 + 0.035 * ramp(frame, 0, 132, EASE.swift)

  // 各字段进度
  const img = landP(frame, 'img')
  const title = landP(frame, 'title')
  const price = landP(frame, 'price')
  const sw = landP(frame, 'swatch')
  const cta = ramp(frame, F.cta.at + LAND, 12, EASE.out)

  // 价格降级（6f 同窗：缩小 + 变灰 + 删除线）
  const cut = ramp(frame, PRICE_DROP, 6, EASE.snappy)
  const strike = ramp(frame, PRICE_DROP, 5, EASE.out)
  const newP = springAt(frame, PRICE_DROP + 1, { damping: 14, stiffness: 240 })
  const chip = ramp(frame, PRICE_DROP + 7, 10, EASE.snappy)

  // 光标
  const cb = cursorBox(frame)
  const cursorIn = ramp(frame, 2, 6, EASE.out)
  const cursorOut = ramp(frame, F.cta.at + 8, 8, EASE.exit)
  const cursorOp = cursorIn * (1 - cursorOut)
  const pad = 14 * (1 - cursorOut)

  return (
    <AbsoluteFill style={{ background: 'transparent', overflow: 'hidden', opacity: tailFade }}>
      {/* 远景：一块极淡的钴蓝光晕在卡片右后方（空间层次） */}
      <div style={{ position: 'absolute', left: 1100, top: 520, width: 900, height: 700, background: `radial-gradient(closest-side, ${alpha(BLUE, 0.08)}, ${alpha(BLUE, 0)})` }} />

      <div style={{
        position: 'absolute', left: CL, top: CT, width: CW, height: CH,
        transform: `translateY(${((1 - enter) * 30).toFixed(2)}px) scale(${(mix(0.96, 1, enter) * push).toFixed(5)})`,
        transformOrigin: '50% 55%', opacity: clamp01(enter * 1.6),
      }}>
        {/* 卡面：白 + 发丝线 + 内高光 + 两层带色相软阴影 */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 36, background: 'linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%)',
          boxShadow: `inset 0 1px 0 #ffffff, 0 0 0 1px ${L.line}, 0 2px 4px ${alpha(L.shadow, 0.06)}, 0 40px 90px -20px ${alpha(L.shadow, 0.28)}`,
        }} />

        {/* 骨架槽位 */}
        <Skeleton box={{ x: COL, y: 66, w: 200, h: 26 }} fade={title} />
        <Skeleton box={{ x: COL, y: 112, w: 520, h: 96 }} fade={title} rows={[0.85]} radius={16} />
        <Skeleton box={F.pills.box} fade={landP(frame, 'pills')} rows={[0.62]} radius={26} />
        <Skeleton box={F.price.box} fade={price} rows={[0.38]} radius={16} />
        <Skeleton box={F.body.box} fade={landP(frame, 'body')} rows={[0.92, 0.86, 0.6]} />
        <Skeleton box={F.swatch.box} fade={sw} rows={[0.5]} radius={28} />
        <Skeleton box={F.cta.box} fade={cta} rows={[1]} radius={32} />

        {/* 图：棚拍无缝背景 + 标志 */}
        <div style={{ position: 'absolute', left: IMG.x, top: IMG.y, width: IMG.w, height: IMG.h, borderRadius: 24, overflow: 'hidden', background: '#eef2f8' }}>
          <div style={{ position: 'absolute', inset: 0, opacity: img, background: 'radial-gradient(110% 80% at 38% 26%, #ffffff 0%, #eef2f8 46%, #dde4ee 100%)' }} />
          <div style={{ position: 'absolute', left: 0, right: 0, top: '72%', bottom: 0, opacity: img, background: `linear-gradient(180deg, ${alpha(L.shadow, 0.04)}, ${alpha(L.shadow, 0)})` }} />
          <div style={{
            position: 'absolute', left: 90, top: 150, width: 460, height: 483,
            opacity: clamp01(img * 1.5),
            transform: `translateY(${((1 - img) * 26).toFixed(2)}px) scale(${mix(1.08, 1, ramp(frame, 10, 40, EASE.out)).toFixed(4)})`,
            filter: img < 0.98 ? `blur(${((1 - img) * 10).toFixed(2)}px)` : undefined,
          }}>
            <ProductMark label={(p.title || 'S').slice(0, 1)} />
          </div>
          <div style={{ position: 'absolute', left: 32, top: 30, fontFamily: FONT.mono, fontSize: 22, letterSpacing: '0.14em', color: L.ink3, opacity: img }}>01 / 06</div>
        </div>

        {/* 眉标 + 标题 */}
        <div style={{ position: 'absolute', left: COL, top: 66, fontFamily: FONT.mono, fontSize: 22, letterSpacing: '0.18em', color: L.ink3, ...rise(title, 10) }}>
          {p.kicker}
        </div>
        <div style={{ position: 'absolute', left: COL - 4, top: 104, ...type(112, 720), color: L.ink, letterSpacing: '-0.045em', whiteSpace: 'nowrap', ...rise(landP(frame, 'title', 2), 26) }}>
          {p.title}
        </div>

        {/* 分类 pill：错峰 pop */}
        <div style={{ position: 'absolute', left: COL, top: F.pills.box.y, display: 'flex', gap: 12 }}>
          {pills.map((t, i) => (
            <div key={t} style={{
              ...type(28, 560), color: i === 2 ? L.ink : L.ink2, padding: '10px 22px', borderRadius: 99,
              background: i === 2 ? '#ffffff' : L.surface2, boxShadow: i === 2 ? `inset 0 0 0 1.5px ${alpha(L.ink, 0.16)}` : `inset 0 0 0 1px ${L.line}`,
              transformOrigin: 'left center', ...pop(frame, F.pills.at + LAND + i * 3),
            }}>{t}</div>
          ))}
        </div>

        {/* 价格行：$449 落位 → 降级；Free 弹簧跳出；chip 滑入 */}
        <div style={{ position: 'absolute', left: COL, top: F.price.box.y, height: 112, width: 680, ...rise(price, 16) }}>
          <div style={{
            position: 'absolute', left: 0, bottom: 4, ...type(112, 760), letterSpacing: '-0.04em',
            color: cut > 0.5 ? L.ink3 : L.ink, transform: `scale(${mix(1, 0.46, cut).toFixed(4)})`, transformOrigin: '0% 88%', whiteSpace: 'nowrap',
          }}>
            {p.oldPrice}
            <span style={{
              position: 'absolute', left: -6, right: -6, top: '50%', height: 9, borderRadius: 4, background: L.ink3,
              transform: `scaleX(${strike.toFixed(4)})`, transformOrigin: 'left center',
            }} />
          </div>
          <div style={{
            position: 'absolute', left: 150, bottom: 4, ...type(112, 780), letterSpacing: '-0.04em', color: BLUE, whiteSpace: 'nowrap',
            opacity: clamp01((frame - PRICE_DROP - 1) / 3), transform: `scale(${mix(1.18, 1, newP).toFixed(4)})`, transformOrigin: '0% 80%',
          }}>
            {p.price}
          </div>
          <div style={{
            position: 'absolute', left: 412, top: 40, ...type(26, 700), color: BLUE, background: alpha(BLUE, 0.1),
            boxShadow: `inset 0 0 0 1.5px ${alpha(BLUE, 0.25)}`, padding: '8px 16px', borderRadius: 99, letterSpacing: '0.04em', whiteSpace: 'nowrap',
            opacity: chip, transform: `translateX(${((1 - chip) * -16).toFixed(2)}px)`,
          }}>
            {p.chip}
          </div>
        </div>

        {/* 正文：三行错峰 + 马克笔高亮 */}
        <div style={{ position: 'absolute', left: COL, top: F.body.box.y, width: COLW, ...type(34, 450), lineHeight: '50px', color: L.ink2, letterSpacing: '-0.012em' }}>
          {LINES.map((segs, li) => (
            <div key={li} style={{ whiteSpace: 'nowrap', ...rise(landP(frame, 'body', li * 3), 14) }}>
              {segs.map(([txt, mark], si) => !mark ? <span key={si}>{txt}</span> : (
                <span key={si} style={{ position: 'relative', display: 'inline-block' }}>
                  <span style={{
                    position: 'absolute', left: -4, right: -4, top: 6, bottom: 4, borderRadius: '4px 8px 6px 3px',
                    background: alpha(BLUE, 0.16), transform: `scaleX(${ramp(frame, 86 + li * 4, 6, EASE.out).toFixed(4)})`, transformOrigin: 'left center',
                  }} />
                  <span style={{ position: 'relative', color: L.ink, fontWeight: 620 }}>{txt}</span>
                </span>
              ))}
            </div>
          ))}
        </div>

        {/* 色卡：四枚 pop + 色名 */}
        <div style={{ position: 'absolute', left: COL, top: F.swatch.box.y, height: 56, display: 'flex', alignItems: 'center', gap: 16 }}>
          {SWATCHES.map(([c], i) => (
            <div key={c} style={{
              width: 52, height: 52, borderRadius: 26, marginRight: i === 0 ? 4 : 0,
              background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.35), rgba(255,255,255,0) 55%), ${c}`,
              boxShadow: i === 0 ? `0 0 0 4px #ffffff, 0 0 0 6px ${L.ink}` : `inset 0 0 0 1px ${alpha(L.ink, 0.12)}`,
              ...pop(frame, F.swatch.at + LAND + i * 3),
            }} />
          ))}
          <div style={{ marginLeft: 14, ...type(30, 450), color: L.ink3, ...rise(ramp(frame, F.swatch.at + 12, 12, EASE.snappy), 10) }}>
            Look · <span style={{ color: L.ink, fontWeight: 650 }}>Ink</span>
          </div>
        </div>

        {/* 按钮：底色由左向右填满 */}
        <div style={{ position: 'absolute', left: F.cta.box.x, top: F.cta.box.y, width: F.cta.box.w, height: F.cta.box.h, borderRadius: 32, overflow: 'hidden', opacity: clamp01(cta * 4) }}>
          <div style={{ position: 'absolute', inset: 0, background: L.ink, transform: `scaleX(${cta.toFixed(4)})`, transformOrigin: 'left center' }} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, ...type(30, 650), color: '#ffffff', opacity: ramp(frame, F.cta.at + 8, 8, EASE.out) }}>
            {p.cta}
          </div>
        </div>

        {/* 填充光标：描边框 + AUTOFILL 签，领先字段跳格 */}
        {cursorOp > 0.01 && (
          <div style={{
            position: 'absolute', left: cb.x - pad, top: cb.y - pad, width: cb.w + pad * 2, height: cb.h + pad * 2,
            borderRadius: 22, border: `2.5px solid ${BLUE}`, background: alpha(BLUE, 0.04), opacity: cursorOp,
            boxShadow: `0 0 0 6px ${alpha(BLUE, 0.08)}, 0 10px 30px ${alpha(BLUE, 0.16)}`,
          }}>
            <div style={{
              position: 'absolute', right: 18, top: -17, height: 32, padding: '0 12px', borderRadius: 8, background: BLUE, color: '#ffffff',
              display: 'flex', alignItems: 'center', gap: 8, fontFamily: FONT.mono, fontSize: 18, letterSpacing: '0.14em', whiteSpace: 'nowrap',
            }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: '#ffffff', opacity: 0.6 + 0.4 * Math.sin(frame / 3) }} />
              AUTOFILL
            </div>
          </div>
        )}
      </div>
    </AbsoluteFill>
  )
}
