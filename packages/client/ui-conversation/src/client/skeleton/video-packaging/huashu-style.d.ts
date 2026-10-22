/** huashu-motion style guide: "借设计不借引擎". See huashu-style.js. */
export declare const HUASHU_ANIMATIONS: readonly string[]
export declare const HUASHU_LANGUAGES: readonly {
  readonly id: string
  readonly says: string
  readonly useWhen: string
  readonly animation: string
  readonly componentType: string
  readonly note: string
  readonly avoidPackaging?: boolean
}[]
export declare const HUASHU_CARD_ELEMENTS: readonly {
  readonly element: string
  readonly cn: string
  readonly componentType: string
  readonly animation: string
  readonly note: string
}[]
export declare const HUASHU_STYLE_PRESETS: Record<string, Record<string, {
  readonly fontSize: number
  readonly color: string
  readonly accent: string
  readonly background: string
}>>
export declare const HUASHU_STYLE_PRESET_IDS: readonly string[]
export declare function isLegalAnimation(value: unknown): boolean
export declare const HUASHU_STYLE_PROMPT: string
