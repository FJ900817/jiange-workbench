export interface TranscriptSegment {
  readonly id: string
  readonly start: number
  readonly end: number
  readonly text: string
}

export interface PackagingTranscript {
  readonly id: string
  readonly fileName: string
  readonly sourceKind: string
  readonly segments: readonly TranscriptSegment[]
}

/** Reference to a real component from one of the four component libraries (P1/P2: aikou + talkcraft + shotcraft). */
export interface LibraryRef {
  readonly lib: 'aikou' | 'talkcraft' | 'shotcraft' | 'huashu'
  readonly componentId: string
  readonly params: Record<string, unknown>
  readonly state?: string
}

/**
 * 组件库 lint 消费的最小方案形态（运行时只读 proposals；生产侧 packaging-plan.js
 * 传的就是过滤后的 { proposals } 子集，所以 .d.ts 按实际消费声明，不按 PackagingPlan）。
 * proposals 缺失时运行时抛中文错，类型上同样允许缺省。
 */
export interface LibraryLintInputPlan {
  readonly proposals?: readonly {
    readonly proposalId?: unknown
    readonly libraryRef?: unknown
    readonly animation?: unknown
  }[]
}

export interface PackagingProposal {  readonly proposalId: string
  readonly componentType: 'title' | 'highlight' | 'info'
  readonly segmentId: string
  readonly evidenceText: string
  readonly semanticReason: string
  readonly start: number
  readonly duration: number
  readonly position: { x: number; y: number; width: number; height: number }
  readonly content: { text?: string; title?: string; body?: string }
  readonly style: { fontSize: number; color: string; accent: string; background: string }
  readonly animation: 'fadeUp' | 'fade' | 'none' | 'slam' | 'countUp' | 'wordSwap' | 'wipe' | 'spring'
  readonly libraryRef?: LibraryRef
  _selected?: boolean
}

export interface PackagingPlan {
  readonly schemaVersion: 1
  readonly planId: string
  readonly generatedBy: 'fixture-keyword-rules'
  readonly model: null
  readonly stylePreset: string
  readonly requiresVisualReview: true
  readonly video: { duration: number; width: number; height: number }
  readonly transcript: PackagingTranscript
  readonly proposals: PackagingProposal[]
}

export function parseSubtitles(source: 'srt' | 'vtt', text: string, mediaDuration: number): TranscriptSegment[]
export function createFixturePlan(input: {
  duration: number
  width: number
  height: number
  transcript: PackagingTranscript
  stylePreset?: string
}): PackagingPlan
export function validatePackagingPlan(plan: PackagingPlan): PackagingPlan
export function applyPackagingPlan<T extends { components: readonly Record<string, unknown>[] }>(
  project: T,
  plan: PackagingPlan,
  selectedProposalIds?: readonly string[],
): {
  project: T & { components: readonly Record<string, unknown>[]; packagingPlanRecord: Record<string, unknown> }
  addedIds: string[]
  skippedProposalIds: string[]
}
