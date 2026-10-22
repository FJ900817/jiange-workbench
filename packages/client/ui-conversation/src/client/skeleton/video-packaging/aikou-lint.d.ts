import type { PackagingPlan } from './packaging-plan.js'

/** Components the AI may name in libraryRef.componentId (P0). */
export declare const AIKOU_COMPONENT_IDS: readonly string[]

/**
 * Lint every libraryRef in a packaging plan at the proposal level.
 * Throws a Chinese error on the first illegal reference.
 */
export declare function validateAikouLibraryRefs(plan: PackagingPlan): PackagingPlan
