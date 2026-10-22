/**
 * shotcraft library-reference lint for packaging plans.
 * Whitelist membership + params validation against each card's propsSchema.
 * Throws Chinese errors on the first violation; returns the plan unchanged
 * when every libraryRef is legal. Never calls a model.
 * Generated from shotcraft-index.json — regenerate, do not hand-edit.
 */

/** Components the AI may name in libraryRef.componentId (P2). */
export const SHOTCRAFT_COMPONENT_IDS = Object.freeze(["typography/marker-underline-title", "typography/blur-slide", "typography/outline-word-fill", "typography/gradient-word-sweep", "typography/lead-word-zoom-assemble", "typography/brace-expand", "typography/countdown-arc-scatter", "typography/paper-title-card", "typography/pill-slot-cycle", "typography/pill-chip-slot-cycle-handled", "typography/glitch-cycle", "typography/text-column-converge", "typography/title-demote-to-label", "typography/type-assembly-moves", "typography/type-entrance-moves", "typography/type-rhythm-sync", "typography/typewriter-moves", "typography/vertical-word-roll-blur-cycle", "typography/word-relay-filmstrip", "typography/word-relay-geometry", "ui-entrance/list-reveal", "ui-entrance/avatar-bracket-carousel", "ui-entrance/product-card-progressive-assemble", "ui-entrance/research-card-stack-scroll", "ui-entrance/draw-svg-trace", "ui-entrance/wall-reveal-moves", "data/before-after-slider-scrub", "data/chart-live-moves", "data/gauge-readout-moves", "data/scroll-brake-moves", "data/timeline-travel"])
const SHOTCRAFT_ALLOWLIST = new Set(SHOTCRAFT_COMPONENT_IDS)

/** Params the render engine reads per component; anything else is a self-invented field. */
const KNOWN_PARAMS = {
  "typography/marker-underline-title": [
    "title",
    "sub",
    "fontSize",
    "duration"
  ],
  "typography/blur-slide": [
    "masthead",
    "issue",
    "kicker",
    "title1",
    "title2",
    "sub",
    "folioNo",
    "duration"
  ],
  "typography/outline-word-fill": [
    "word",
    "kicker",
    "sub",
    "beforeLabel",
    "beforeValue",
    "afterLabel",
    "afterValue",
    "fontSize",
    "duration"
  ],
  "typography/gradient-word-sweep": [
    "keyword",
    "lineRest",
    "sub",
    "duration"
  ],
  "typography/lead-word-zoom-assemble": [
    "text",
    "highlight",
    "sub",
    "duration"
  ],
  "typography/brace-expand": [
    "title",
    "kicker",
    "sub",
    "fontSize",
    "duration"
  ],
  "typography/countdown-arc-scatter": [
    "number",
    "words",
    "kicker",
    "cmd",
    "duration"
  ],
  "typography/paper-title-card": [
    "text",
    "sub",
    "subDigits",
    "fontSize",
    "duration"
  ],
  "typography/pill-slot-cycle": [
    "stem",
    "pills",
    "conclusion",
    "duration"
  ],
  "typography/pill-chip-slot-cycle-handled": [
    "prefix",
    "words",
    "suffix",
    "duration"
  ],
  "typography/glitch-cycle": [
    "phrases",
    "credit",
    "duration"
  ],
  "typography/text-column-converge": [
    "prefix",
    "words",
    "lastWord",
    "sub",
    "duration"
  ],
  "typography/title-demote-to-label": [
    "titleA",
    "titleB",
    "numA",
    "numB",
    "brand",
    "duration"
  ],
  "typography/type-assembly-moves": [
    "variant",
    "text",
    "word",
    "badgeValue",
    "badgeUnit",
    "badgeDelta",
    "kicker",
    "sub",
    "duration"
  ],
  "typography/type-entrance-moves": [
    "word",
    "duration"
  ],
  "typography/type-rhythm-sync": [
    "variant",
    "word",
    "brand",
    "line1",
    "line2",
    "duration"
  ],
  "typography/typewriter-moves": [
    "draft",
    "keep",
    "final",
    "highlight",
    "brand",
    "duration"
  ],
  "typography/vertical-word-roll-blur-cycle": [
    "prefix",
    "words",
    "duration"
  ],
  "typography/word-relay-filmstrip": [
    "words",
    "notes",
    "brand",
    "duration"
  ],
  "typography/word-relay-geometry": [
    "words",
    "subs",
    "brand",
    "duration"
  ],
  "ui-entrance/list-reveal": [
    "items",
    "kicker",
    "headline",
    "sub",
    "duration"
  ],
  "ui-entrance/avatar-bracket-carousel": [
    "left",
    "right",
    "roles",
    "duration"
  ],
  "ui-entrance/product-card-progressive-assemble": [
    "kicker",
    "title",
    "pills",
    "oldPrice",
    "price",
    "chip",
    "body",
    "cta",
    "duration"
  ],
  "ui-entrance/research-card-stack-scroll": [
    "titles",
    "duration"
  ],
  "ui-entrance/draw-svg-trace": [
    "title",
    "bigNumber",
    "desc",
    "brand",
    "byline",
    "duration"
  ],
  "ui-entrance/wall-reveal-moves": [
    "variant",
    "brand",
    "headline",
    "duration"
  ],
  "data/before-after-slider-scrub": [
    "beforeLabel",
    "afterLabel",
    "duration"
  ],
  "data/chart-live-moves": [
    "variant",
    "data",
    "labels",
    "metric",
    "period",
    "caption",
    "groups",
    "values",
    "brand",
    "duration"
  ],
  "data/gauge-readout-moves": [
    "variant",
    "title",
    "node",
    "sensors",
    "metric",
    "brand",
    "duration"
  ],
  "data/scroll-brake-moves": [
    "variant",
    "title",
    "brand",
    "duration"
  ],
  "data/timeline-travel": [
    "events",
    "kicker",
    "headline",
    "duration"
  ]
}

/** Params the AI must fill for each component (schema entries with required: true). */
const REQUIRED_PARAMS = {
  "typography/marker-underline-title": [
    "title"
  ],
  "typography/blur-slide": [
    "title1",
    "title2"
  ],
  "typography/outline-word-fill": [
    "word"
  ],
  "typography/gradient-word-sweep": [
    "keyword"
  ],
  "typography/lead-word-zoom-assemble": [
    "text"
  ],
  "typography/brace-expand": [
    "title"
  ],
  "typography/countdown-arc-scatter": [
    "number",
    "words"
  ],
  "typography/paper-title-card": [
    "text"
  ],
  "typography/pill-slot-cycle": [
    "stem",
    "pills"
  ],
  "typography/pill-chip-slot-cycle-handled": [
    "words"
  ],
  "typography/glitch-cycle": [
    "phrases"
  ],
  "typography/text-column-converge": [
    "prefix",
    "lastWord"
  ],
  "typography/title-demote-to-label": [
    "titleA",
    "titleB"
  ],
  "typography/type-assembly-moves": [
    "variant",
    "text"
  ],
  "typography/type-entrance-moves": [
    "word"
  ],
  "typography/type-rhythm-sync": [
    "variant",
    "word"
  ],
  "typography/typewriter-moves": [
    "draft",
    "final"
  ],
  "typography/vertical-word-roll-blur-cycle": [],
  "typography/word-relay-filmstrip": [],
  "typography/word-relay-geometry": [],
  "ui-entrance/list-reveal": [],
  "ui-entrance/avatar-bracket-carousel": [],
  "ui-entrance/product-card-progressive-assemble": [
    "title"
  ],
  "ui-entrance/research-card-stack-scroll": [],
  "ui-entrance/draw-svg-trace": [
    "title"
  ],
  "ui-entrance/wall-reveal-moves": [
    "variant"
  ],
  "data/before-after-slider-scrub": [],
  "data/chart-live-moves": [
    "variant"
  ],
  "data/gauge-readout-moves": [
    "variant"
  ],
  "data/scroll-brake-moves": [
    "variant"
  ],
  "data/timeline-travel": []
}

/** Allowed values for select-type params. */
const SELECT_OPTIONS = {
  "typography/type-assembly-moves": {
    "variant": [
      "split-text-stagger",
      "letterform-drift",
      "text-on-path"
    ]
  },
  "typography/type-rhythm-sync": {
    "variant": [
      "font-weight-pump",
      "karaoke-fill-sync"
    ]
  },
  "ui-entrance/wall-reveal-moves": {
    "variant": [
      "bento-light-up",
      "wireframe-draw-on"
    ]
  },
  "data/chart-live-moves": {
    "variant": [
      "axis-rescale-shock",
      "oscilloscope-stream",
      "unit-dot-swarm-regroup"
    ]
  },
  "data/gauge-readout-moves": {
    "variant": [
      "needle-sweep-selftest",
      "tape-scroll-fixed-pointer"
    ]
  },
  "data/scroll-brake-moves": {
    "variant": [
      "brake-reticle-lock",
      "changelog-scroll-brake"
    ]
  }
}

function fail(proposalId, message) {
  throw new Error(`组件 ${proposalId} 的组件引用非法：${message}`)
}

function checkSelect(proposalId, componentId, name, value, allowed) {
  if (value === undefined || value === null) return
  if (!allowed.includes(value)) {
    fail(proposalId, `${componentId}.${name} 只能是 ${allowed.join('/')}，当前为 ${JSON.stringify(value)}`)
  }
}

function checkNumber(proposalId, componentId, name, value) {
  if (value === undefined || value === null) return
  if (!Number.isFinite(value)) fail(proposalId, `${componentId}.${name} 必须是数字，当前为 ${JSON.stringify(value)}`)
}

function validateLibraryRef(proposalId, ref) {
  if (!ref || typeof ref !== 'object' || Array.isArray(ref)) fail(proposalId, '组件引用不是对象')
  if (ref.lib !== 'shotcraft') fail(proposalId, `引用的组件库是 "${ref.lib}"，本校验器只处理 shotcraft`)
  const componentId = ref.componentId
  if (!SHOTCRAFT_ALLOWLIST.has(componentId)) {
    fail(proposalId, `组件 ID "${componentId}" 不在 ${SHOTCRAFT_COMPONENT_IDS.length} 个白名单组件内`)
  }
  const params = ref.params
  if (!params || typeof params !== 'object' || Array.isArray(params)) fail(proposalId, '缺少参数包 params')
  const known = KNOWN_PARAMS[componentId]
  for (const key of Object.keys(params)) {
    if (!known.includes(key)) {
      fail(proposalId, `${componentId} 不允许的参数 "${key}"：只能照 propsSchema 填空，不许自填颜色/字号或新增字段`)
    }
  }
  for (const key of REQUIRED_PARAMS[componentId]) {
    if (params[key] === undefined || params[key] === null || params[key] === '') {
      fail(proposalId, `${componentId} 缺少必填参数 "${key}"`)
    }
  }
  const selects = SELECT_OPTIONS[componentId] || {}
  for (const key of Object.keys(selects)) {
    checkSelect(proposalId, componentId, key, params[key], selects[key])
  }
}

export function validateShotcraftLibraryRefs(plan) {
  if (!plan || !Array.isArray(plan.proposals)) throw new Error('包装方案缺少提案列表，无法校验组件引用')
  for (const proposal of plan.proposals) {
    if (proposal.libraryRef !== undefined) validateLibraryRef(proposal.proposalId, proposal.libraryRef)
  }
  return plan
}
