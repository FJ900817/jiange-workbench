/**
 * talkcraft 渲染分发（P1 收尾）：把一条 libraryRef 翻译成渲染目标。
 *
 * 叠加模式（overlay，默认）用 talkcraft-cards/ 下的透明改编版（alphaFile）；
 * 整屏模式（fullscreen）用原库 template/cards/ 下的原版文件。
 * theme：调用方显式传入优先；否则暗场景（darkScene）下带 theme 的卡默认 dark；
 * 无 theme 的卡保持原样（不注入 theme）。
 *
 * Self-contained ESM：除 talkcraft-components.js 外无 import，顶层 export 各占一行。
 */

import { TALKCRAFT_COMPONENTS } from './talkcraft-components.js'

/** 渲染模式：overlay（叠加，默认）/ fullscreen（整屏）。 */
export const TALKCRAFT_RENDER_MODES = Object.freeze(['overlay', 'fullscreen'])

/**
 * 带 theme 深色字浅色版的卡（同文件 theme?: "light" | "dark"，默认 light）。
 * 名单与 talkcraft-components.js 注释"支持 theme light/dark"及
 * talkcraft-alpha.spec.ts 的 THEMED 一致。
 */
export const TALKCRAFT_THEMED_IDS = Object.freeze([
  'chip-grid-single-select',
  'countdown-arc-scatter',
  'doc-park-left-pill-deal',
  'error-retype',
  'lead-word-zoom-assemble',
  'line-carry-transition',
  'scanline-annotate',
  'source-converge',
  'split-text-stagger',
  'stack-fan-out',
])

/** 原库卡片相对 talkcraft 库根目录的路径（只读来源，不复制进仓库）。 */
export const TALKCRAFT_ORIGINAL_CARDS_DIR = 'template/cards'

/**
 * @typedef {object} TalkcraftRenderContext
 * @property {'overlay' | 'fullscreen'} [mode] 渲染模式，默认 'overlay'
 * @property {boolean} [darkScene] 是否暗视频场景；true 时带 theme 的卡默认 dark
 */

/**
 * @typedef {object} TalkcraftRenderTarget
 * @property {string} componentId
 * @property {'overlay' | 'fullscreen'} mode 生效的渲染模式
 * @property {string} file 渲染用组件文件（overlay→alphaFile；fullscreen→原库路径）
 * @property {Record<string, unknown>} props 传给组件的 props（含 theme 解析结果）
 * @property {'light' | 'dark'} theme 生效的主题
 */

/**
 * 把 talkcraft libraryRef 解析为渲染目标。
 * @param {{ componentId?: string, params?: Record<string, unknown> }} libraryRef
 * @param {TalkcraftRenderContext} [context]
 * @returns {TalkcraftRenderTarget}
 * @throws {Error} componentId 不在白名单、或叠加模式缺少 alphaFile 时抛中文错
 */
export function resolveTalkcraftRenderTarget(libraryRef, context = {}) {
  const componentId = libraryRef?.componentId
  const entry = TALKCRAFT_COMPONENTS[componentId]
  if (entry === undefined) throw new Error(`talkcraft 组件不存在：${String(componentId)}`)
  const mode = context.mode === 'fullscreen' ? 'fullscreen' : 'overlay'
  let file
  if (mode === 'overlay') {
    if (typeof entry.alphaFile !== 'string' || entry.alphaFile.length === 0) {
      throw new Error(`talkcraft 组件 ${componentId} 缺少透明改编版，无法叠加渲染`)
    }
    file = entry.alphaFile
  } else {
    file = `${TALKCRAFT_ORIGINAL_CARDS_DIR}/${componentId}.tsx`
  }
  const props = { ...(libraryRef.params ?? {}) }
  const themed = TALKCRAFT_THEMED_IDS.includes(componentId)
  let theme = 'light'
  const explicit = props.theme
  if (explicit === 'light' || explicit === 'dark') {
    theme = explicit
  } else {
    delete props.theme
    if (themed && context.darkScene === true) {
      theme = 'dark'
      props.theme = 'dark'
    }
  }
  return { componentId, mode, file, props: Object.freeze(props), theme }
}
