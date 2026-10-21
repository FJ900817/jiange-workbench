import { useEffect, useState } from 'react'
import type { WorkspaceIdentityId } from '@deepseek-ai/dsh-client-ui-primitives'
import { selectWorkspaceIdentity } from '@deepseek-ai/dsh-client-ui-primitives'
import type { XhsRealContext } from '@deepseek-ai/dsh-business-workbench/types'
import { PROJECT_FIXTURES } from './project-fixtures.ts'
import type { ProjectFixture } from './project-fixtures.ts'
import { consumeProjectContextNavigation, requestProjectContextNavigation, useProjectContextNavigation } from './project-context-navigation.ts'
import { toProjectContext } from './project-context.ts'
import { useXhsRealContext } from './xhs-real-context-store.ts'
import css from './WorkspaceSurfaces.module.css'

/** Render the fixture-backed Projects list and detail route. */
export function ProjectsSurface() {
  const [projectId, setProjectId] = useState<string | undefined>()
  const projectNavigation = useProjectContextNavigation()
  const realContext = useXhsRealContext()
  const project = PROJECT_FIXTURES.find(item => item.project_id === projectId)

  useEffect(() => {
    if (projectNavigation?.destination !== 'project-detail') return
    setProjectId('real-xhs-account2-swiss')
    consumeProjectContextNavigation('project-detail')
  }, [projectNavigation])

  if (realContext.status === 'loading') return <SurfaceNotice label="Projects" text="正在读取已验证的小红书样本…" />
  if (realContext.status === 'unavailable') return <SurfaceNotice label="Projects" text="真实样本当前不可读取；示例项目不会替代真实数据。" />

  return (
    <main className={css.root} aria-label="Projects">
      <div className={css.container}>
        {projectId === 'real-xhs-account2-swiss'
          ? <RealXhsProjectDetail context={realContext.context} onBack={() => { setProjectId(undefined) }} />
          : project === undefined
            ? <RealProjectList context={realContext.context} onOpen={setProjectId} />
            : <ProjectDetail project={project} onBack={() => { setProjectId(undefined) }} />}
      </div>
    </main>
  )
}

function SurfaceNotice({ label, text }: { label: string; text: string }) {
  return <main className={css.root} aria-label={label}><div className={css.placeholder}><h1>{label}</h1><p>{text}</p></div></main>
}

function RealProjectList({ context, onOpen }: { context: XhsRealContext; onOpen: (id: string) => void }) {
  const [xhs, ...examples] = PROJECT_FIXTURES
  return <>
    <header className={css.pageHeader}><div><span className={css.eyebrow}>BUSINESS WORKSPACE</span><h1>Projects</h1><p>你的长期业务与 AI 工作上下文</p></div><button className={css.disabledAction} type="button" disabled title="当前没有正式 Project Registry">新建 Project · 尚未开放</button></header>
    <section className={css.focusSection} aria-labelledby="projects-focus-heading">
      <div className={css.sectionHeading}><h2 id="projects-focus-heading">真实业务样本</h2><span>只读真值</span></div>
      <button className={css.featuredProject} type="button" onClick={() => { onOpen('real-xhs-account2-swiss') }}>
        <span className={css.featuredTopline}><span className={css.projectMark} aria-hidden="true">小</span><span className={css.stagePill}>search_solution · Swiss</span><span className={css.arrow} aria-hidden="true">↗</span></span>
        <span className={css.featuredName}>小红书</span>
        <span className={css.featuredGoal}>账号2 · 2026-08 · 第02周 · note001</span>
        <span className={css.activeWork}><span className={css.activeWorkDot} /><span className={css.activeWorkText}>P5 三个候选素材等待人工审核</span><span className={css.activeWorkStatus}>真实数据</span></span>
      </button>
      <p className={css.fixtureNote}>此处为 xhs 业务范围的只读聚合投影，不是正式 Project Registry。</p>
    </section>
    <section className={css.projectsSection} aria-labelledby="projects-examples-heading">
      <div className={css.sectionHeading}><h2 id="projects-examples-heading">其他项目示例</h2><span>Fixture</span></div>
      <div className={css.projectList}>{[xhs, ...examples].filter((item): item is ProjectFixture => item !== undefined && item.project_id !== 'project-xhs-virtual-product').map(item => <ProjectRow key={item.project_id} project={item} onOpen={onOpen} />)}</div>
    </section>
    <p className={css.fixtureNote}>真实样本来源校验：{context.source.value.noteSha256.slice(0, 12)}… · 示例项目仍为本地数据。</p>
  </>
}

function RealXhsProjectDetail({ context, onBack }: { context: XhsRealContext; onBack: () => void }) {
  const project = toProjectContext(context)
  const mostRecentJob = [...context.jobs.value].sort((left, right) => right.updatedAt - left.updatedAt)[0]
  const statusCounts = context.jobs.value.reduce<Record<string, number>>((counts, job) => {
    counts[job.status] = (counts[job.status] ?? 0) + 1
    return counts
  }, {})
  const openWork = () => {
    requestProjectContextNavigation('work-detail')
    selectWorkspaceIdentity('work')
  }
  const openStudio = (destination: 'image-studio' | 'cover-studio') => {
    requestProjectContextNavigation(destination)
    selectWorkspaceIdentity('studios')
  }
  return <div className={css.detailPage}>
    <button className={css.backButton} type="button" onClick={onBack}>← <span>返回 Projects</span></button>
    <header className={css.detailHeader}>
      <div className={css.detailTitleLine}><span className={css.projectMarkLarge} aria-hidden="true">小</span><div><span className={css.eyebrow}>XHS · 只读聚合投影</span><h1>小红书</h1></div></div>
      <p>{project.account} / {project.period} / {project.week} / {project.note} · {context.cover.value.route} / {context.cover.value.family}</p>
      <span className={css.stagePill}>只读 Project 投影 · 当前样本不是 Project 本身</span>
    </header>
    <div className={css.projectIdentity} data-project-key={project.projectKey} data-sample-identity={project.sampleIdentity}>
      <span>Project key <strong>{project.projectKey}</strong></span><span>Project ID <strong>未建立</strong></span><span>Workspace binding <strong>未绑定</strong></span>
    </div>
    <div className={css.detailGrid}>
      <div className={css.detailMain}>
        <section className={css.detailSection}><div className={css.sectionHeading}><h2>当前重点</h2><span>样本 identity · 只读</span></div>
          <div className={css.workSummary}><div className={css.workSummaryText}><span className={css.workStatus}><span className={css.waitingDot} />{project.sampleIdentity}</span><strong>{context.work.value.jobCount} 个关联 Job · 最新记录 {mostRecentJob?.status ?? '无记录'}</strong><span>{context.assets.value.candidates.length} 个 P5 候选；正式选中项 {context.assets.value.selectedAsset === null ? '无' : '存在'}，自动选择 {context.assets.value.automaticSelection ? '开启' : '关闭'}。</span></div><button className={css.textAction} type="button" onClick={openWork}>打开对应 Work ↗</button></div>
          <div className={css.statusSummary} aria-label="真实 Job 状态汇总">{Object.entries(statusCounts).map(([status, count]) => <span key={status}>{status}<strong>{count}</strong></span>)}</div>
        </section>
        <section className={css.detailSection}><div className={css.sectionHeading}><h2>Review 与 Validation</h2><span>只读 Artifact 投影</span></div>
          {context.reviews.value.length + context.validations.value.length === 0
            ? <p className={css.emptyLine}>当前来源没有可展示的 Review / Validation 记录。</p>
            : <div className={css.artifactList}>
              {context.reviews.value.map(item => <div className={css.artifactRow} key={item.artifactId}><span className={css.artifactGlyph}>R</span><div className={css.artifactName}><span className={css.artifactResult}><span>Review</span><strong>{item.reviewResult || '结果字段缺失'}</strong></span><span className={css.artifactMeta}>Job <code title={item.sourceJobId}>{shortIdentifier(item.sourceJobId)}</code> · Artifact <code title={item.sourceArtifactId}>{shortIdentifier(item.sourceArtifactId)}</code></span><TechnicalDetails items={[['Artifact ID', item.artifactId], ['Source Job ID', item.sourceJobId], ['Source Artifact ID', item.sourceArtifactId]]} /></div><code className={css.shortArtifactId} title={item.artifactId}>{shortIdentifier(item.artifactId)}</code></div>)}
              {context.validations.value.map(item => <div className={css.artifactRow} key={item.artifactId}><span className={css.artifactGlyph}>V</span><div className={css.artifactName}><span className={css.artifactResult}><span>Validation</span><strong>{item.result || '结果字段缺失'}</strong></span><span className={css.artifactMeta}>Job <code title={item.sourceJobId}>{shortIdentifier(item.sourceJobId)}</code></span><TechnicalDetails items={[['Artifact ID', item.artifactId], ['Source Job ID', item.sourceJobId]]} /></div><code className={css.shortArtifactId} title={item.artifactId}>{shortIdentifier(item.artifactId)}</code></div>)}
            </div>}
        </section>
        <section className={css.detailSection}><div className={css.sectionHeading}><h2>真实产物与素材上下文</h2><span>来自既有 Job / Cover 记录</span></div>
          <div className={css.artifactList}>{context.jobs.value.flatMap(job => job.artifacts.map(artifact => ({ jobId: job.id, ...artifact }))).map(artifact => <div className={css.artifactRow} key={artifact.id}><span className={css.artifactGlyph}>▤</span><div className={css.artifactName}><span>{artifact.type} Artifact</span><span className={css.artifactMeta}>Job <code title={artifact.jobId}>{shortIdentifier(artifact.jobId)}</code> · SHA-256 <code title={artifact.sha256}>{artifact.sha256.slice(0, 12)}…</code></span><TechnicalDetails items={[['Artifact ID', artifact.id], ['Job ID', artifact.jobId], ['SHA-256', artifact.sha256]]} /></div><code className={css.shortArtifactId} title={artifact.id}>{shortIdentifier(artifact.id)}</code></div>)}
            <div className={css.artifactRow}><span className={css.artifactGlyph}>▤</span><span className={css.artifactName}>Swiss Baseline<small>{context.cover.value.baselineStatus} · {context.cover.value.baselineImmutable ? 'immutable' : 'mutable'}</small></span><span className={css.arrow}>{context.cover.value.pages.length} pages</span></div>
            <div className={css.artifactRow}><span className={css.artifactGlyph}>▤</span><span className={css.artifactName}>Framework render manifest<small>{context.renderer.value.width} × {context.renderer.value.height} · framework only</small></span><span className={css.arrow}>{context.renderer.value.pagesPassed}/{context.renderer.value.pagesTotal} {context.renderer.value.status}</span></div>
            <div className={css.artifactRow}><span className={css.artifactGlyph}>▤</span><span className={css.artifactName}>P5 material slot<small>{context.assets.value.status} · {context.cover.value.p5State}</small></span><span className={css.arrow}>{context.assets.value.candidates.length} candidates</span></div>
          </div>
        </section>
        <section className={css.detailSection}><div className={css.sectionHeading}><h2>项目资料与上下文</h2><span>来源校验信息</span></div><div className={css.sourceSummary}><span>任务卡 · SHA-256 <code title={context.source.value.taskCardSha256}>{context.source.value.taskCardSha256.slice(0, 12)}…</code></span><span>正文 · SHA-256 <code title={context.source.value.noteSha256}>{context.source.value.noteSha256.slice(0, 12)}…</code></span></div><TechnicalDetails items={[
          ['Task card path', context.source.value.taskCardPath], ['Task card SHA-256', context.source.value.taskCardSha256],
          ['Note path', context.source.value.notePath], ['Note SHA-256', context.source.value.noteSha256],
          ['Configured source root', context.project.value.sourceRoot],
        ]} />
        </section>
      </div>
      <aside className={css.detailAside}><section className={css.asideSection}><div className={css.asideHeading}><h2>Project Context</h2><span>只读投影</span></div><p className={css.contextProject}>{project.projectName} <code>{project.projectKey}</code></p><p className={css.contextIdentity}>{project.account} · {project.period} · {project.week} · {project.note}</p><p className={css.contextNote}>Project ID 尚未建立。</p></section>
        <section className={css.asideSection}><div className={css.asideHeading}><h2>Workspace</h2><span className={css.unboundTag}>未绑定</span></div><p className={css.contextNote}>当前 Project 与 Harness Workspace 尚无正式绑定关系。</p></section>
        <section className={css.asideSection}><div className={css.asideHeading}><h2>继续处理</h2></div><button className={css.contextAction} type="button" onClick={openWork}>打开 Work Detail <span>↗</span></button><button className={css.contextAction} type="button" onClick={() => { openStudio('image-studio') }}>打开 Image Studio <span>↗</span></button><button className={css.contextAction} type="button" onClick={() => { openStudio('cover-studio') }}>打开 Cover Studio <span>↗</span></button></section></aside>
    </div>
  </div>
}

function TechnicalDetails({ items }: { items: readonly (readonly [label: string, value: string])[] }) {
  return <details className={css.technicalDetails}><summary>查看完整技术信息</summary><dl>{items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd><code title={value}>{value}</code></dd></div>)}</dl></details>
}

function shortIdentifier(value: string): string {
  return value.length <= 20 ? value : `${value.slice(0, 10)}…${value.slice(-6)}`
}

/** Render the scoped placeholder for a workspace not implemented in this phase. */
export function WorkspaceComingSoon({ workspace }: { workspace: Exclude<WorkspaceIdentityId, 'command' | 'projects'> }) {
  const title = ({ work: 'Work', studios: 'Studios', radar: 'Radar' } as const)[workspace]
  const description = ({
    work: 'Work 生命周期中心将在后续阶段接入。',
    studios: '专业创作工作区将在后续阶段接入。',
    radar: '外部信号与 Evidence 工作区将在后续阶段接入。',
  } as const)[workspace]

  return (
    <main className={css.root} aria-label={title}>
      <div className={css.placeholder}>
        <span className={css.eyebrow}>BUSINESS WORKSPACE</span>
        <h1>{title}</h1>
        <p>{description}</p>
        <span className={css.placeholderTag}>本阶段尚未开放</span>
      </div>
    </main>
  )
}

export function ProjectList({ onOpen }: { onOpen: (projectId: string) => void }) {
  const [featured, ...otherProjects] = PROJECT_FIXTURES
  if (featured === undefined) return null

  return (
    <>
      <header className={css.pageHeader}>
        <div>
          <span className={css.eyebrow}>BUSINESS WORKSPACE</span>
          <h1>Projects</h1>
          <p>你的长期业务与 AI 工作上下文</p>
        </div>
      </header>

      <section className={css.focusSection} aria-labelledby="projects-focus-heading">
        <div className={css.sectionHeading}>
          <h2 id="projects-focus-heading">最近在推进</h2>
          <span>1 个 Work 等待处理</span>
        </div>
        <button className={css.featuredProject} type="button" onClick={() => { onOpen(featured.project_id) }}>
          <span className={css.featuredTopline}>
            <span className={css.projectMark} aria-hidden="true">小</span>
            <span className={css.stagePill}>{featured.stage}</span>
            <span className={css.arrow} aria-hidden="true">↗</span>
          </span>
          <span className={css.featuredName}>{featured.name}</span>
          <span className={css.featuredGoal}>{featured.goal}</span>
          {featured.active_work !== null && (
            <span className={css.activeWork}>
              <span className={css.activeWorkDot} />
              <span className={css.activeWorkText}>{featured.active_work.title}</span>
              <span className={css.activeWorkStatus}>{featured.active_work.status}</span>
            </span>
          )}
        </button>
      </section>

      <section className={css.projectsSection} aria-labelledby="projects-all-heading">
        <div className={css.sectionHeading}>
          <h2 id="projects-all-heading">全部项目</h2>
          <span>{PROJECT_FIXTURES.length} 个长期项目</span>
        </div>
        <div className={css.projectList}>
          {otherProjects.map(project => <ProjectRow key={project.project_id} project={project} onOpen={onOpen} />)}
        </div>
      </section>
      <p className={css.fixtureNote}>示例项目数据 · 尚未连接正式 Project Registry</p>
    </>
  )
}

function ProjectRow({ project, onOpen }: { project: ProjectFixture; onOpen: (projectId: string) => void }) {
  return (
    <button className={css.projectRow} type="button" onClick={() => { onOpen(project.project_id) }}>
      <span className={css.projectMark} aria-hidden="true">{project.name.slice(0, 1)}</span>
      <span className={css.projectRowMain}>
        <span className={css.projectRowName}>{project.name}</span>
        <span className={css.projectRowGoal}>{project.goal}</span>
      </span>
      <span className={css.projectRowStage}>{project.stage}</span>
      <span className={css.projectRowActivity}>{project.recent_activity[0]?.time ?? '暂无活动'}</span>
      <span className={css.arrow} aria-hidden="true">↗</span>
    </button>
  )
}

function ProjectDetail({ project, onBack }: { project: ProjectFixture; onBack: () => void }) {
  return (
    <div className={css.detailPage}>
      <button className={css.backButton} type="button" onClick={onBack}>← <span>返回 Projects</span></button>
      <header className={css.detailHeader}>
        <div className={css.detailTitleLine}>
          <span className={css.projectMarkLarge} aria-hidden="true">{project.name.slice(0, 1)}</span>
          <div>
            <span className={css.eyebrow}>PROJECT</span>
            <h1>{project.name}</h1>
          </div>
        </div>
        <p>{project.goal}</p>
        <span className={css.stagePill}>{project.stage}</span>
      </header>

      <div className={css.detailGrid}>
        <div className={css.detailMain}>
          <section className={css.detailSection} aria-labelledby="project-current-focus">
            <div className={css.sectionHeading}><h2 id="project-current-focus">Current Focus</h2><span>当前重点</span></div>
            {project.active_work === null
              ? <p className={css.emptyLine}>当前没有进行中的 Work。</p>
              : <div className={css.workSummary}>
                <div className={css.workSummaryText}>
                  <span className={css.workStatus}><span className={css.waitingDot} />{project.active_work.status}</span>
                  <strong>{project.active_work.title}</strong>
                  <span>最近更新 · {project.active_work.updated_at}</span>
                </div>
                <span className={css.arrow} aria-hidden="true">↗</span>
              </div>}
          </section>

          <section className={css.detailSection} aria-labelledby="project-artifacts">
            <div className={css.sectionHeading}><h2 id="project-artifacts">Artifacts</h2><span>项目正式产物</span></div>
            {project.artifacts.length === 0
              ? <p className={css.emptyLine}>正式产物将在项目生产后显示。</p>
              : <div className={css.artifactList}>{project.artifacts.map(artifact => (
                <div className={css.artifactRow} key={artifact.title}>
                  <span className={css.artifactGlyph} aria-hidden="true">▤</span>
                  <span className={css.artifactName}>{artifact.title}<small>{artifact.kind}</small></span>
                  <time>{artifact.updated_at}</time>
                  <span className={css.arrow} aria-hidden="true">↗</span>
                </div>
              ))}</div>}
          </section>

          <section className={css.detailSection} aria-labelledby="project-activity">
            <div className={css.sectionHeading}><h2 id="project-activity">Recent Activity</h2><span>最近活动</span></div>
            <ol className={css.activityList}>{project.recent_activity.map(activity => (
              <li key={`${activity.time}-${activity.title}`}>
                <span className={css.activityDot} />
                <span>{activity.title}</span>
                <time>{activity.time}</time>
              </li>
            ))}</ol>
          </section>
        </div>

        <aside className={css.detailAside}>
          <section className={css.asideSection} aria-labelledby="project-truth">
            <div className={css.asideHeading}><h2 id="project-truth">Business Truth</h2><span>正式规则入口</span></div>
            <span className={css.ruleLink} aria-disabled="true"><span>内容生产与审核规则</span><span>示例入口</span></span>
            <span className={css.ruleLink} aria-disabled="true"><span>封面系统基准</span><span>示例入口</span></span>
            <span className={css.ruleLink} aria-disabled="true"><span>产品模块与承接</span><span>示例入口</span></span>
          </section>
          <section className={css.asideSection} aria-labelledby="project-workspace">
            <div className={css.asideHeading}><h2 id="project-workspace">Workspace Binding</h2><span>运行目录</span></div>
            <div className={css.bindingBox}>
              <span className={css.bindingLabel}>PROJECT</span>
              <strong>{project.name}</strong>
              <span className={css.bindingDivider} />
              <span className={css.bindingLabel}>HARNESS WORKSPACE</span>
              <strong>{project.workspace_binding.name}</strong>
              <code>{project.workspace_binding.path}</code>
              <span className={css.fixtureBadge}>示例绑定 · 非实时连接</span>
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}
