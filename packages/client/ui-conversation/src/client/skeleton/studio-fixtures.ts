export const STUDIO_CONTEXT = {
  projectId: 'project-xhs-visual-guide',
  projectName: '小红书虚拟产品',
  workId: 'work-account-4-cover-review',
  workName: '账号4封面审核',
  page: 'P5',
  slot: 'Hero Material',
} as const

export const IMAGE_MODELS = [
  { provider: 'Seedream', model: 'Seedream 5 Pro' },
  { provider: 'Qwen Image', model: 'Qwen Image 3 Pro' },
  { provider: 'Wan', model: 'Wan 2.7 Image Pro' },
] as const

export type ImageModelFixture = (typeof IMAGE_MODELS)[number]

export interface ImageCandidateFixture {
  candidate_id: string
  provider: string
  model: string
  prompt: string
  dimensions: '1024 × 1536'
  created_at: string
  project_id: string
  project_name: string
  work_id: string
  work_name: string
  page: 'P5'
  slot: 'Hero Material'
  approval_status: 'candidate' | 'approved'
  art_variant: 0 | 1 | 2 | 3
}

/** Return local visual candidates; this fixture never invokes an image provider. */
export function createImageCandidateFixtures(model: ImageModelFixture, prompt: string): ImageCandidateFixture[] {
  return [0, 1, 2, 3].map((artVariant) => ({
    candidate_id: `fixture-${model.provider.toLowerCase().replaceAll(' ', '-')}-${artVariant + 1}`,
    provider: model.provider,
    model: model.model,
    prompt,
    dimensions: '1024 × 1536',
    created_at: '2026-09-27 15:20',
    project_id: STUDIO_CONTEXT.projectId,
    project_name: STUDIO_CONTEXT.projectName,
    work_id: STUDIO_CONTEXT.workId,
    work_name: STUDIO_CONTEXT.workName,
    page: STUDIO_CONTEXT.page,
    slot: STUDIO_CONTEXT.slot,
    approval_status: 'candidate',
    art_variant: artVariant as 0 | 1 | 2 | 3,
  }))
}
