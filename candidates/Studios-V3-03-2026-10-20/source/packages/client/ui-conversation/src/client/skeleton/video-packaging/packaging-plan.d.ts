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

export interface PackagingProposal {
  readonly proposalId: string
  readonly componentType: 'title' | 'highlight' | 'info'
  readonly segmentId: string
  readonly evidenceText: string
  readonly semanticReason: string
  readonly start: number
  readonly duration: number
  readonly position: { x: number; y: number; width: number; height: number }
  readonly content: { text?: string; title?: string; body?: string }
  readonly style: { fontSize: number; color: string; accent: string; background: string }
  readonly animation: 'fadeUp' | 'none'
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
export function createFixturePlan(input: { duration: number; width: number; height: number; transcript: PackagingTranscript; stylePreset?: string }): PackagingPlan
export function validatePackagingPlan(plan: PackagingPlan): PackagingPlan
export function applyPackagingPlan<T extends { components: readonly Record<string, unknown>[] }>(project: T, plan: PackagingPlan, selectedProposalIds?: readonly string[]): { project: T & { components: readonly Record<string, unknown>[]; packagingPlanRecord: Record<string, unknown> }; addedIds: string[]; skippedProposalIds: string[] }
