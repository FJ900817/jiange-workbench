export declare const TALKCRAFT_COMPONENT_IDS: readonly string[]

export interface TalkcraftPropSchema {
  name: string
  /** 'string' | 'number' | 'boolean' | 'array' | 'object' */
  kind: string
  required: boolean
  /** 默认值的人话说明（'' = 无默认值/占位兜底） */
  default: string
  desc: string
}

export interface TalkcraftComponentSpec {
  slug: string
  name: string
  oneliner: string
  category: string
  priority: string
  meta: { width: number; height: number; fps: number; durationInFrames: number; durationSec: number }
  semanticWords: string[]
  inputType: string[]
  propsSchema: TalkcraftPropSchema[]
}

export declare const TALKCRAFT_COMPONENTS: Record<string, TalkcraftComponentSpec>

/** 取一张卡的注册信息；不在白名单抛中文错。 */
export declare function getTalkcraftComponent(componentId: string): TalkcraftComponentSpec

import type { LibraryRef } from './packaging-plan.js'
/** 把一条 libraryRef 翻译成人话摘要（面板展示 / 日志用，不调模型）。 */
export declare function describeTalkcraftReference(libraryRef: LibraryRef): string
