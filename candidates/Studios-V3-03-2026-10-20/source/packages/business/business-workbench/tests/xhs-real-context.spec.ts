import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readXhsRealContext } from '../src/xhs-real-context.ts'
import type { BusinessJob } from '../src/types.ts'

const roots: string[] = []
const identity = 'account2/2026-08/第02周/note001'
const pages = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8']

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

describe('readXhsRealContext', () => {
  it('projects only verified source, Job, Swiss, render, and unapproved-asset evidence', async () => {
    const fixture = await createFixture()
    const context = await readXhsRealContext({
      xhsRoot: fixture.xhsRoot,
      artifactRoot: fixture.artifactRoot,
      jobs: fixture.jobs,
      readArtifact: async artifactId => ({
        artifact: {} as never,
        content: artifactId === 'artifact-review'
          ? JSON.stringify({ review_result: 'FAIL', reviewer_type: 'business-ai', source_job_id: 'job-upstream', source_artifact_id: 'artifact-upstream' })
          : JSON.stringify({ result: { status: 'FAIL' }, jobId: 'job-source' }),
      }),
    })

    expect(context.identity).toBe(identity)
    expect(context.project.status).toBe('verified')
    expect(context.project.value.registryEntityExists).toBe(false)
    expect(context.project.value.sourceRoot).toBe('configured-xhs-root')
    expect(context.source.status).toBe('verified')
    expect(context.source.value.taskCardPath).toMatch(/^xhs\//u)
    expect(context.source.value.notePath).toMatch(/^xhs\//u)
    expect(JSON.stringify(context)).not.toContain(fixture.xhsRoot)
    expect(JSON.stringify(context)).not.toContain(fixture.artifactRoot)
    expect(context.source.value.taskCardSha256).toBe(fixture.taskCardSha256)
    expect(context.source.value.noteSha256).toBe(fixture.noteSha256)
    expect(context.work.value.aggregate).toBe(true)
    expect(context.work.value.jobCount).toBe(7)
    expect(context.jobs.value).toHaveLength(7)
    expect(context.jobs.value[0]?.id).toBe('job-real-0')
    expect(context.cover.value.route).toBe('search_solution')
    expect(context.cover.value.family).toBe('Swiss')
    expect(context.cover.value.pages).toEqual(pages)
    expect(context.cover.value.baselineStatus).toBe('FROZEN')
    expect(context.cover.value.imageSlots).toBe(1)
    expect(context.cover.value.p5State).toBe('FORMAL_PLACEHOLDER')
    expect(context.cover.value.rendererPagesPassed).toBe(8)
    expect(context.renderer.value.status).toBe('PASS')
    expect(context.renderer.value.pagesPassed).toBe(8)
    expect(context.cover.value.providerCalls).toBe(0)
    expect(context.cover.value.imageGenerationCalls).toBe(0)
    expect(context.assets.value.selectedAsset).toBeNull()
    expect(context.assets.value.automaticSelection).toBe(false)
    expect(context.assets.value.candidates).toHaveLength(3)
    expect(context.assets.value.candidates[0]?.dataUrl).toMatch(/^data:image\/png;base64,/)
    expect(context.reviews.value[0]).toMatchObject({ sourceJobId: 'job-upstream', sourceArtifactId: 'artifact-upstream', reviewResult: 'FAIL' })
    expect(context.validations.value[0]).toMatchObject({ sourceJobId: 'job-source', result: 'FAIL' })
    expect(context.workspace.value.projectBindingExists).toBe(false)
  })

  it('does not aggregate a Job whose identity differs from the fixed sample', async () => {
    const fixture = await createFixture()
    const unrelated = { ...fixture.jobs[0], input: { ...fixture.jobs[0]!.input, reference: 'account4/2026-08/第01周/note001' } } as BusinessJob
    const context = await readXhsRealContext({
      xhsRoot: fixture.xhsRoot,
      artifactRoot: fixture.artifactRoot,
      jobs: [unrelated],
      readArtifact: async () => { throw new Error('unexpected Artifact read') },
    })

    expect(context.work.status).toBe('missing')
    expect(context.work.value.jobCount).toBe(0)
    expect(context.jobs.value).toEqual([])
    expect(context.source.status).toBe('partial')
  })

  it('rejects candidate bytes that do not match the immutable asset manifest', async () => {
    const fixture = await createFixture(true)
    await expect(readXhsRealContext({
      xhsRoot: fixture.xhsRoot,
      artifactRoot: fixture.artifactRoot,
      jobs: fixture.jobs,
      readArtifact: async artifactId => ({
        artifact: {} as never,
        content: artifactId === 'artifact-review'
          ? JSON.stringify({ review_result: 'FAIL', reviewer_type: 'business-ai', source_job_id: 'job-upstream', source_artifact_id: 'artifact-upstream' })
          : JSON.stringify({ result: { status: 'FAIL' }, jobId: 'job-source' }),
      }),
    })).rejects.toThrow(/hash does not match/u)
  })

  it('rejects an XHS source symlink that escapes the configured read root', async () => {
    const fixture = await createFixture()
    await unlink(join(fixture.sampleDirectory, '写作任务卡.md'))
    const outside = join(roots[roots.length - 1]!, 'outside-task-card.md')
    await writeFile(outside, 'outside source')
    await symlink(outside, join(fixture.sampleDirectory, '写作任务卡.md'))
    await expect(readXhsRealContext({
      xhsRoot: fixture.xhsRoot,
      artifactRoot: fixture.artifactRoot,
      jobs: fixture.jobs,
      readArtifact: async () => { throw new Error('unexpected Artifact read') },
    })).rejects.toThrow(/symlink escapes/u)
  })
})

async function createFixture(tamperCandidate = false): Promise<{
  readonly xhsRoot: string
  readonly sampleDirectory: string
  readonly artifactRoot: string
  readonly taskCardSha256: string
  readonly noteSha256: string
  readonly jobs: readonly BusinessJob[]
}> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-xhs-real-context-'))
  roots.push(root)
  const xhsRoot = join(root, 'xhs')
  const sample = join(xhsRoot, '01_小红书生产创作系统/03_内容生产/小红书/产品1-视觉审美认知系统/账号2/2026-08/第02周/note001')
  const artifactRoot = join(root, 'artifacts')
  const noteDirectory = join(artifactRoot, 'projects/xhs/cover-handoffs/xhs-cover-handoff-4fe3941582faf51c6395c5018082632bd1c859181667d1991602309c03cf7030')
  const planDirectory = join(artifactRoot, 'projects/xhs/cover-plan-shadow-replays/account2-2026-08-week02-note001/2026-09-12T02-04-01-169Z-title-repair')
  const baselineDirectory = join(artifactRoot, 'projects/xhs/cover-baselines/swiss-cover-framework-baseline-v0.1/account2-2026-08-week02-note001')
  const renderDirectory = join(artifactRoot, 'projects/xhs/cover-framework-renders/account2-2026-08-week02-note001/framework-20260912-v03-round2-formal-hd-2160x2880')
  const assetDirectory = join(artifactRoot, 'projects/xhs/cover-material-generations/account2-2026-08-week02-note001/2026-09-12T02-34-46.167Z-19983728ef35abb34b4ff29e4893c86f')
  await Promise.all([sample, noteDirectory, planDirectory, baselineDirectory, renderDirectory, assetDirectory].map(path => mkdir(path, { recursive: true })))
  const taskCard = Buffer.from('task card truth')
  const note = Buffer.from('note truth')
  await writeFile(join(sample, '写作任务卡.md'), taskCard)
  await writeFile(join(sample, '小红书笔记完整方案.md'), note)
  const taskCardSha256 = sha(taskCard)
  const noteSha256 = sha(note)
  const handoffId = 'xhs-cover-handoff-4fe3941582faf51c6395c5018082632bd1c859181667d1991602309c03cf7030'
  await json(join(noteDirectory, 'source_note_manifest.json'), { artifact_id: handoffId, artifact_sha256: 'handoff-hash', source_note_sha256: noteSha256 })
  await json(join(planDirectory, 'cover_plan.json'), { status: 'PASS', pageOrder: pages })
  await json(join(baselineDirectory, 'baseline_manifest.json'), {
    status: 'FROZEN', immutable: true, source: { noteSha256 }, route: { noteType: 'search_solution', visualFamily: 'Swiss', templateVersion: 'V2_1_Swiss_Purple_QingYa' },
    imageSlots: { P5: { imageCount: 1, frameworkState: 'FORMAL_PLACEHOLDER' } },
  })
  await json(join(renderDirectory, 'formal_hd_render_manifest.json'), {
    status: 'PASS', sourceNoteSha256: noteSha256, results: pages.map(page => ({ page, status: 'PASS' })),
    viewport: { width: 2160, height: 2880 }, deviceScaleFactor: 1, providerCalls: 0, imageGenerationCalls: 0,
  })
  const assets = await Promise.all([0, 1, 2].map(async index => {
    const bytes = Buffer.from(`candidate-${index}`)
    const path = join(assetDirectory, `candidate-${index}.png`)
    await writeFile(path, tamperCandidate && index === 0 ? 'tampered' : bytes)
    return {
      displayName: `Candidate ${index + 1}`, path, sha256: sha(bytes), provider: 'fixture-provider', model: 'fixture-model',
      status: 'candidate', contentType: 'image/png',
    }
  }))
  await json(join(assetDirectory, 'asset_manifest.json'), {
    status: 'AWAITING_HUMAN_REVIEW', page: 'P5', selectedAsset: null, automaticSelection: false, assets,
  })
  const jobs = Array.from({ length: 7 }, (_, index) => ({
    id: `job-real-${index}`, project: 'xhs', status: index === 3 ? 'interrupted' : 'completed', createdAt: 10 + index, updatedAt: 20 + index,
    input: { reference: identity, sha256: taskCardSha256 }, attempts: [],
    artifactRefs: index === 0
      ? [{ artifactId: 'artifact-validation', type: 'validation', path: 'validation.json', hash: 'validation-hash' }]
      : index === 1
        ? [{ artifactId: 'artifact-review', type: 'review', path: 'review.json', hash: 'review-hash' }]
        : [],
  } as unknown as BusinessJob))
  return { xhsRoot, sampleDirectory: sample, artifactRoot, taskCardSha256, noteSha256, jobs }
}

async function json(path: string, value: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(value))
}

function sha(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}
