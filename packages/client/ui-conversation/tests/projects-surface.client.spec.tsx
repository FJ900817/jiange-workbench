// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ConversationInjected } from '../src/client/contract/slots.ts'
import { PROJECT_FIXTURES } from '../src/client/skeleton/project-fixtures.ts'
import { ProjectsSurface, WorkspaceComingSoon } from '../src/client/skeleton/WorkspaceSurfaces.tsx'
import { StudiosSurface } from '../src/client/skeleton/StudiosSurface.tsx'
import { createImageCandidateFixtures, IMAGE_MODELS, STUDIO_CONTEXT } from '../src/client/skeleton/studio-fixtures.ts'
import { WorkSurface } from '../src/client/skeleton/WorkSurface.tsx'
import { toProjectContext } from '../src/client/skeleton/project-context.ts'
import { publishXhsRealContext } from '../src/client/skeleton/xhs-real-context-store.ts'
import { XHS_REAL_CONTEXT_FIXTURE } from './xhs-real-context.fixture.ts'

beforeEach(() => { publishXhsRealContext({ status: 'ready', context: XHS_REAL_CONTEXT_FIXTURE }) })
afterEach(() => { cleanup(); publishXhsRealContext({ status: 'unavailable' }) })

describe('Business Workbench workspace surfaces', () => {
  it('shows the real XHS identity separately from remaining project fixtures', () => {
    expect(PROJECT_FIXTURES).toHaveLength(4)
    for (const project of PROJECT_FIXTURES) {
      expect(project.project_id).toBeTruthy()
      expect(project.name).toBeTruthy()
      expect(project.goal).toBeTruthy()
      expect(project.stage).toBeTruthy()
      expect(project.workspace_binding).toBeTruthy()
      expect(project.artifacts).toBeTruthy()
      expect(project.recent_activity).toBeTruthy()
    }

    render(<ProjectsSurface />)
    expect(screen.getByRole('heading', { name: 'Projects' })).toBeTruthy()
    expect((screen.getByRole('button', { name: /新建 Project · 尚未开放/ }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('button', { name: /账号2 · 2026-08 · 第02周 · note001/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /小红书虚拟产品/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /账号2 · 2026-08 · 第02周 · note001/ }))
    expect(screen.getByRole('heading', { name: '小红书' })).toBeTruthy()
    expect(screen.getByText(/7 个关联 Job|1 个关联 Job/)).toBeTruthy()
    expect(screen.getByText('当前 Project 与 Harness Workspace 尚无正式绑定关系。')).toBeTruthy()
    expect(screen.getByText('Project ID 尚未建立。')).toBeTruthy()
    expect(screen.getAllByText('小红书')).toHaveLength(2)
    expect(screen.getByRole('heading', { name: 'Review 与 Validation' })).toBeTruthy()
    expect(screen.getAllByText('Validation')).toHaveLength(4)
    expect(screen.getAllByText('FAIL')).toHaveLength(5)
    const disclosure = screen.getAllByText('查看完整技术信息')[0]!
    expect(disclosure).toBeTruthy()
    fireEvent.click(disclosure!)
    const reviewDetails = disclosure.closest('details')
    expect(reviewDetails).not.toBeNull()
    expect(within(reviewDetails!).getByText('artifact-review')).toBeTruthy()
    expect(within(reviewDetails!).getByText('job-upstream')).toBeTruthy()
    expect(within(reviewDetails!).getByText('artifact-upstream')).toBeTruthy()
    const sourceDisclosure = screen.getAllByText('查看完整技术信息').at(-1)!
    fireEvent.click(sourceDisclosure)
    const sourceDetails = sourceDisclosure.closest('details')
    expect(sourceDetails).not.toBeNull()
    expect(within(sourceDetails!).getByText('/fixture/task.md')).toBeTruthy()
    expect(within(sourceDetails!).getByText('/fixture/note.md')).toBeTruthy()
  })

  it('maps the exact sample to a read-only ProjectContext without inventing a registry ID', () => {
    expect(toProjectContext(XHS_REAL_CONTEXT_FIXTURE)).toEqual({
      projectId: null,
      projectKey: 'xhs',
      projectName: '小红书',
      projectType: 'xhs',
      account: 'account2',
      period: '2026-08',
      week: '第02周',
      note: 'note001',
      sampleIdentity: 'account2/2026-08/第02周/note001',
      source: 'xhs-real-context-read-only-projection',
    })
  })

  it('navigates from the real Project projection to the same Work and Studio context', () => {
    render(<><ProjectsSurface /><WorkSurface /><StudiosSurface /></>)
    const projects = within(screen.getByRole('main', { name: 'Projects' }))
    fireEvent.click(projects.getByRole('button', { name: /账号2 · 2026-08 · 第02周 · note001/ }))
    expect(screen.getByRole('heading', { name: '小红书' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '打开对应 Work ↗' }))
    expect(screen.getByRole('heading', { name: 'Swiss 封面框架与 P5 素材审核' })).toBeTruthy()
    expect(screen.getByText(/identity account2\/2026-08\/第02周\/note001/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '打开 Image Studio ↗' }))
    expect(screen.getByRole('main', { name: 'Image Studio' })).toBeTruthy()
    expect(screen.getByText(/3 个真实候选 · 均未批准/)).toBeTruthy()
    expect(within(screen.getByRole('main', { name: 'Image Studio' })).getAllByText('AWAITING_HUMAN_REVIEW')).toHaveLength(2)

    fireEvent.click(projects.getByRole('button', { name: '打开 Cover Studio ↗' }))
    expect(screen.getByRole('main', { name: 'Cover Studio' })).toBeTruthy()
    expect(screen.getByText(/P5 · Swiss/)).toBeTruthy()
  })

  it('marks unfinished first-phase workspaces as placeholders instead of completed features', () => {
    render(<WorkspaceComingSoon workspace="studios" />)
    expect(screen.getByRole('heading', { name: 'Studios' })).toBeTruthy()
    expect(screen.getByText('本阶段尚未开放')).toBeTruthy()
  })

  it('shows a single real Work aggregate with exact Job counts and no fixture tasks', () => {
    render(<WorkSurface />)
    const work = within(screen.getByRole('main', { name: 'Work' }))
    expect(work.getByRole('heading', { name: 'Work' })).toBeTruthy()
    expect(work.getByRole('heading', { name: '需要关注' })).toBeTruthy()
    expect(work.getByText('暂无正在执行的工作')).toBeTruthy()
    expect(work.getByRole('heading', { name: '最近工作' })).toBeTruthy()
    expect(work.getByText(/已完成 4 · 已中断 2 · 失败 1/)).toBeTruthy()
    expect(work.getByText('4 个 Job 已完成')).toBeTruthy()
    expect(work.getByText('Job 失败 1')).toBeTruthy()
    expect(work.getByText('Job 中断 2')).toBeTruthy()
    expect(work.getByText('Validation FAIL 4')).toBeTruthy()
    expect(work.queryByText(/账号4|公众号｜文章终稿确认|AI 自媒体｜竞品分析/)).toBeNull()
  })

  it('opens the real Work detail with seven Jobs, raw review evidence, and no write actions', () => {
    render(<WorkSurface />)
    const work = within(screen.getByRole('main', { name: 'Work' }))
    fireEvent.click(work.getByRole('button', { name: /Swiss 封面框架与 P5 素材审核/ }))
    expect(work.getByRole('heading', { name: 'Swiss 封面框架与 P5 素材审核' })).toBeTruthy()
    expect(work.getByRole('heading', { name: 'Job 执行记录' })).toBeTruthy()
    expect(work.getByRole('heading', { name: '关联产物' })).toBeTruthy()
    expect(work.getByRole('heading', { name: 'Review 与 Validation' })).toBeTruthy()
    expect(work.getAllByText('失败')).toHaveLength(1)
    expect(work.getAllByText('FAIL')).toHaveLength(5)
    expect(work.getByText(/7 个关联 Job/)).toBeTruthy()
    expect(work.getByText(/正式选中项为 空/)).toBeTruthy()
    expect(work.queryByRole('button', { name: '通过' })).toBeNull()
    expect(work.queryByRole('button', { name: '要求修改' })).toBeNull()

    fireEvent.click(work.getByRole('button', { name: /返回 Work/ }))
    expect(work.getByRole('heading', { name: 'Work' })).toBeTruthy()
  })

  it('returns from Work Detail to the same Project projection and carries context into Image Studio', () => {
    render(<><ProjectsSurface /><WorkSurface /><StudiosSurface /></>)
    const work = within(screen.getByRole('main', { name: 'Work' }))
    fireEvent.click(work.getByRole('button', { name: /Swiss 封面框架与 P5 素材审核/ }))
    fireEvent.click(work.getByRole('button', { name: /小红书 · 账号 2 \/ note001/ }))
    const projects = within(screen.getByRole('main', { name: 'Projects' }))
    expect(projects.getByRole('heading', { name: '小红书' })).toBeTruthy()
    expect(projects.getByText(/account2 \/ 2026-08 \/ 第02周 \/ note001/)).toBeTruthy()

    fireEvent.click(work.getByRole('button', { name: /查看候选素材 · Image Studio/ }))
    const imageStudio = within(screen.getByRole('main', { name: 'Image Studio' }))
    expect(imageStudio.getByLabelText('Image Studio 当前上下文').textContent).toContain('account2 · 2026-08 · 第02周 · note001')
    expect(imageStudio.getByLabelText('Image Studio 当前上下文').textContent).toContain('P5')
    expect(imageStudio.getAllByText('AWAITING_HUMAN_REVIEW')).toHaveLength(2)

    fireEvent.click(work.getByRole('button', { name: /查看封面框架 · Cover Studio/ }))
    const coverStudio = within(screen.getByRole('main', { name: 'Cover Studio' }))
    expect(coverStudio.getByLabelText('Cover Studio 当前上下文').textContent).toContain('account2 · 2026-08 · 第02周 · note001')
    expect(coverStudio.getAllByText(/search_solution/)).toHaveLength(2)
    expect(coverStudio.getByText(/P5 · Swiss/)).toBeTruthy()
  })

  it('shows the three real Studios workspaces without fabricated candidate data', () => {
    const candidates = createImageCandidateFixtures(IMAGE_MODELS[0], 'local prompt')
    expect(candidates).toHaveLength(4)
    expect(candidates[0]).toMatchObject({
      provider: 'Seedream',
      model: 'Seedream 5 Pro',
      prompt: 'local prompt',
      dimensions: '1024 × 1536',
      project_id: STUDIO_CONTEXT.projectId,
      work_id: STUDIO_CONTEXT.workId,
      page: 'P5',
      slot: 'Hero Material',
      approval_status: 'candidate',
    })

    render(<StudiosSurface />)
    expect(screen.getByRole('main', { name: 'Studios 创作工作台' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Studios' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /进入 Image Studio/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /进入 Video Studio/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /进入包装编辑器/ })).toBeTruthy()
    expect(screen.queryByText(/FORMAL_PLACEHOLDER|Baseline FROZEN/)).toBeNull()
  })

  it('keeps XHS-only Studios gated while allowing Host-backed media creation without an XHS sample', async () => {
    publishXhsRealContext({ status: 'unavailable' })
    const mediaStudio = {
      models: vi.fn(async () => []),
      sessions: vi.fn(async () => []),
      read: vi.fn(async () => null),
      create: vi.fn(async () => { throw new Error('not used') }),
      poll: vi.fn(async () => { throw new Error('not used') }),
      cancel: vi.fn(async () => { throw new Error('not used') }),
    } as unknown as NonNullable<ConversationInjected['mediaStudio']>

    render(<StudiosSurface mediaStudio={mediaStudio} />)
    expect(screen.queryByText('真实样本当前不可读取；不会用候选 Fixture 替代。')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /进入 Image Studio/ }))
    expect(await screen.findByRole('main', { name: 'Image Studio · 连续创作' })).toBeTruthy()
    await waitFor(() => {
      expect(mediaStudio.models).toHaveBeenCalledWith('image')
      expect(mediaStudio.sessions).toHaveBeenCalledWith('image')
    })
  })

  it('shows the three Studios workflows without XHS sample gating when the Host Remote is absent', () => {
    publishXhsRealContext({ status: 'unavailable' })
    render(<StudiosSurface />)
    expect(screen.getByRole('heading', { name: '开始创作' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Image Studio/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Video Studio/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Video Packaging/ })).toBeTruthy()
    expect(screen.queryByText(/XHS 样本/)).toBeNull()
  })

  it('navigates from Studios to the same Project and Work context', () => {
    render(<><ProjectsSurface /><WorkSurface /><StudiosSurface /></>)
    fireEvent.click(screen.getByRole('button', { name: /打开原有业务素材审核/ }))
    fireEvent.click(screen.getByRole('button', { name: /继续查看候选/ }))
    const imageStudio = within(screen.getByRole('main', { name: 'Image Studio' }))
    expect(imageStudio.getByLabelText('Image Studio 当前上下文').textContent).toContain('account2 · 2026-08 · 第02周 · note001')
    fireEvent.click(imageStudio.getByRole('button', { name: 'Project ↗' }))
    const projects = within(screen.getByRole('main', { name: 'Projects' }))
    expect(projects.getByRole('heading', { name: '小红书' })).toBeTruthy()
    expect(projects.getByText(/account2 \/ 2026-08 \/ 第02周 \/ note001/)).toBeTruthy()

    fireEvent.click(imageStudio.getByRole('button', { name: 'Work ↗' }))
    const work = within(screen.getByRole('main', { name: 'Work' }))
    expect(work.getByRole('heading', { name: 'Swiss 封面框架与 P5 素材审核' })).toBeTruthy()
    expect(work.getByText(/identity account2\/2026-08\/第02周\/note001/)).toBeTruthy()
  })
})
