export declare const TALKCRAFT_RENDER_MODES: readonly string[]

export declare const TALKCRAFT_THEMED_IDS: readonly string[]

export declare const TALKCRAFT_ORIGINAL_CARDS_DIR: string

export interface TalkcraftRenderContext {
  mode?: 'overlay' | 'fullscreen'
  darkScene?: boolean
}

export interface TalkcraftRenderTarget {
  componentId: string
  mode: 'overlay' | 'fullscreen'
  file: string
  props: Record<string, unknown>
  theme: 'light' | 'dark'
}

import type { LibraryRef } from './packaging-plan.js'
/** 把 talkcraft libraryRef 解析为渲染目标；componentId 非法时抛中文错。 */
export declare function resolveTalkcraftRenderTarget(
  libraryRef: LibraryRef,
  context?: TalkcraftRenderContext,
): TalkcraftRenderTarget
