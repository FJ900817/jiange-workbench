import type { XhsRealContext } from '@deepseek-ai/dsh-business-workbench/types'

/** Synthetic browser-test projection; it never represents a production record. */
export const XHS_REAL_CONTEXT_FIXTURE: XhsRealContext = {
  identity: 'account2/2026-08/第02周/note001',
  project: { source: 'test fixture', status: 'verified', provenance: ['fixture'], value: { category: 'xhs', displayName: '小红书', registryEntityExists: false, sourceRoot: 'configured-xhs-root' } },
  source: { source: 'test fixture', status: 'verified', provenance: ['fixture'], value: { taskCardPath: '/fixture/task.md', taskCardSha256: 'a'.repeat(64), taskCardBytes: 20, notePath: '/fixture/note.md', noteSha256: 'b'.repeat(64), noteBytes: 30 } },
  work: { source: 'test fixture', status: 'verified', provenance: ['fixture'], value: { workKey: 'account2/2026-08/第02周/note001', aggregate: true, jobCount: 7 } },
  jobs: { source: 'test fixture', status: 'verified', provenance: ['fixture'], value: [
    ...(['completed', 'completed', 'completed', 'interrupted', 'interrupted', 'completed', 'failed'] as const).map((status, index) => ({
      id: `job-${index + 1}`,
      status,
      createdAt: index + 1,
      updatedAt: index + 2,
      attempts: [{ id: `attempt-${index + 1}`, status }],
      artifacts: index === 0 ? [{ id: 'artifact-review', type: 'review' as const, sha256: 'c'.repeat(64) }, { id: 'artifact-validation', type: 'validation' as const, sha256: 'd'.repeat(64) }] : [],
    })),
  ] },
  reviews: { source: 'test fixture', status: 'verified', provenance: ['fixture'], value: [{ artifactId: 'artifact-review', reviewResult: 'FAIL', reviewerType: 'business-ai', sourceJobId: 'job-upstream', sourceArtifactId: 'artifact-upstream' }] },
  validations: { source: 'test fixture', status: 'verified', provenance: ['fixture'], value: [0, 1, 2, 3].map(index => ({ artifactId: `artifact-validation-${index + 1}`, result: 'FAIL', sourceJobId: `job-${index + 1}` })) },
  cover: { source: 'test fixture', status: 'verified', provenance: ['fixture'], value: { handoffId: 'handoff-real', handoffSha256: 'e'.repeat(64), route: 'search_solution', family: 'Swiss', coverPlanStatus: 'PASS', pages: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'], templateVersion: 'V2_1_Swiss_Purple_QingYa', baselineStatus: 'FROZEN', baselineImmutable: true, imageSlots: 1, p5State: 'FORMAL_PLACEHOLDER', rendererStatus: 'PASS', rendererPagesPassed: 8, rendererPagesTotal: 8, width: 2160, height: 2880, deviceScaleFactor: 1, providerCalls: 0, imageGenerationCalls: 0 } },
  renderer: { source: 'test fixture', status: 'verified', provenance: ['fixture'], value: { status: 'PASS', pagesPassed: 8, pagesTotal: 8, width: 2160, height: 2880, deviceScaleFactor: 1, providerCalls: 0, imageGenerationCalls: 0 } },
  assets: { source: 'test fixture', status: 'verified', provenance: ['fixture'], value: { page: 'P5', imageSlotCount: 1, status: 'AWAITING_HUMAN_REVIEW', selectedAsset: null, automaticSelection: false, candidates: [0, 1, 2].map(index => ({ displayName: `候选 ${index + 1}`, sha256: String(index).repeat(64), bytes: 1024, provider: ['Seedream', 'Qwen Image', 'Wan'][index] ?? 'Provider', model: `model-${index}`, status: 'candidate', dataUrl: 'data:image/png;base64,AA==' })) } },
  workspace: { source: 'test fixture', status: 'verified', provenance: ['fixture'], value: { projectBindingExists: false, note: 'Workspace remains independent in this fixture.' } },
}
