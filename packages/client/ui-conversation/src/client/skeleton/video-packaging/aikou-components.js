/**
 * AI口播包装库 (aikou) component renderers — route B: borrow the design, not the engine.
 *
 * Read-only sources (never modified): the component registry
 * (`AI口播包装库/03_组件/registry.json`), the render engine
 * (`AI口播包装库/07_引擎/engine/engine.html`) and the style tokens
 * (`AI口播包装库/04_风格/tokens.json`).
 *
 * This module is self-contained ESM with no imports so it can be inlined
 * into the editor document (see embedded-editor.ts): top-level `export`
 * statements are stripped there and every export becomes a document-global.
 * Keep every top-level declaration on its own `export ...` line and never
 * add a line starting with `import ` or `export ` inside strings/comments.
 */

/* ---------- math / text helpers (ported from the engine) ---------- */

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value))
const progress = (t, a, b) => clamp((t - a) / (b - a))
const lerp = (a, b, x) => a + (b - a) * x
const out3 = x => 1 - Math.pow(1 - x, 3)
const io2 = x => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2)

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]))

/** Split text into per-character spans; **word** becomes the blue keyword style. */
function chars(text) {
  let out = ''
  let blue = false
  for (const part of String(text ?? '').split(/(\*\*)/)) {
    if (part === '**') { blue = !blue; continue }
    for (const char of part) out += `<span class="ch${blue ? ' k' : ''}">${esc(char)}</span>`
  }
  return out
}

/**
 * Static version of the engine's revealChars: per-character inline styles that
 * reproduce the reveal state at time `t` (blur + rise-in), `blur`/`dy` follow
 * the engine's argument order.
 */
function charsAt(text, t, at, step = 0.035, dur = 0.32, blur = 8, dy = 10) {
  let out = ''
  let blue = false
  let index = 0
  for (const part of String(text ?? '').split(/(\*\*)/)) {
    if (part === '**') { blue = !blue; continue }
    for (const char of part) {
      const a = at + index * step
      const p = out3(progress(t, a, a + dur))
      const style = p < 1
        ? `opacity:${p.toFixed(3)};filter:blur(${((1 - p) * blur).toFixed(1)}px);transform:translateY(${((1 - p) * dy).toFixed(1)}px)`
        : 'opacity:1'
      out += `<span class="ch${blue ? ' k' : ''}" style="${style}">${esc(char)}</span>`
      index += 1
    }
  }
  return out
}

/** Timing window for one component: params may carry engine-style t0/t1. */
function timing(params) {
  const t0 = Number(params.t0 ?? 0)
  const t1 = Number(params.t1 ?? (t0 + 3600))
  return { t0: Number.isFinite(t0) ? t0 : 0, t1: Number.isFinite(t1) ? t1 : 3600 }
}

const fmtInt = value => Math.round(value).toLocaleString('en-US')

/* ---------- icon set (from the engine's ICV) ---------- */

const AIKOU_ICONS = {
  gem: (size = 34) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24"><path d="M12 2l7 5-1.6 9L12 22l-5.4-6L5 7z" fill="#8B6CFF"/><path d="M12 2l7 5-7 3-7-3z" fill="#B7A2FF"/><path d="M12 10l6.4 6L12 22l-5.4-6z" fill="#6A4CE0"/></svg>`,
  bolt: (size = 34) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24"><path d="M13 2L5 13.5h6L10 22l9-12h-6z" fill="#FFC857"/></svg>`,
  warn: (size = 34) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24"><path d="M12 3l10 18H2z" fill="none" stroke="#FF6B6B" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v5M12 17.5v.5" stroke="#FF6B6B" stroke-width="2.2" stroke-linecap="round"/></svg>`,
  user: (size = 34) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="#5AA2FF" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4.2-6.5 8-6.5s7 2 8 6.5"/></svg>`,
  task: (size = 34) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="#3DDC97" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 12.5l3 3 5-6"/></svg>`,
  check: (size = 20, color = '#fff') => `<svg width="${size}" height="${size}" viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
}

/* ---------- per-component static renderers (engine-faithful) ---------- */

function renderTag(p, t) {
  const { t0, t1 } = timing(p)
  const q = out3(progress(t, t0, t0 + 0.45))
  const e = out3(progress(t, t1 - 0.3, t1))
  const icon = (AIKOU_ICONS[p.icon] || AIKOU_ICONS.gem)(34)
  const style = `left:${p.x}px;top:${p.y}px;opacity:${(q * (1 - e)).toFixed(3)};`
    + `transform:translate(${Math.round((1 - q) * -34 + e * 20)}px,${(Math.sin(t * 1.6) * 3).toFixed(1)}px);`
    + `filter:${q < 1 ? `blur(${((1 - q) * 5).toFixed(1)}px)` : 'none'}`
  return `<div class="tg" style="${style}"><span class="ic">${icon}</span><div><b>${esc(p.label)}</b>${p.en ? `<small>${esc(p.en)}</small>` : ''}</div></div>`
}

function renderQa(p, t) {
  const { t0, t1 } = timing(p)
  const q = out3(progress(t, t0, t0 + 0.5))
  const e = out3(progress(t, t1 - 0.3, t1))
  const dir = p.dir ?? -1
  const style = `left:${p.x}px;top:${p.y}px;opacity:${(q * (1 - e)).toFixed(3)};`
    + `transform:translate(${Math.round((1 - q) * dir * 60)}px,${(Math.sin(t * 1.4 + p.x) * 3).toFixed(1)}px);`
    + `filter:${q < 1 ? `blur(${((1 - q) * 6).toFixed(1)}px)` : 'none'}`
  return `<div class="qa" style="${style}"><div class="q"><i></i>${esc(p.q)}</div><div class="a">${esc(p.a)}</div></div>`
}

function renderStat(p, t) {
  const { t1 } = timing(p)
  return p.items.map(k => {
    const q = out3(progress(t, k.at, k.at + 0.45))
    const e = out3(progress(t, t1 - 0.3, t1))
    const value = fmtInt(lerp(+k.from, +k.to, io2(progress(t, +k.a, +k.b))))
    const style = `left:${k.x}px;top:${k.y}px;opacity:${(q * (1 - e)).toFixed(3)};`
      + `transform:translateY(${Math.round((1 - q) * 30)}px);`
      + `filter:${q < 1 ? `blur(${((1 - q) * 6).toFixed(1)}px)` : 'none'}`
    return `<div class="st1" style="${style}"><span class="lb">${esc(k.label)}</span>`
      + `<div class="nm"><b class="cnt">${value}</b><span>${esc(k.unit || '')}</span><u>↑</u></div></div>`
  }).join('')
}

function renderMonths(p, t) {
  const { t0, t1 } = timing(p)
  const q = out3(progress(t, t0, t0 + 0.4))
  const e = out3(progress(t, t1 - 0.3, t1))
  const lit = Math.round(p.n * io2(progress(t, p.a, p.b)))
  const dots = Array.from({ length: p.n }, (_, i) =>
    `<i class="${i < lit ? 'on' : ''}">${i < lit ? AIKOU_ICONS.check(20, '#fff') : ''}</i>`).join('')
  const style = `left:${p.x}px;top:${p.y}px;width:${p.w || 380}px;opacity:${(q * (1 - e)).toFixed(3)};`
    + `transform:translateY(${Math.round((1 - q) * 24)}px)`
  return `<div class="mo" style="${style}"><small>${esc(p.label)}</small><div class="dots">${dots}</div>`
    + `<div class="big"><b class="mv">${esc(p.pre || '')}${lit}</b><span>${esc(p.unit)}</span></div></div>`
}

function renderNumlist(p, t) {
  const { t0 } = timing(p)
  const life = progress(t, p.life0 ?? t0, (p.life0 ?? t0) + 14)
  const T0 = p.instant ? -99 : t0
  const rows = p.items.map((it, i) => {
    const at = T0 + 0.25 + i * 0.2
    const pr = out3(progress(t, at, at + 0.45))
    let alpha = 1
    if (p.focus) {
      const hit = p.focus.filter(x => t >= x.t).pop()
      if (hit) alpha = hit.i === i ? 1 : lerp(1, 0.32, progress(t, hit.t, hit.t + 0.3))
    }
    let any = false
    const lines = it.lines.map(l => {
      const on = t >= l.at
      if (on) any = true
      return `<div class="ln" style="display:${on ? 'block' : 'none'}">${charsAt(l.text, t, l.at, 0.05, 0.35, 8, 10)}</div>`
    }).join('')
    const style = `opacity:${(pr * alpha).toFixed(3)};transform:translateX(${Math.round((1 - pr) * 24)}px);`
      + `filter:${pr < 1 ? `blur(${((1 - pr) * 6).toFixed(1)}px)` : 'none'}`
    return `<div class="row r${i}" style="${style}"><div class="no">${esc(it.no)}</div>`
      + `<div class="tx"><div class="q" style="display:${any ? 'none' : 'block'}">?</div>${lines}</div></div>`
  }).join('')
  return `<div class="nl" style="position:absolute;left:${p.x}px;top:${p.y}px;width:${p.w || 540}px;transform:translateY(${(-life * 10).toFixed(1)}px)">`
    + `<div class="label" style="margin-bottom:26px"><span class="e0">${charsAt(p.label, t, T0, 0.04, 0.3, 6, 8)}</span></div>${rows}</div>`
}

function renderStrips(p, t) {
  const { t0, t1 } = timing(p)
  const h = p.h ?? 58
  const gap = p.gap ?? 10
  const cols = (p.cols && p.cols.length ? p.cols : [{ x: p.x ?? 40, w: p.w ?? 520 }])
  const head = p.head ? (() => {
    const q = out3(progress(t, t0, t0 + 0.3))
    const e = progress(t, t1 - 0.25, t1)
    return `<div class="sthead" style="left:${cols[0].x}px;top:${p.y - 58}px;opacity:${(q * (1 - e)).toFixed(3)};transform:translateX(${Math.round((1 - q) * -20)}px)">${esc(p.head)}</div>`
  })() : ''
  const last = p.items.filter(it => t >= it.at).length - 1
  const strips = p.items.map((it, i) => {
    const col = cols[it.col || 0] || cols[0]
    const row = it.row ?? i
    const q = out3(progress(t, it.at, it.at + 0.28))
    const e = progress(t, t1 - 0.3 + i * 0.012, t1 - 0.05 + i * 0.012)
    const style = `--sf:${p.fs || 28}px;left:${col.x}px;top:${p.y + row * (h + gap)}px;width:${col.w}px;height:${h}px;`
      + `opacity:${(q * (1 - e)).toFixed(3)};transform:translateX(${Math.round((1 - q) * -36)}px)`
    return `<div class="strip${p.style === 'white' ? ' w' : ''}${i === last ? ' cur' : ''}" style="${style}">`
      + `<i class="no">${String(i + 1).padStart(2, '0')}</i><b>${esc(it.k)}</b><em>·</em>`
      + `<span class="v">${esc(it.v)}</span><small>${esc(it.en || '')}</small>`
      + `<i class="ok" style="opacity:${progress(t, it.at + 0.35, it.at + 0.5).toFixed(3)}">${AIKOU_ICONS.check(16, '#fff')}</i></div>`
  }).join('')
  return head + strips
}

/** Shared enter/hold/exit motion for the behind-person big type (engine bwAnim). */
function bwAnimStyle(t, at, out, { dy = 0, s0 = 1.12 } = {}) {
  const p = out3(progress(t, at, at + 0.3))
  const e = progress(t, out, out + 0.28)
  const hold = progress(t, at, out)
  return `opacity:${(p * (1 - e)).toFixed(3)};`
    + `filter:${(p < 1 || e > 0) ? `blur(${((1 - p) * 16 + e * 14).toFixed(1)}px)` : 'none'};`
    + `transform:translateY(${((1 - p) * dy).toFixed(1)}px) scale(${(lerp(s0, 1, p) * (1 + hold * 0.035) + e * 0.04).toFixed(4)})`
}

function renderCounter(p, t) {
  const { t0, t1 } = timing(p)
  const at = p.at ?? t0
  const out = p.out ?? (t1 - 0.28)
  const x = progress(t, p.c0 ?? t0, p.c1 ?? t1)
  const value = fmtInt(lerp(p.from, p.to, 1 - Math.pow(1 - x, 3)))
  const big = `<div class="bw lat" style="left:${p.x}px;top:${p.y}px;font-size:${p.size || 280}px;color:${p.color || '#F1D551'};${bwAnimStyle(t, at, out)}">`
    + `<span class="num">${value}</span>`
    + `${p.suffix ? `<span style="font-family:'Noto Sans CJK SC';font-weight:900;font-size:.38em;margin-left:.08em">${esc(p.suffix)}</span>` : ''}</div>`
  const label = p.label
    ? `<div class="bl" style="left:${p.label.x}px;top:${p.label.y}px;font-size:${p.label.size || 46}px;${bwAnimStyle(t, at + 0.2, out, { s0: 1, dy: 16 })}">`
      + `${esc(p.label.text)}${p.label.en ? `<small>${esc(p.label.en)}</small>` : ''}</div>`
    : ''
  return big + label
}

function renderTiles(p, t) {
  const { t0, t1 } = timing(p)
  return p.tiles.map(k => {
    const q = out3(progress(t, k.at ?? t0, (k.at ?? t0) + 0.3))
    const e = progress(t, t1 - 0.3, t1 - 0.05)
    const value = fmtInt(lerp(+k.from, +k.to, io2(progress(t, +k.c0, +k.c1))))
    const bar = (100 * io2(progress(t, k.c0, k.c1)) * (k.fill ?? 1)).toFixed(1)
    const style = `left:${k.x}px;top:${k.y}px;width:${k.w}px;height:${k.h}px;`
      + `opacity:${(q * (1 - e)).toFixed(3)};transform:translateY(${Math.round((1 - q) * -24)}px)`
    return `<div class="gtile" style="${style}"><small>${esc(k.label)}</small><b class="cnt">${value}</b><i class="bar"><u style="width:${bar}%"></u></i></div>`
  }).join('')
}

const AIKOU_RENDERERS = { tag: renderTag, qa: renderQa, stat: renderStat, months: renderMonths, numlist: renderNumlist, strips: renderStrips, counter: renderCounter, tiles: renderTiles }

/* ---------- component whitelist (from the registry, examples copied verbatim) ---------- */

export const AIKOU_COMPONENTS = {
  tag: {
    componentId: 'tag', name: '话题/应用标签', z: 'over',
    required: ['label', 'x', 'y'], optional: ['en', 'icon'],
    notes: '玻璃胶囊,图标 icon 可选 bolt/gem/task/user/warn;label 中文粗体,en 英文大写小字。竖屏放 x≈40,y≈300,停约 3–5 s。',
    example: { type: 'tag', t0: 5.9, t1: 10.8, x: 40, y: 300, label: 'AI 系统越来越失控', en: 'TOPIC · OUT OF CONTROL', icon: 'bolt' },
  },
  qa: {
    componentId: 'qa', name: '问答卡', z: 'over',
    required: ['q', 'a', 'x', 'y'], optional: ['dir'],
    notes: 'dir:-1 贴左上,1 贴右;两张可错落放在头顶与胸前。',
    example: { type: 'qa', t0: 105.75, t1: 109.6, x: 50, y: 320, q: '我是谁', a: '让 AI 记住你', dir: -1 },
  },
  stat: {
    componentId: 'stat', name: '数据口播字', z: 'over',
    required: ['items'], optional: ['dark', 'type'],
    notes: 'items 每项:x,y,label,from,to,unit,at(出现),a→b(计数时段);叠在人物旁,不遮脸。',
    example: { type: 'stat', t0: 135.4, t1: 142.45, items: [{ x: 50, y: 470, label: '项目', from: 3, to: 9, unit: '个', at: 135.7, a: 138.0, b: 141.4 }, { x: 50, y: 760, label: 'Skill', from: 5, to: 36, unit: '个', at: 136.3, a: 138.0, b: 141.8 }, { x: 660, y: 250, label: '规则', from: 12, to: 96, unit: '条', at: 136.9, a: 138.0, b: 142.0 }] },
  },
  months: {
    componentId: 'months', name: '圆点月份块', z: 'over',
    required: ['label', 'n', 'unit', 'x', 'y', 'a', 'b'], optional: ['w', 'pre'],
    notes: 'n 个圆点依次点亮(a→b),计数文字 pre+数字+unit。',
    example: { type: 'months', t0: 50.2, t1: 54.3, x: 640, y: 240, w: 380, label: '使用 Obsidian', n: 6, unit: '个月', pre: '≈ ', a: 50.7, b: 52.7 },
  },
  numlist: {
    componentId: 'numlist', name: '编号列表', z: 'over',
    required: ['label', 'items', 'x', 'y'], optional: ['w', 'focus', 'instant', 'life0'],
    notes: 'focus 高亮当前项。',
    example: { type: 'numlist', t0: 15.55, t1: 21.3, x: 1330, y: 230, w: 540, label: '两个失控问题', items: [{ no: '01', lines: [{ text: 'AI 越来越**能干**，', at: 22.6 }, { text: '我却越来越**看不懂**', at: 25.4 }] }, { no: '02', lines: [{ text: '更**离谱**的', at: 28.5 }] }], focus: [{ t: 20.75, i: 0 }] },
  },
  strips: {
    componentId: 'strips', name: '玻璃贴条清单', z: 'over',
    required: ['items', 'y'], optional: ['h', 'gap', 'head', 'cols', 'fs', 'style'],
    notes: '人物全屏;style 控制样式;规范要求条要更高更圆有层次,不要等宽等距像表格。',
    example: { type: 'strips', t0: 9.0, t1: 15.4, y: 128, h: 58, gap: 10, head: '我的 AI 系统', cols: [{ x: 48, w: 520 }, { x: 1340, w: 520 }], items: [{ k: 'Obsidian', v: '资料库', en: 'VAULT', at: 9.75, col: 0, row: 0 }, { k: 'Codex', v: '干活的 Agent', en: 'AGENT', at: 11.4, col: 0, row: 1 }] },
  },
  counter: {
    componentId: 'counter', name: '计数器大字', z: 'behind',
    required: ['from', 'to', 'x', 'y'], optional: ['at', 'c0', 'c1', 'color', 'label', 'out', 'size', 'suffix'],
    notes: 'mid 层(人物背后);谨慎使用。工作台无抠像,按普通叠层渲染。',
    example: { type: 'counter', t0: 13.2, t1: 15.45, x: 1130, y: 60, size: 280, from: 86, to: 1313, c0: 13.3, c1: 14.9, color: '#F1D551', label: { text: '个笔记 · 还在涨', en: '47 SKILLS · 140 RULES', x: 1142, y: 330, size: 54 } },
  },
  tiles: {
    componentId: 'tiles', name: '玻璃数据块', z: 'over',
    required: ['tiles'], optional: [],
    notes: '较老组件,无范例。tiles 每项:x,y,w,h,label,from,to,c0,c1,at?,fill?',
    example: null,
  },
}

/* ---------- public API ---------- */

/**
 * Render one aikou library component as a static HTML snapshot at `timeSec`
 * seconds into the component (0 = component start; params may carry
 * engine-style t0/t1 for enter/exit animation windows).
 * @param libraryRef - LibraryRef with lib 'aikou', a whitelisted componentId and params.
 * @param timeSec - Component-local time in seconds.
 * @returns HTML string scoped under `.aikou` (styles come from AIKOU_CSS).
 */
export function renderAikouComponent(libraryRef, timeSec) {
  const ref = libraryRef ?? {}
  if (ref.lib !== 'aikou') throw new Error(`不是 AI口播包装库引用: ${String(ref.lib)}`)
  const spec = AIKOU_COMPONENTS[ref.componentId]
  if (!spec) throw new Error(`AI口播包装库组件不受支持: ${String(ref.componentId)}`)
  const params = { ...(ref.params ?? {}) }
  for (const field of spec.required) {
    if (params[field] === undefined || params[field] === null || params[field] === '') {
      throw new Error(`AI口播组件 ${spec.componentId} 缺少必填参数: ${field}`)
    }
  }
  const t = Number(timeSec)
  if (!Number.isFinite(t) || t < 0) throw new Error(`AI口播组件 ${spec.componentId} 的时间无效: ${String(timeSec)}`)
  return `<div class="aikou" data-aikou-component="${spec.componentId}">${AIKOU_RENDERERS[spec.componentId](params, t)}</div>`
}

/**
 * Rasterize one aikou component to a full-canvas PNG blob for the Host
 * FFmpeg overlay chain (the Host loops a still PNG per component, same as
 * the demo text overlays). Uses SVG foreignObject; backdrop blur degrades
 * to flat translucent fills in the raster, which matches the design colors.
 * @param libraryRef - LibraryRef with lib 'aikou'.
 * @param width - Canvas width in px (project width).
 * @param height - Canvas height in px (project height).
 * @param timeSec - Component-local time for the still frame.
 * @returns PNG blob.
 */
/* ---------- canvas 2D renderer (Host PNG export; taint-free) ----------
 * SVG foreignObject rasterization taints the canvas in Chromium, so the PNG
 * export draws every component with the Canvas 2D API directly. Layout math
 * mirrors the CSS in AIKOU_CSS; enter/exit timing reuses progress/out3/io2.
 */

function rr(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rad, y)
  ctx.arcTo(x + w, y, x + w, y + h, rad)
  ctx.arcTo(x + w, y + h, x, y + h, rad)
  ctx.arcTo(x, y + h, x, y, rad)
  ctx.arcTo(x, y, x + w, y, rad)
  ctx.closePath()
}

const CJK = '"Noto Sans CJK SC",system-ui,sans-serif'
const LAT = '"Inter Display",system-ui,sans-serif'

/** Draw one of the tag icons (24x24 viewBox) centered at (cx,cy) with size. */
function drawIcon(ctx, name, cx, cy, size) {
  const s = size / 24
  ctx.save()
  ctx.translate(cx - 12 * s, cy - 12 * s)
  ctx.scale(s, s)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  const stroke = (d, color, lw) => { ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.stroke(new Path2D(d)) }
  const fill = (d, color) => { ctx.fillStyle = color; ctx.fill(new Path2D(d)) }
  if (name === 'warn') {
    stroke('M12 3l10 18H2z', '#FF6B6B', 2)
    stroke('M12 10v5M12 17.5v.5', '#FF6B6B', 2.2)
  } else if (name === 'bolt') {
    fill('M13 2L5 13.5h6L10 22l9-12h-6z', '#FFC857')
  } else if (name === 'gem') {
    fill('M12 2l7 5-1.6 9L12 22l-5.4-6L5 7z', '#8B6CFF')
    fill('M12 2l7 5-7 3-7-3z', '#B7A2FF')
    fill('M12 10l6.4 6L12 22l-5.4-6z', '#6A4CE0')
  } else if (name === 'user') {
    stroke('M12 4a4 4 0 1 0 0.01 0M12 4a4 4 0 1 1 -0.01 0', '#5AA2FF', 2)
    stroke('M4 21c1-4.5 4.2-6.5 8-6.5s7 2 8 6.5', '#5AA2FF', 2)
  } else if (name === 'task') {
    stroke('M8 4h8a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4z', '#3DDC97', 2)
    stroke('M8 12.5l3 3 5-6', '#3DDC97', 2)
  } else { // check (default)
    stroke('M6 12.5l4 4 8-9', '#ffffff', 2.4)
  }
  ctx.restore()
}

function drawTag(ctx, p, t) {
  const { t0, t1 } = timing(p)
  const q = out3(progress(t, t0, t0 + 0.45))
  const e = out3(progress(t, t1 - 0.3, t1))
  const alpha = q * (1 - e)
  if (alpha <= 0.01) return
  const label = String(p.label ?? '')
  const en = String(p.en ?? '')
  ctx.save()
  ctx.globalAlpha = alpha
  if (q < 1) ctx.filter = `blur(${((1 - q) * 5).toFixed(1)}px)`
  const dx = Math.round((1 - q) * -34 + e * 20)
  const dy = Math.sin(t * 1.6) * 3
  const x = p.x + dx
  const y = p.y + dy
  ctx.font = `700 34px ${CJK}`
  const labelW = ctx.measureText(label).width
  ctx.font = `600 15px ${LAT}`
  const enW = en ? ctx.measureText(en).width : 0
  const textW = Math.max(labelW, enW)
  const pillW = 20 + 56 + 16 + textW + 28
  const pillH = 88
  rr(ctx, x, y, pillW, pillH, 26)
  ctx.fillStyle = 'rgba(14,16,26,.66)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,.2)'
  ctx.lineWidth = 1.5
  ctx.stroke()
  // icon box
  const ix = x + 20
  const iy = y + 16
  rr(ctx, ix, iy, 56, 56, 16)
  ctx.fillStyle = 'rgba(255,255,255,.1)'
  ctx.fill()
  drawIcon(ctx, p.icon || 'gem', ix + 28, iy + 28, 34)
  // texts
  const tx = ix + 56 + 16
  ctx.fillStyle = '#fff'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `700 34px ${CJK}`
  ctx.fillText(label, tx, y + 16 + 38)
  if (en) {
    ctx.fillStyle = 'rgba(255,255,255,.55)'
    ctx.font = `600 15px ${LAT}`
    ctx.fillText(en, tx, y + 16 + 38 + 24)
  }
  ctx.restore()
}

function drawQa(ctx, p, t) {
  const { t0, t1 } = timing(p)
  const q = out3(progress(t, t0, t0 + 0.5))
  const e = out3(progress(t, t1 - 0.3, t1))
  const alpha = q * (1 - e)
  if (alpha <= 0.01) return
  const dir = p.dir ?? -1
  const qs = String(p.q ?? '')
  const as = String(p.a ?? '')
  ctx.save()
  ctx.globalAlpha = alpha
  if (q < 1) ctx.filter = `blur(${((1 - q) * 6).toFixed(1)}px)`
  const dx = Math.round((1 - q) * dir * 60)
  const dy = Math.sin(t * 1.4 + p.x) * 3
  ctx.font = `700 30px ${CJK}`
  const qw = ctx.measureText(qs).width
  ctx.font = `700 26px ${CJK}`
  const aw = ctx.measureText(as).width
  const w = Math.max(qw, aw) + 60
  const h = 110
  const x = p.x + dx
  const y = p.y + dy
  rr(ctx, x, y, w, h, 28)
  ctx.fillStyle = 'rgba(14,16,26,.7)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,.2)'
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.fillStyle = '#fff'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `700 30px ${CJK}`
  ctx.fillText(qs, x + 30, y + 44)
  ctx.font = `700 26px ${CJK}`
  ctx.fillStyle = '#8B6CFF'
  ctx.fillText(as, x + 30, y + 84)
  ctx.restore()
}

function drawStat(ctx, p, t) {
  const { t1 } = timing(p)
  const items = Array.isArray(p.items) ? p.items : []
  for (const k of items) {
    const q = out3(progress(t, k.at, k.at + 0.45))
    const e = out3(progress(t, t1 - 0.3, t1))
    const alpha = q * (1 - e)
    if (alpha <= 0.01) continue
    const value = fmtInt(lerp(+k.from, +k.to, io2(progress(t, +k.a, +k.b))))
    ctx.save()
    ctx.globalAlpha = alpha
    if (q < 1) ctx.filter = `blur(${((1 - q) * 6).toFixed(1)}px)`
    const dy = Math.round((1 - q) * 30)
    const x = k.x
    const y = k.y + dy
    ctx.textBaseline = 'alphabetic'
    ctx.font = `700 28px ${CJK}`
    ctx.fillStyle = '#ECECEC'
    ctx.shadowColor = 'rgba(0,0,0,.55)'
    ctx.shadowBlur = 12
    ctx.fillText(String(k.label ?? ''), x, y)
    ctx.font = `900 64px ${LAT}`
    ctx.fillStyle = '#fff'
    const num = `${value}${k.unit || ''}`
    ctx.fillText(num, x, y + 70)
    ctx.font = `700 28px ${CJK}`
    ctx.fillStyle = '#3DDC97'
    ctx.fillText('↑', x + ctx.measureText(num).width + 8, y + 70)
    ctx.restore()
  }
}

function drawMonths(ctx, p, t) {
  const { t0, t1 } = timing(p)
  const q = out3(progress(t, t0, t0 + 0.4))
  const e = out3(progress(t, t1 - 0.3, t1))
  const alpha = q * (1 - e)
  if (alpha <= 0.01) return
  const n = Math.max(1, Math.round(p.n || 1))
  const lit = Math.round(n * io2(progress(t, p.a, p.b)))
  const w = p.w || 380
  const label = String(p.label ?? '')
  const big = `${p.pre || ''}${lit}`
  ctx.save()
  ctx.globalAlpha = alpha
  if (q < 1) ctx.filter = `blur(${((1 - q) * 5).toFixed(1)}px)`
  const dy = Math.round((1 - q) * 24)
  const x = p.x
  const y = p.y + dy
  const h = 170
  rr(ctx, x, y, w, h, 26)
  ctx.fillStyle = 'rgba(14,16,26,.66)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,.2)'
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = 'rgba(255,255,255,.75)'
  ctx.font = `600 22px ${CJK}`
  ctx.fillText(label, x + 26, y + 40)
  // dots
  const dotR = 14
  const gap = (w - 52 - dotR * 2) / Math.max(1, n - 1)
  for (let i = 0; i < n; i++) {
    const cx = x + 26 + dotR + i * gap
    const cy = y + 78
    ctx.beginPath()
    ctx.arc(cx, cy, dotR, 0, Math.PI * 2)
    if (i < lit) { ctx.fillStyle = '#8B6CFF'; ctx.fill() }
    else { ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 2; ctx.stroke() }
  }
  ctx.fillStyle = '#fff'
  ctx.font = `900 54px ${LAT}`
  ctx.fillText(big, x + 26, y + 148)
  ctx.font = `600 24px ${CJK}`
  ctx.fillStyle = 'rgba(255,255,255,.6)'
  ctx.fillText(String(p.unit || ''), x + 26 + ctx.measureText(big).width + 10, y + 148)
  ctx.restore()
}

function drawNumlist(ctx, p, t) {
  const { t0 } = timing(p)
  const items = Array.isArray(p.items) ? p.items : []
  const w = p.w || 540
  const label = String(p.label ?? '')
  ctx.save()
  ctx.textBaseline = 'alphabetic'
  let y = p.y
  ctx.fillStyle = '#fff'
  ctx.font = `700 30px ${CJK}`
  ctx.shadowColor = 'rgba(0,0,0,.4)'
  ctx.shadowBlur = 8
  ctx.fillText(label, p.x, y)
  y += 18
  items.forEach((it, i) => {
    const at = t0 + 0.25 + i * 0.2
    const pr = out3(progress(t, at, at + 0.45))
    if (pr <= 0.01) return
    ctx.save()
    ctx.globalAlpha = pr
    const rowY = y + 34
    ctx.fillStyle = '#8B6CFF'
    ctx.font = `900 26px ${LAT}`
    ctx.fillText(String(it.no || ''), p.x, rowY)
    ctx.fillStyle = '#fff'
    ctx.font = `600 26px ${CJK}`
    const lines = Array.isArray(it.lines) ? it.lines : []
    ctx.fillText(lines.map(l => String(l.text || '').replace(/\*\*/g, '')).join(' '), p.x + 64, rowY)
    ctx.restore()
    y += 44
  })
  ctx.restore()
}

function drawStrips(ctx, p, t) {
  const items = Array.isArray(p.items) ? p.items : []
  const y0 = p.y || 0
  const h = p.h || 58
  const gap = p.gap || 10
  const head = String(p.head ?? '')
  ctx.save()
  ctx.textBaseline = 'middle'
  if (head) {
    ctx.fillStyle = '#fff'
    ctx.font = `700 30px ${CJK}`
    ctx.shadowColor = 'rgba(0,0,0,.4)'
    ctx.shadowBlur = 8
    ctx.fillText(head, 48, y0 - 24)
  }
  items.forEach((it) => {
    const pr = out3(progress(t, it.at ?? 0, (it.at ?? 0) + 0.4))
    if (pr <= 0.01) return
    ctx.save()
    ctx.globalAlpha = pr
    const cols = Array.isArray(p.cols) ? p.cols : [{ x: 48, w: 520 }]
    const col = cols[it.col || 0] || cols[0]
    const yy = y0 + (it.row || 0) * (h + gap)
    rr(ctx, col.x, yy, col.w, h, h / 2)
    ctx.fillStyle = 'rgba(14,16,26,.6)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,.18)'
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.fillStyle = '#8B6CFF'
    ctx.font = `900 24px ${LAT}`
    ctx.fillText(String(it.k || ''), col.x + 24, yy + h / 2)
    ctx.fillStyle = '#fff'
    ctx.font = `600 26px ${CJK}`
    ctx.fillText(String(it.v || ''), col.x + 150, yy + h / 2)
    ctx.restore()
  })
  ctx.restore()
}

function drawCounter(ctx, p, t) {
  const value = fmtInt(lerp(+p.from, +p.to, io2(progress(t, +p.c0, +p.c1))))
  const size = p.size || 280
  const suffix = String(p.suffix ?? '')
  ctx.save()
  ctx.textBaseline = 'alphabetic'
  ctx.font = `900 ${size}px ${LAT}`
  ctx.fillStyle = p.color || '#F1D551'
  ctx.shadowColor = 'rgba(0,0,0,.5)'
  ctx.shadowBlur = 20
  const txt = `${value}${suffix}`
  ctx.fillText(txt, p.x, p.y + size * 0.8)
  if (p.label) {
    const l = p.label
    ctx.shadowBlur = 8
    ctx.font = `600 ${l.size || 54}px ${CJK}`
    ctx.fillStyle = '#fff'
    ctx.fillText(String(l.text || ''), l.x ?? p.x, (l.y ?? p.y) + (l.size || 54) * 0.8)
  }
  ctx.restore()
}

function drawTiles(ctx, p, t) {
  const tiles = Array.isArray(p.tiles) ? p.tiles : []
  for (const k of tiles) {
    const pr = out3(progress(t, k.at ?? 0, (k.at ?? 0) + 0.4))
    if (pr <= 0.01) continue
    ctx.save()
    ctx.globalAlpha = pr
    const w = k.w || 300
    const h = k.h || 170
    rr(ctx, k.x, k.y, w, h, 24)
    ctx.fillStyle = k.fill || 'rgba(14,16,26,.66)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,.2)'
    ctx.lineWidth = 1.5
    ctx.stroke()
    const value = k.from !== undefined ? fmtInt(lerp(+k.from, +k.to, io2(progress(t, +k.c0, +k.c1)))) : ''
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = '#fff'
    ctx.font = `900 56px ${LAT}`
    ctx.fillText(String(value), k.x + 28, k.y + 84)
    ctx.fillStyle = 'rgba(255,255,255,.65)'
    ctx.font = `600 24px ${CJK}`
    ctx.fillText(String(k.label || ''), k.x + 28, k.y + 128)
    ctx.restore()
  }
}

/**
 * Draw one aikou component onto a 2D canvas context (full-canvas coordinates).
 * Used for the Host PNG export; mirrors renderAikouComponent without DOM.
 */
export function drawAikouComponent(ctx, libraryRef, timeSec) {
  if (!libraryRef || libraryRef.lib !== 'aikou') throw new Error(`drawAikouComponent 仅支持 aikou 组件`)
  const p = libraryRef.params ?? {}
  const t = timeSec
  switch (libraryRef.componentId) {
    case 'tag': drawTag(ctx, p, t); break
    case 'qa': drawQa(ctx, p, t); break
    case 'stat': drawStat(ctx, p, t); break
    case 'months': drawMonths(ctx, p, t); break
    case 'numlist': drawNumlist(ctx, p, t); break
    case 'strips': drawStrips(ctx, p, t); break
    case 'counter': drawCounter(ctx, p, t); break
    case 'tiles': drawTiles(ctx, p, t); break
    default: throw new Error(`不支持的AI口播组件：${libraryRef.componentId}`)
  }
}

export async function renderAikouOverlayPng(libraryRef, width, height, timeSec) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('包装图层画布不可用')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  drawAikouComponent(ctx, libraryRef, timeSec)
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('包装 PNG 生成失败')
  return blob
}


/* ---------- styles (ported from the engine, scoped under .aikou) ---------- */

export const AIKOU_CSS = `
.aikou{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;overflow:hidden}
.aikou .ch{display:inline-block;white-space:pre}
.aikou .ch.k{color:#5AA2FF}
.aikou .bw{position:absolute;white-space:nowrap;line-height:.9;transform-origin:30% 60%}
.aikou .bw.lat{font-family:"IDisp","Inter Display",system-ui,sans-serif;font-weight:900;letter-spacing:-.035em}
.aikou .bl{position:absolute;white-space:nowrap;font-family:"Noto Sans CJK SC",system-ui,sans-serif;font-weight:700;color:#ECECEC;letter-spacing:.04em;text-shadow:0 2px 14px rgba(0,0,0,.35)}
.aikou .bl small{display:block;font-family:"IDisp","Inter Display",system-ui,sans-serif;font-weight:600;font-size:.34em;letter-spacing:.24em;opacity:.6;margin-top:.35em}
.aikou .nl .row{display:flex;align-items:flex-start;gap:22px;padding:20px 0;border-bottom:1.5px solid rgba(255,255,255,.14)}
.aikou .nl .row:first-of-type{border-top:1.5px solid rgba(255,255,255,.14)}
.aikou .nl .label{font-family:"Noto Sans CJK SC",system-ui,sans-serif;font-weight:700;font-size:36px;color:#fff}
.aikou .nl .no{font-family:"IDisp","Inter Display",system-ui,sans-serif;font-weight:700;font-size:50px;line-height:1;width:66px;flex:none;color:#fff}
.aikou .nl .tx{font-family:"Noto Sans CJK SC",system-ui,sans-serif;font-weight:700;font-size:40px;line-height:1.3;white-space:nowrap;text-shadow:0 2px 14px rgba(0,0,0,.3);color:#fff}
.aikou .nl .q{color:rgba(255,255,255,.45);font-family:"IDisp","Inter Display",system-ui,sans-serif;font-weight:600}
.aikou .strip{position:absolute;display:flex;align-items:center;gap:14px;padding:0 18px 0 14px;border-radius:14px;background:rgba(14,12,14,.72);box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.12);color:#fff;white-space:nowrap;font-family:"Noto Sans CJK SC",system-ui,sans-serif;box-sizing:border-box}
.aikou .strip .no{width:36px;height:36px;border-radius:50%;box-shadow:inset 0 0 0 2px rgba(255,255,255,.75);display:flex;align-items:center;justify-content:center;font-family:"IDisp","Inter Display",system-ui,sans-serif;font-weight:700;font-size:16px;font-style:normal;flex:none}
.aikou .strip b{font-weight:700;font-size:var(--sf,28px)}
.aikou .strip em{font-style:normal;color:rgba(255,255,255,.55);font-size:24px}
.aikou .strip .v{font-weight:700;font-size:var(--sf,28px)}
.aikou .strip small{margin-left:auto;font-family:"IDisp","Inter Display",system-ui,sans-serif;font-weight:600;font-size:14px;letter-spacing:.16em;color:rgba(255,255,255,.42)}
.aikou .strip .ok{width:30px;height:30px;border-radius:50%;box-shadow:inset 0 0 0 2px rgba(255,255,255,.7);display:flex;align-items:center;justify-content:center;flex:none;font-style:normal}
.aikou .strip.cur{background:rgba(14,12,14,.82);box-shadow:inset 0 0 0 2px rgba(255,255,255,.85)}
.aikou .strip.w{background:rgba(255,255,255,.84);color:#141114;box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.9)}
.aikou .strip.w .no{box-shadow:inset 0 0 0 2px rgba(20,17,20,.7)}
.aikou .strip.w em{color:rgba(20,17,20,.45)}
.aikou .strip.w small{color:rgba(20,17,20,.4)}
.aikou .strip.w .ok{box-shadow:inset 0 0 0 2px rgba(20,17,20,.6)}
.aikou .strip.w .ok svg path{stroke:#141114}
.aikou .sthead{position:absolute;display:flex;align-items:center;gap:12px;height:46px;padding:0 18px;border-radius:12px;background:rgba(14,12,14,.6);box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.35);color:#fff;font-family:"Noto Sans CJK SC",system-ui,sans-serif;font-weight:700;font-size:24px;white-space:nowrap;box-sizing:border-box}
.aikou .gtile{position:absolute;border-radius:18px;background:rgba(14,12,14,.72);box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.12);color:#fff;padding:14px 20px 0;overflow:hidden;font-family:"Noto Sans CJK SC",system-ui,sans-serif;box-sizing:border-box}
.aikou .gtile small{display:block;font-size:22px;font-weight:700;color:rgba(255,255,255,.7)}
.aikou .gtile b{display:block;font-family:"IDisp","Inter Display",system-ui,sans-serif;font-weight:800;font-size:74px;line-height:1.05;letter-spacing:-.02em;margin-top:2px}
.aikou .gtile .bar{position:absolute;left:20px;right:20px;bottom:16px;height:5px;border-radius:3px;background:rgba(255,255,255,.14);overflow:hidden;display:block}
.aikou .gtile .bar u{display:block;height:100%;background:#fff;border-radius:3px;width:0}
.aikou .tg{position:absolute;display:flex;align-items:center;gap:16px;padding:16px 28px 16px 20px;border-radius:26px;background:rgba(14,16,26,.66);box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.2);color:#fff;font-family:"Noto Sans CJK SC",system-ui,sans-serif;white-space:nowrap;box-sizing:border-box}
.aikou .tg .ic{width:56px;height:56px;border-radius:16px;background:rgba(255,255,255,.1);display:flex;align-items:center;justify-content:center;flex:none}
.aikou .tg b{display:block;font-size:34px;font-weight:700;line-height:1.15}
.aikou .tg small{display:block;font-family:"IDisp","Inter Display",system-ui,sans-serif;font-weight:600;font-size:15px;letter-spacing:.2em;color:rgba(255,255,255,.55);margin-top:4px}
.aikou .mo{position:absolute;border-radius:26px;background:rgba(14,16,26,.66);box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.2);color:#fff;padding:20px 26px;font-family:"Noto Sans CJK SC",system-ui,sans-serif;box-sizing:border-box}
.aikou .mo small{display:block;font-size:22px;font-weight:700;color:rgba(255,255,255,.75)}
.aikou .mo .dots{display:flex;gap:12px;margin:16px 0 10px}
.aikou .mo .dots i{width:34px;height:34px;border-radius:50%;box-shadow:inset 0 0 0 2.5px rgba(255,255,255,.35);display:flex;align-items:center;justify-content:center;font-style:normal}
.aikou .mo .dots i.on{background:#5AA2FF;box-shadow:none}
.aikou .mo .big{font-family:"IDisp","Inter Display",system-ui,sans-serif;font-weight:800;font-size:76px;line-height:1;letter-spacing:-.02em}
.aikou .mo .big span{font-family:"Noto Sans CJK SC",system-ui,sans-serif;font-size:30px;font-weight:700;margin-left:10px;color:rgba(255,255,255,.8)}
.aikou .qa{position:absolute;border-radius:28px;background:rgba(14,16,26,.7);box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.2);color:#fff;font-family:"Noto Sans CJK SC",system-ui,sans-serif;padding:22px 30px;white-space:nowrap;box-sizing:border-box}
.aikou .qa .q{font-size:24px;font-weight:700;color:rgba(255,255,255,.62);letter-spacing:.06em;display:flex;align-items:center;gap:10px}
.aikou .qa .q i{width:12px;height:12px;border-radius:50%;background:#5AA2FF;display:block}
.aikou .qa .a{font-size:44px;font-weight:900;margin-top:6px;letter-spacing:.01em}
.aikou .st1{position:absolute;color:#fff;font-family:"Noto Sans CJK SC",system-ui,sans-serif;text-shadow:0 6px 30px rgba(0,0,0,.55),0 2px 6px rgba(0,0,0,.4)}
.aikou .st1 .lb{display:inline-flex;align-items:center;gap:10px;height:48px;padding:0 20px;border-radius:24px;background:rgba(14,16,26,.55);box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.25);font-size:26px;font-weight:700;text-shadow:none}
.aikou .st1 .nm{display:flex;align-items:baseline;gap:10px;margin-top:6px}
.aikou .st1 .nm b{font-family:"IDisp","Inter Display",system-ui,sans-serif;font-weight:900;font-size:128px;line-height:1;letter-spacing:-.03em}
.aikou .st1 .nm span{font-size:34px;font-weight:700}
.aikou .st1 .nm u{text-decoration:none;font-family:"IDisp","Inter Display",system-ui,sans-serif;font-weight:800;font-size:56px;color:#7CF0B8}
.overlay-item.aikou-layer{pointer-events:none;display:block;overflow:visible;background:transparent;padding:0}
.overlay-item.aikou-layer .aikou-canvas{position:absolute;left:0;top:0;transform-origin:0 0}
.aikou-fallback{position:absolute;left:40px;top:300px;padding:12px 18px;border-radius:12px;background:rgba(20,10,10,.8);color:#ffb3b3;font-size:20px;font-family:system-ui,sans-serif}
`
