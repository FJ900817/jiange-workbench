/**
 * talkcraft libraryRef lint（P1）。
 * 校验：白名单（29 张真 props 卡）→ lib 必须为 talkcraft → params 未知字段拦截 →
 * 主内容必填拦截（防 demo 文案原样渲染）→ 样式锁死（accent/色板类 AI 不许填）→
 * 枚举/类型轻校验。首个违规抛中文错；全过返回原 plan。不调模型。
 * Self-contained ESM：无 import（与 aikou-lint.js 同约定）。
 */

/** 29 张真 props 卡的 componentId 白名单。 */
export const TALKCRAFT_COMPONENT_IDS = Object.freeze([
  'bed-echo-blur',
  'chip-grid-single-select',
  'countdown-arc-scatter',
  'crash-zoom-punch',
  'doc-park-left-pill-deal',
  'error-retype',
  'filmstrip-conveyor',
  'flying-words',
  'gallery-wall-dolly',
  'grid-to-hero',
  'host-card-glass-board',
  'info-card-assemble',
  'lead-word-zoom-assemble',
  'line-carry-transition',
  'parallel-items-with-host',
  'rack-focus-pair',
  'reticle-lock-on',
  'scanline-annotate',
  'source-converge',
  'split-60-40-story',
  'split-compare-slider',
  'split-text-stagger',
  'stack-fan-out',
  'still-layout-relay',
  'timeline-photo-strip',
  'title-demote-to-label',
  'unit-grid-proportion',
  'word-relay-filmstrip',
  'word-slot-cycle',
])

const ALLOWLIST = new Set(TALKCRAFT_COMPONENT_IDS)

/** AI 可填的参数名（= tsx Props 声明）。 */
const KNOWN_PARAMS = {
  'bed-echo-blur': ['src', 'title', 'note'],
  'chip-grid-single-select': ['question', 'options', 'selected', 'equation'],
  'countdown-arc-scatter': ['numbers', 'pick', 'words', 'accent'],
  'crash-zoom-punch': ['src', 'target', 'label', 'sub'],
  'doc-park-left-pill-deal': ['docTitle', 'pills', 'notes', 'hint', 'docSrc', 'accent'],
  'error-retype': ['prefix', 'first', 'second', 'accent'],
  'filmstrip-conveyor': ['srcs', 'labels', 'title', 'note'],
  'flying-words': ['words'],
  'gallery-wall-dolly': ['srcs', 'labels'],
  'grid-to-hero': ['labels', 'srcs', 'heroIdx'],
  'host-card-glass-board': ['hostSrc', 'tag', 'title', 'en', 'steps', 'result'],
  'info-card-assemble': ['src', 'caption', 'title', 'pills', 'price', 'lines', 'highlightLines', 'swatches'],
  'lead-word-zoom-assemble': ['words', 'subline', 'accentIndex', 'accent'],
  'line-carry-transition': ['titleA', 'titleB', 'srcB', 'subA', 'subB'],
  'parallel-items-with-host': ['layout', 'items', 'srcs', 'hostSrc'],
  'rack-focus-pair': ['labels', 'srcs'],
  'reticle-lock-on': ['src', 'target', 'label', 'buttonText'],
  'scanline-annotate': ['src', 'targets', 'labels'],
  'source-converge': ['title', 'sources', 'hub', 'caption'],
  'split-60-40-story': ['src', 'hostSrc', 'title', 'chips', 'chipBg'],
  'split-compare-slider': ['srcBefore', 'srcAfter', 'labelBefore', 'labelAfter'],
  'split-text-stagger': ['text', 'sub'],
  'stack-fan-out': ['title', 'srcs'],
  'still-layout-relay': ['layout', 'captions', 'srcs', 'accent'],
  'timeline-photo-strip': ['srcs', 'labels'],
  'title-demote-to-label': ['title', 'items', 'itemBg', 'accent'],
  'unit-grid-proportion': ['target', 'unit', 'label', 'legend', 'accent'],
  'word-relay-filmstrip': ['noun', 'verbs', 'labels', 'srcs', 'accent'],
  'word-slot-cycle': ['stem', 'words', 'final', 'accent'],
}

/** 主内容必填：不填=渲染 demo 原样文案，视为非法引用。 */
const REQUIRED_PARAMS = {
  'bed-echo-blur': ['title'],
  'chip-grid-single-select': ['question', 'options'],
  'countdown-arc-scatter': ['words'],
  'crash-zoom-punch': ['label'],
  'doc-park-left-pill-deal': ['docTitle', 'pills'],
  'error-retype': ['first', 'second'],
  'filmstrip-conveyor': ['title', 'labels'],
  'flying-words': ['words'],
  'gallery-wall-dolly': ['labels'],
  'grid-to-hero': ['labels'],
  'host-card-glass-board': ['title', 'steps'],
  'info-card-assemble': ['title', 'lines'],
  'lead-word-zoom-assemble': ['words'],
  'line-carry-transition': ['titleA', 'titleB'],
  'parallel-items-with-host': ['items'],
  'rack-focus-pair': ['labels'],
  'reticle-lock-on': ['label'],
  'scanline-annotate': ['labels'],
  'source-converge': ['title', 'sources'],
  'split-60-40-story': ['title', 'chips'],
  'split-compare-slider': ['labelBefore', 'labelAfter'],
  'split-text-stagger': ['text'],
  'stack-fan-out': ['title'],
  'still-layout-relay': ['captions'],
  'timeline-photo-strip': ['labels'],
  'title-demote-to-label': ['title', 'items'],
  'unit-grid-proportion': ['target', 'label'],
  'word-relay-filmstrip': ['noun', 'verbs'],
  'word-slot-cycle': ['stem', 'words', 'final'],
}

/** 样式锁死：颜色类参数 AI 一律不许填（DESIGN §1 全局规则），删掉走库默认。 */
const STYLE_LOCKED = new Set(['accent', 'swatches', 'chipBg', 'itemBg'])

/** 参数类型（轻校验用）。 */
const PARAM_KINDS = {
  'bed-echo-blur': { src: 'string', title: 'array', note: 'array' },
  'chip-grid-single-select': { question: 'string', options: 'array', selected: 'number', equation: 'array' },
  'countdown-arc-scatter': { numbers: 'array', pick: 'number', words: 'array', accent: 'string' },
  'crash-zoom-punch': { src: 'string', target: 'object', label: 'string', sub: 'string' },
  'doc-park-left-pill-deal': { docTitle: 'string', pills: 'array', notes: 'array', hint: 'string', docSrc: 'string', accent: 'string' },
  'error-retype': { prefix: 'string', first: 'string', second: 'string', accent: 'string' },
  'filmstrip-conveyor': { srcs: 'array', labels: 'array', title: 'string', note: 'string' },
  'flying-words': { words: 'array' },
  'gallery-wall-dolly': { srcs: 'array', labels: 'array' },
  'grid-to-hero': { labels: 'array', srcs: 'array', heroIdx: 'number' },
  'host-card-glass-board': { hostSrc: 'string', tag: 'string', title: 'string', en: 'string', steps: 'array', result: 'string' },
  'info-card-assemble': { src: 'string', caption: 'string', title: 'string', pills: 'array', price: 'string', lines: 'array', highlightLines: 'array', swatches: 'array' },
  'lead-word-zoom-assemble': { words: 'array', subline: 'string', accentIndex: 'number', accent: 'string' },
  'line-carry-transition': { titleA: 'string', titleB: 'string', srcB: 'string', subA: 'string', subB: 'string' },
  'parallel-items-with-host': { layout: 'string', items: 'array', srcs: 'array', hostSrc: 'string' },
  'rack-focus-pair': { labels: 'array', srcs: 'array' },
  'reticle-lock-on': { src: 'string', target: 'object', label: 'string', buttonText: 'string' },
  'scanline-annotate': { src: 'string', targets: 'array', labels: 'array' },
  'source-converge': { title: 'string', sources: 'array', hub: 'string', caption: 'string' },
  'split-60-40-story': { src: 'string', hostSrc: 'string', title: 'array', chips: 'array', chipBg: 'array' },
  'split-compare-slider': { srcBefore: 'string', srcAfter: 'string', labelBefore: 'string', labelAfter: 'string' },
  'split-text-stagger': { text: 'string', sub: 'string' },
  'stack-fan-out': { title: 'string', srcs: 'array' },
  'still-layout-relay': { layout: 'string', captions: 'array', srcs: 'array', accent: 'string' },
  'timeline-photo-strip': { srcs: 'array', labels: 'array' },
  'title-demote-to-label': { title: 'string', items: 'array', itemBg: 'array', accent: 'string' },
  'unit-grid-proportion': { target: 'number', unit: 'string', label: 'array', legend: 'array', accent: 'string' },
  'word-relay-filmstrip': { noun: 'string', verbs: 'array', labels: 'array', srcs: 'array', accent: 'string' },
  'word-slot-cycle': { stem: 'string', words: 'array', final: 'string', accent: 'string' },
}

/** 枚举参数的可选值。 */
const ENUM_PARAMS = {
  'parallel-items-with-host': { layout: ['head-row', 'band-triptych', 'side-column', 'stack-shuffle', 'vertical-strips', 'diagonal-bands', 'bg-swap', 'tour'] },
  'still-layout-relay': { layout: ['hero-duo', 'triptych', 'tour'] },
}

function fail(proposalId, message) {
  throw new Error(`施工单 ${proposalId} 的 talkcraft 引用非法：${message}`)
}

function checkKind(proposalId, componentId, name, kind, value) {
  if (value === undefined || value === null) return
  if (kind === 'string' && (typeof value !== 'string' || !value.trim()))
    fail(proposalId, `${componentId}.${name} 必须是非空文字`)
  if (kind === 'number' && !Number.isFinite(value))
    fail(proposalId, `${componentId}.${name} 必须是数字`)
  if (kind === 'array' && (!Array.isArray(value) || !value.length))
    fail(proposalId, `${componentId}.${name} 必须是非空数组`)
  if (kind === 'object' && (typeof value !== 'object' || Array.isArray(value)))
    fail(proposalId, `${componentId}.${name} 必须是对象（如 {x,y,w,h}）`)
}

/** 校验一条 libraryRef。 */
function validateLibraryRef(proposalId, ref) {
  if (!ref || typeof ref !== 'object' || Array.isArray(ref)) fail(proposalId, '组件引用不是对象')
  if (ref.lib !== 'talkcraft') fail(proposalId, `引用的组件库是 "${ref.lib}"，本校验器只开放 talkcraft`)
  const componentId = ref.componentId
  if (!ALLOWLIST.has(componentId)) {
    fail(proposalId, `卡 ID "${componentId}" 不在 29 张真 props 卡白名单内；79 张硬编码卡（文字写死）不可点名，改文案需源码复刻，不走施工单`)
  }
  const params = ref.params
  if (!params || typeof params !== 'object' || Array.isArray(params)) fail(proposalId, '缺少参数包 params（Remotion props 整包透传）')
  const known = KNOWN_PARAMS[componentId]
  for (const key of Object.keys(params)) {
    if (STYLE_LOCKED.has(key)) {
      fail(proposalId, `${componentId}.${key} 是样式锁定参数：颜色/色板不许 AI 填写，删掉走库默认（DESIGN 样式锁死规则）`)
    }
    if (!known.includes(key)) {
      fail(proposalId, `${componentId} 不允许的参数 "${key}"：只能填 Props 声明里的参数，不许自创字段`)
    }
  }
  for (const key of REQUIRED_PARAMS[componentId]) {
    if (params[key] === undefined || params[key] === null || params[key] === '') {
      fail(proposalId, `${componentId} 缺少必填的主内容参数 "${key}"：不填会原样渲染库 demo 文案`)
    }
  }
  const kinds = PARAM_KINDS[componentId]
  for (const key of Object.keys(params)) checkKind(proposalId, componentId, key, kinds[key], params[key])
  const enums = ENUM_PARAMS[componentId]
  if (enums) {
    for (const key of Object.keys(enums)) {
      const v = params[key]
      if (v !== undefined && v !== null && !enums[key].includes(v)) {
        fail(proposalId, `${componentId}.${key} 只能是 ${enums[key].join('/')}，当前为 ${JSON.stringify(v)}`)
      }
    }
  }
  // 素材类参数（src/srcs/hostSrc/docSrc）：允许透传，但 AI 不许编造 URL。
  // 占位兜底足够渲染；真素材由用户提供后再填。
}

/**
 * 校验方案里每条 libraryRef（无 libraryRef 的提案跳过）。
 * @param plan - 包装方案（需有 proposals 数组）
 * @returns 同一个 plan（全合法时）
 */
export function validateTalkcraftLibraryRefs(plan) {
  if (!plan || !Array.isArray(plan.proposals)) throw new Error('包装方案缺少提案列表，无法校验 talkcraft 引用')
  for (const proposal of plan.proposals) {
    if (proposal.libraryRef !== undefined) validateLibraryRef(proposal.proposalId, proposal.libraryRef)
  }
  return plan
}
