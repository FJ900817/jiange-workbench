import type { LibraryLintInputPlan, PackagingPlan } from './packaging-plan.js'

/** 29 张真 props 卡的 componentId 白名单。 */
export declare const TALKCRAFT_COMPONENT_IDS: readonly string[]

/**
 * 校验方案里每条 libraryRef（无 libraryRef 的提案跳过）。
 * 首个违规抛中文错；全合法返回同一个 plan。不调模型。
 */
export declare function validateTalkcraftLibraryRefs(plan: LibraryLintInputPlan): PackagingPlan
