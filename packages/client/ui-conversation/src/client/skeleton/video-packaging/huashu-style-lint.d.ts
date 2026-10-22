import type { LibraryLintInputPlan, PackagingPlan } from './packaging-plan.js'

/**
 * huashu 风格 lint 的类型声明（与 huashu-style-lint.js 同构）。
 * 只校验 animation 词汇表；style 四值锁定由 validatePackagingPlan 负责。
 */

/**
 * Lint every proposal's animation in a packaging plan.
 * 首个违规抛中文错；全合法返回同一个 plan。不调模型。
 */
export declare function validateHuashuStyle(plan: LibraryLintInputPlan): PackagingPlan
