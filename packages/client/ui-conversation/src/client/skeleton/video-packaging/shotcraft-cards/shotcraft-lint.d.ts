/**
 * shotcraft library-reference lint for packaging plans.
 * Generated from shotcraft-index.json — regenerate, do not hand-edit.
 */

/** Components the AI may name in libraryRef.componentId (P2). */
export declare const SHOTCRAFT_COMPONENT_IDS: readonly string[]

/**
 * Lint every libraryRef in a packaging plan at the proposal level.
 * Throws a Chinese error on the first illegal reference.
 */
export declare function validateShotcraftLibraryRefs(plan: { proposals: Array<{ proposalId: string; libraryRef?: unknown }> }): unknown
