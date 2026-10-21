/** Read-only projection of the verified Account 2 Swiss production sample. */

import { createHash } from 'node:crypto'
import { readFile, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { BusinessJob, BusinessArtifactContent, XhsRealContext } from './types.ts'

const IDENTITY = 'account2/2026-08/第02周/note001' as const
const SOURCE_RELATIVE = '01_小红书生产创作系统/03_内容生产/小红书/产品1-视觉审美认知系统'
const HANDOFF_ID = 'xhs-cover-handoff-4fe3941582faf51c6395c5018082632bd1c859181667d1991602309c03cf7030'
const PROJECT_DIRECTORY = 'account2-2026-08-week02-note001'
const HANDOFF_RELATIVE = `projects/xhs/cover-handoffs/${HANDOFF_ID}`
const PLAN_RELATIVE = `projects/xhs/cover-plan-shadow-replays/${PROJECT_DIRECTORY}/2026-09-12T02-04-01-169Z-title-repair/cover_plan.json`
const BASELINE_RELATIVE = `projects/xhs/cover-baselines/swiss-cover-framework-baseline-v0.1/${PROJECT_DIRECTORY}/baseline_manifest.json`
const RENDER_RELATIVE = `projects/xhs/cover-framework-renders/${PROJECT_DIRECTORY}/framework-20260912-v03-round2-formal-hd-2160x2880/formal_hd_render_manifest.json`
const ASSET_RELATIVE = `projects/xhs/cover-material-generations/${PROJECT_DIRECTORY}/2026-09-12T02-34-46.167Z-19983728ef35abb34b4ff29e4893c86f/asset_manifest.json`

interface ReadArtifact {
  (artifactId: BusinessJob['artifactRefs'][number]['artifactId']): Promise<BusinessArtifactContent>
}

/**
 * Read exactly the fixed XHS evidence paths and aggregate the matching durable Jobs.
 * @param input - Configured read roots, existing Jobs, and the Host Artifact reader.
 * @returns Provenance-preserving sample projection with explicit missing or partial sections.
 */
export async function readXhsRealContext(input: {
  readonly xhsRoot: string
  readonly artifactRoot: string
  readonly jobs: readonly BusinessJob[]
  readonly readArtifact: ReadArtifact
}): Promise<XhsRealContext> {
  const xhsRoot = resolve(input.xhsRoot)
  const artifactRoot = resolve(input.artifactRoot)
  const sampleRoot = join(xhsRoot, SOURCE_RELATIVE, '账号2', '2026-08', '第02周', 'note001')
  const taskCardPath = join(sampleRoot, '写作任务卡.md')
  const notePath = join(sampleRoot, '小红书笔记完整方案.md')
  const [taskCard, note, handoff, plan, baseline, renderer, assets] = await Promise.all([
    sourceFile(xhsRoot, taskCardPath), sourceFile(xhsRoot, notePath),
    readJson<Record<string, unknown>>(artifactRoot, inside(artifactRoot, join(artifactRoot, HANDOFF_RELATIVE, 'source_note_manifest.json'))),
    readJson<Record<string, unknown>>(artifactRoot, inside(artifactRoot, join(artifactRoot, PLAN_RELATIVE))),
    readJson<Record<string, unknown>>(artifactRoot, inside(artifactRoot, join(artifactRoot, BASELINE_RELATIVE))),
    readJson<Record<string, unknown>>(artifactRoot, inside(artifactRoot, join(artifactRoot, RENDER_RELATIVE))),
    readJson<Record<string, unknown>>(artifactRoot, inside(artifactRoot, join(artifactRoot, ASSET_RELATIVE))),
  ])
  const sampleJobs = input.jobs
    .filter(job => job.project === 'xhs' && job.input.reference === IDENTITY)
    .sort((left, right) => left.createdAt - right.createdAt || String(left.id).localeCompare(String(right.id)))
  const reviews: Array<XhsRealContext['reviews']['value'][number]> = []
  const validations: Array<XhsRealContext['validations']['value'][number]> = []
  const jobs = []
  for (const job of sampleJobs) {
    const projectedArtifacts = job.artifactRefs.map(artifact => ({
      id: String(artifact.artifactId), type: artifact.type, sha256: artifact.hash,
    }))
    jobs.push({
      id: String(job.id), status: job.status, createdAt: job.createdAt, updatedAt: job.updatedAt,
      attempts: job.attempts.map(attempt => ({ id: String(attempt.id), status: attempt.status })),
      artifacts: projectedArtifacts,
    })
    for (const artifact of job.artifactRefs) {
      if (artifact.type !== 'review' && artifact.type !== 'validation') continue
      const result = await input.readArtifact(artifact.artifactId)
      const document = parseJson(result.content)
      if (artifact.type === 'review') {
        reviews.push({
          artifactId: String(artifact.artifactId),
          reviewResult: text(document['review_result']),
          reviewerType: text(document['reviewer_type']),
          sourceJobId: text(document['source_job_id']),
          sourceArtifactId: text(document['source_artifact_id'] ?? document['source_draft_artifact']),
        })
      } else {
        const validation = record(document['result'])
        validations.push({
          artifactId: String(artifact.artifactId),
          result: text(validation['status']),
          sourceJobId: text(document['jobId']),
        })
      }
    }
  }
  const candidateRows = record(assets)['assets']
  const candidateData = Array.isArray(candidateRows) ? candidateRows : []
  const assetDirectory = dirname(inside(artifactRoot, join(artifactRoot, ASSET_RELATIVE)))
  const candidates = await Promise.all(candidateData.map(async (raw) => {
    const item = record(raw)
    const itemPath = text(item['path'])
    if (!isAbsolute(itemPath) || !isWithin(itemPath, assetDirectory)) {
      throw new Error('business-workbench: Swiss candidate path is outside the fixed material package')
    }
    const resolvedItemPath = await realpath(itemPath)
    if (!isWithin(resolvedItemPath, await realpath(assetDirectory))) {
      throw new Error('business-workbench: Swiss candidate symlink escapes the fixed material package')
    }
    const bytes = await readFile(resolvedItemPath)
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    if (sha256 !== text(item['sha256'])) throw new Error('business-workbench: Swiss candidate image hash does not match its manifest')
    return {
      displayName: text(item['displayName']), sha256, bytes: bytes.byteLength,
      provider: text(item['provider']), model: text(item['model']), status: text(item['status']),
      dataUrl: `data:${text(item['contentType'])};base64,${bytes.toString('base64')}`,
    }
  }))

  const noteSha = note.sha256
  const planRecord = record(plan)
  const baselineRecord = record(baseline)
  const rendererRecord = record(renderer)
  const pageOrder = stringList(planRecord['pageOrder'])
  const renderResults = Array.isArray(rendererRecord['results']) ? rendererRecord['results'].map(record) : []
  const passedPages = renderResults.filter(result => result['status'] === 'PASS').length
  const route = record(baselineRecord['route'])
  const imageSlots = record(baselineRecord['imageSlots'])
  const p5 = record(imageSlots['P5'])
  const imageCount = Number(p5['imageCount'])
  const p5State = text(p5['frameworkState'])
  const assetManifestPage = text(record(assets)['page'])
  const selectedAsset = record(assets)['selectedAsset']
  const automaticSelection = record(assets)['automaticSelection']
  const baselineStatus = text(baselineRecord['status'])
  const baselineImmutable = baselineRecord['immutable'] === true
  const assetStatus = text(assets['status'])
  const routeName = text(route['noteType'])
  const family = text(route['visualFamily'])
  if (selectedAsset !== null && typeof selectedAsset !== 'string') {
    throw new Error('business-workbench: Swiss asset manifest selectedAsset field is malformed')
  }
  if (typeof automaticSelection !== 'boolean') {
    throw new Error('business-workbench: Swiss asset manifest automaticSelection field is malformed')
  }
  if (imageCount !== 1 || p5State !== 'FORMAL_PLACEHOLDER') {
    throw new Error('business-workbench: Swiss Baseline P5 slot metadata does not match the frozen sample contract')
  }
  const sectionsVerified = noteSha === text(record(handoff)['source_note_sha256'])
    && noteSha === text(record(baselineRecord['source'])['noteSha256'])
    && noteSha === text(record(rendererRecord)['sourceNoteSha256'])
    && pageOrder.join(',') === 'P1,P2,P3,P4,P5,P6,P7,P8' && passedPages === 8
    && imageCount === 1 && p5State === 'FORMAL_PLACEHOLDER'
    && baselineStatus === 'FROZEN' && baselineImmutable
    && routeName === 'search_solution' && family === 'Swiss'
    && assetManifestPage === 'P5' && assetStatus === 'AWAITING_HUMAN_REVIEW'
    && selectedAsset === null && automaticSelection === false && candidates.length === 3
  const rendererProjection = {
    status: text(rendererRecord['status']), pagesPassed: passedPages, pagesTotal: renderResults.length,
    width: Number(record(rendererRecord['viewport'])['width']), height: Number(record(rendererRecord['viewport'])['height']),
    deviceScaleFactor: Number(rendererRecord['deviceScaleFactor']),
    providerCalls: Number(rendererRecord['providerCalls']), imageGenerationCalls: Number(rendererRecord['imageGenerationCalls']),
  }

  return {
    identity: IDENTITY,
    project: {
      source: 'BusinessProject discriminator + configured XHS read root', status: 'verified',
      provenance: ['readRoots.xhs', 'BusinessProject=xhs'],
      value: { category: 'xhs', displayName: '小红书', registryEntityExists: false, sourceRoot: 'configured-xhs-root' },
    },
    source: {
      source: 'Configured XHS read root', status: sampleJobs.some(job => taskCard.sha256 === job.input.sha256) && sectionsVerified ? 'verified' : 'partial',
      provenance: [`xhs/${relative(xhsRoot, taskCardPath).split(sep).join('/')}`, `xhs/${relative(xhsRoot, notePath).split(sep).join('/')}`],
      value: {
        taskCardPath: `xhs/${relative(xhsRoot, taskCardPath).split(sep).join('/')}`,
        taskCardSha256: taskCard.sha256, taskCardBytes: taskCard.bytes,
        notePath: `xhs/${relative(xhsRoot, notePath).split(sep).join('/')}`,
        noteSha256: note.sha256, noteBytes: note.bytes,
      },
    },
    work: {
      source: 'Business Workbench Schema V5 Jobs matching exact task identity',
      status: sampleJobs.length > 0 ? 'verified' : 'missing', provenance: ['business_workbench.json: jobs[].input.reference'],
      value: { workKey: IDENTITY, aggregate: true, jobCount: jobs.length },
    },
    jobs: {
      source: 'Business Workbench Schema V5 Jobs matching exact task identity',
      status: sampleJobs.length > 0 ? 'verified' : 'missing',
      provenance: ['business_workbench.json: jobs[].input.reference'],
      value: jobs,
    },
    reviews: {
      source: 'Immutable review Artifacts attached to matching Jobs, preserving source_* relations',
      status: reviews.length === 0 ? 'missing' : 'verified', provenance: ['Business Workbench Artifact store'], value: reviews,
    },
    validations: {
      source: 'Immutable validation Artifacts attached to matching Jobs',
      status: validations.length === 0 ? 'missing' : 'verified', provenance: ['Business Workbench Artifact store'], value: validations,
    },
    cover: {
      source: 'Cover Handoff + Cover Plan shadow + frozen Swiss Baseline + Formal HD render manifest',
      status: sectionsVerified ? 'verified' : 'partial',
      provenance: [HANDOFF_RELATIVE, PLAN_RELATIVE, BASELINE_RELATIVE, RENDER_RELATIVE],
      value: {
        handoffId: text(record(handoff)['artifact_id']), handoffSha256: text(record(handoff)['artifact_sha256']),
        route: routeName, family, coverPlanStatus: text(planRecord['status']), pages: pageOrder,
        templateVersion: text(route['templateVersion']), baselineStatus, baselineImmutable,
        imageSlots: imageCount, p5State,
        rendererStatus: rendererProjection.status, rendererPagesPassed: rendererProjection.pagesPassed,
        rendererPagesTotal: rendererProjection.pagesTotal,
        width: rendererProjection.width, height: rendererProjection.height,
        deviceScaleFactor: rendererProjection.deviceScaleFactor,
        providerCalls: rendererProjection.providerCalls, imageGenerationCalls: rendererProjection.imageGenerationCalls,
      },
    },
    renderer: {
      source: 'Formal HD render manifest; framework output only, not final cover composite',
      status: rendererProjection.status === 'PASS' && rendererProjection.pagesPassed === 8 ? 'verified' : 'partial',
      provenance: [RENDER_RELATIVE],
      value: rendererProjection,
    },
    assets: {
      source: 'P5 Material Generation asset_manifest.json and hash-verified image files',
      status: assetManifestPage === 'P5' && assetStatus === 'AWAITING_HUMAN_REVIEW'
        && selectedAsset === null && automaticSelection === false && candidates.length === 3 ? 'verified' : 'partial',
      provenance: [`business-artifacts/${ASSET_RELATIVE}`],
      value: {
        page: assetManifestPage, imageSlotCount: imageCount,
        status: assetStatus,
        selectedAsset, automaticSelection, candidates,
      },
    },
    workspace: {
      source: 'No Project-to-Workspace relationship exists in the current registry',
      status: 'verified', provenance: ['Harness Workspace Registry has no Project foreign key'],
      value: { projectBindingExists: false, note: 'Workspace remains a Harness registry object; no Project binding is recorded.' },
    },
  }
}

/** Read a source file and return only integrity metadata. */
async function sourceFile(root: string, path: string): Promise<{ readonly sha256: string; readonly bytes: number }> {
  const resolvedRoot = await realpath(root)
  const resolvedPath = await realpath(path)
  if (!isWithin(resolvedPath, resolvedRoot)) throw new Error('business-workbench: XHS source symlink escapes the configured read root')
  const bytes = await readFile(resolvedPath)
  return { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.byteLength }
}

/** Read one known JSON evidence file and fail closed on malformed contents. */
async function readJson<T>(root: string, path: string): Promise<T> {
  const resolvedRoot = await realpath(root)
  const resolvedPath = await realpath(path)
  if (!isWithin(resolvedPath, resolvedRoot)) throw new Error('business-workbench: evidence symlink escapes the configured artifact root')
  return parseJson(await readFile(resolvedPath, 'utf8')) as T
}

/** Parse JSON at a durable file boundary. */
function parseJson(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value)
  return record(parsed)
}

/** Keep filesystem reads below the configured Business Workbench root. */
function inside(root: string, target: string): string {
  const path = resolve(target)
  if (!isWithin(path, root)) throw new Error('business-workbench: evidence path escapes the configured artifact root')
  return path
}

/** Test a resolved path against a directory without accepting sibling prefixes. */
function isWithin(path: string, root: string): boolean {
  const part = relative(root, resolve(path))
  return part === '' || (!part.startsWith(`..${sep}`) && part !== '..' && !isAbsolute(part))
}

/** Narrow a JSON value to its record fields. */
function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

/** Read one non-empty string without coercing absent evidence. */
function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** Preserve the order of a JSON string list and reject malformed entries. */
function stringList(value: unknown): readonly string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string') ? value : []
}

/** Return the parent directory of one absolute path. */
function dirname(path: string): string {
  return resolve(path, '..')
}
