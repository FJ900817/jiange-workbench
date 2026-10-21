import { useEffect, useState } from 'react'
import { selectWorkspaceIdentity } from '@deepseek-ai/dsh-client-ui-primitives'
import type { XhsRealContext } from '@deepseek-ai/dsh-business-workbench/types'
import { consumeProjectContextNavigation, requestProjectContextNavigation, useProjectContextNavigation } from './project-context-navigation.ts'
import { useXhsRealContext } from './xhs-real-context-store.ts'
import css from './WorkSurface.module.css'

const JOB_STATUS_LABEL: Readonly<Record<string, string>> = {
  draft: '草稿', ready: '待启动', running: '正在执行', interrupted: '已中断',
  completed: '已完成', failed: '失败', cancelled: '已取消',
}

const ATTEMPT_STATUS_LABEL: Readonly<Record<string, string>> = {
  pending: '等待执行', running: '正在执行', interrupted: '已中断',
  completed: '已完成', failed: '失败', cancelled: '已取消',
}

const ARTIFACT_TYPE_LABEL: Readonly<Record<string, string>> = {
  input: '输入', intermediate: '过程产物', validation: 'Validation', review: 'Review', final: '正式结果',
}

/** Render the real read-only XHS Work aggregate and its detail route. */
export function WorkSurface() {
  const [detailOpen, setDetailOpen] = useState(false)
  const projectNavigation = useProjectContextNavigation()
  const realContext = useXhsRealContext()

  useEffect(() => {
    if (projectNavigation?.destination !== 'work-detail') return
    setDetailOpen(true)
    consumeProjectContextNavigation('work-detail')
  }, [projectNavigation])

  if (realContext.status === 'loading') return <main className={css.root} aria-label="Work"><div className={css.container}><h1>Work</h1><p>正在读取账号 2 Swiss 真实样本…</p></div></main>
  if (realContext.status === 'unavailable') return <main className={css.root} aria-label="Work"><div className={css.container}><h1>Work</h1><p>真实样本当前不可读取；本页不会用示例工作替代。</p></div></main>

  return <main className={css.root} aria-label="Work"><div className={css.container}>
    {detailOpen
      ? <RealXhsWorkDetail context={realContext.context} onBack={() => { setDetailOpen(false) }} />
      : <RealXhsWorkHome context={realContext.context} onOpen={() => { setDetailOpen(true) }} />}
  </div></main>
}

function RealXhsWorkHome({ context, onOpen }: { context: XhsRealContext; onOpen: () => void }) {
  const jobs = context.jobs.value
  const statusCounts = countBy(jobs, job => job.status)
  const completedJobs = jobs.filter(job => job.status === 'completed')
  const completedArtifacts = completedJobs.flatMap(job => job.artifacts)
  const latest = [...jobs].sort((left, right) => right.updatedAt - left.updatedAt)[0]
  const attention = attentionSignals(context)
  const runningCount = statusCounts.running ?? 0

  return <>
    <header className={css.pageHeader}>
      <div><h1>Work</h1><p>正在推进的真实工作</p></div>
      <span className={css.readOnlyBadge}>只读聚合 · 1 条真实样本</span>
    </header>

    <div className={css.sections}>
      <section className={css.section} aria-labelledby="work-needs-attention">
        <div className={css.sectionHeading}><h2 id="work-needs-attention">需要关注</h2><span>{attention.length ? `${attention.length} 类真实信号` : '暂无'}</span></div>
        {attention.length === 0
          ? <p className={css.empty}>当前样本没有需要关注的真实状态。</p>
          : <div className={css.attentionPanel}>
            <div className={css.attentionSignals}>{attention.map(signal => <span key={signal}>{signal}</span>)}</div>
            <button className={css.textAction} type="button" onClick={onOpen}>查看这项 Work <span aria-hidden="true">↗</span></button>
          </div>}
      </section>

      <section className={css.section} aria-labelledby="work-in-progress">
        <div className={css.sectionHeading}><h2 id="work-in-progress">正在执行</h2><span>{runningCount ? `${runningCount} 个 Job` : '0 个 Job'}</span></div>
        {runningCount === 0
          ? <p className={css.empty}>暂无正在执行的工作</p>
          : <button className={css.workRow} type="button" onClick={onOpen}>
            <span className={`${css.rowMarker} ${css.marker_running}`} aria-hidden="true" />
            <span className={css.rowMain}><strong>Swiss 封面框架与 P5 素材审核</strong><span className={css.rowStep}>{runningCount} 个 Job 正在执行；聚合整体状态仍以各 Job 原始记录为准</span></span>
            <span className={css.rowAction}>查看 ↗</span>
          </button>}
      </section>

      <section className={css.section} aria-labelledby="work-recent">
        <div className={css.sectionHeading}><h2 id="work-recent">最近工作</h2><span>{jobs.length} 个关联 Job</span></div>
        <div className={css.itemList}>
          <button className={css.workRow} type="button" onClick={onOpen}>
            <span className={`${css.rowMarker} ${attention.length ? css.marker_attention : css.marker_neutral}`} aria-hidden="true" />
            <span className={css.rowMain}>
              <strong>Swiss 封面框架与 P5 素材审核</strong>
              <span className={css.rowStep}>{formatJobSummary(statusCounts)}<span className={css.separator}>·</span>{context.assets.value.candidates.length} 个 P5 候选等待人工判断</span>
              <span className={css.rowMeta}>小红书 <span className={css.separator}>·</span> {context.identity.replaceAll('/', ' · ')} <span className={css.separator}>·</span> {formatTimestamp(latest?.updatedAt)}</span>
            </span>
            <span className={css.rowAction}>查看 <span aria-hidden="true">↗</span></span>
          </button>
        </div>
        <p className={css.aggregateNote}>按任务 identity 聚合现有 Job；系统尚无独立 Work Registry。</p>
      </section>

      <section className={css.section} aria-labelledby="work-completed">
        <div className={css.sectionHeading}><h2 id="work-completed">已完成结果</h2><span>{completedJobs.length} 个 completed Job</span></div>
        {completedJobs.length === 0
          ? <p className={css.empty}>当前聚合没有 completed Job。</p>
          : <div className={css.completedSummary}>
            <strong>{completedJobs.length} 个 Job 已完成</strong>
            <span>{completedArtifacts.length} 个关联 Artifact 引用</span>
            <small>这是 Job 级结果汇总，不代表整个 Work 已完成。</small>
          </div>}
      </section>
    </div>
  </>
}

function RealXhsWorkDetail({ context, onBack }: { context: XhsRealContext; onBack: () => void }) {
  const jobs = [...context.jobs.value].sort((left, right) => left.createdAt - right.createdAt)
  const allArtifacts = jobs.flatMap(job => job.artifacts.map(artifact => ({ jobId: job.id, ...artifact })))
  const statusCounts = countBy(jobs, job => job.status)
  const openProject = () => {
    requestProjectContextNavigation('project-detail')
    selectWorkspaceIdentity('projects')
  }
  const openStudio = (destination: 'image-studio' | 'cover-studio') => {
    requestProjectContextNavigation(destination)
    selectWorkspaceIdentity('studios')
  }

  return <div className={css.detailPage}>
    <button className={css.backButton} type="button" onClick={onBack}>← <span>返回 Work</span></button>
    <header className={css.detailHeader}>
      <div><button type="button" className={css.projectLink} onClick={openProject}>小红书 · 账号 2 / note001 ↗</button><h1>Swiss 封面框架与 P5 素材审核</h1><p>真实只读聚合 · {jobs.length} 个关联 Job · identity {context.work.value.workKey}</p></div>
      <span className={css.detailStatus}><span className={`${css.statusDot} ${css.status_attention}`} />{context.assets.value.status === 'AWAITING_HUMAN_REVIEW' ? 'P5 候选素材待人工判断' : context.assets.value.status}</span>
    </header>

    <section className={css.currentState} aria-labelledby="work-current-state">
      <div className={css.currentStepTop}><span>当前业务状态</span><span className={css.stepSignal}>Asset Manifest · 只读</span></div>
      <h2 id="work-current-state">{context.assets.value.status === 'AWAITING_HUMAN_REVIEW' ? 'P5 候选素材待人工审核' : context.assets.value.status}</h2>
      <p>Manifest 状态：<code>{context.assets.value.status}</code>。当前有 {context.assets.value.candidates.length} 个候选，正式选中项为 {context.assets.value.selectedAsset === null ? '空' : '已记录'}，自动选择{context.assets.value.automaticSelection ? '开启' : '关闭'}。本页只读，不提供批准或写回操作。</p>
    </section>

    <div className={css.detailGrid}>
      <div className={css.detailMain}>
        <section className={css.detailSection} aria-labelledby="work-job-timeline">
          <div className={css.sectionHeading}><h2 id="work-job-timeline">Job 执行记录</h2><span>{formatJobSummary(statusCounts)}</span></div>
          <ol className={css.jobTimeline}>
            {jobs.map(job => <li key={job.id} className={css.jobRow}>
              <span className={`${css.jobStatusMark} ${statusClass(job.status)}`} aria-hidden="true" />
              <div className={css.jobMain}>
                <div className={css.jobTitleLine}><strong>{JOB_STATUS_LABEL[job.status] ?? job.status}</strong><code title={job.id}>{shortIdentifier(job.id)}</code></div>
                <span className={css.jobMeta}>{job.attempts.length} 次 Attempt <span className={css.separator}>·</span>{job.attempts.map(attempt => ATTEMPT_STATUS_LABEL[attempt.status] ?? attempt.status).join('、') || '无 Attempt 记录'}</span>
                <TechnicalDetails items={[
                  ['Job ID', job.id],
                  ...job.attempts.flatMap((attempt, index) => [[`Attempt ${index + 1} ID`, attempt.id], [`Attempt ${index + 1} status`, attempt.status]] as const),
                ]} />
              </div>
              <time>{formatTimestamp(job.updatedAt)}</time>
            </li>)}
          </ol>
        </section>

        <section className={css.detailSection} aria-labelledby="work-review-validation">
          <div className={css.sectionHeading}><h2 id="work-review-validation">Review 与 Validation</h2><span>保留原始结果与来源关系</span></div>
          <div className={css.evidenceList}>
            {context.reviews.value.map(item => <EvidenceRow key={`review-${item.artifactId}`} kind="Review" result={item.reviewResult || '结果字段缺失'} artifactId={item.artifactId} jobId={item.sourceJobId} relatedId={item.sourceArtifactId} relatedLabel="Source Artifact ID" />)}
            {context.validations.value.map(item => <EvidenceRow key={`validation-${item.artifactId}`} kind="Validation" result={item.result || '结果字段缺失'} artifactId={item.artifactId} jobId={item.sourceJobId} />)}
            {context.reviews.value.length + context.validations.value.length === 0 && <p className={css.empty}>当前来源没有可展示的 Review / Validation 记录。</p>}
          </div>
        </section>

        <section className={css.detailSection} aria-labelledby="work-artifacts">
          <div className={css.sectionHeading}><h2 id="work-artifacts">关联产物</h2><span>{allArtifacts.length} 个真实 Artifact 引用</span></div>
          <div className={css.evidenceList}>
            {allArtifacts.map(artifact => <ArtifactRow key={artifact.id} artifact={artifact} />)}
            {allArtifacts.length === 0 && <p className={css.empty}>当前 Job 没有关联 Artifact。</p>}
          </div>
          <p className={css.sourceNote}>显示 Job 已关联的 Artifact metadata；P5 候选素材状态单独来自 Asset Manifest。</p>
        </section>
      </div>

      <aside className={css.detailAside}>
        <section className={css.asideSection}>
          <div className={css.asideHeading}><h2>Project Context</h2><span>只读投影</span></div>
          <strong className={css.projectName}>{context.project.value.displayName} <code>{context.project.value.category}</code></strong>
          <p className={css.contextIdentity}>{context.identity.replaceAll('/', ' · ')}</p>
          <span className={css.contextNote}>Project ID 尚未建立</span>
          <button type="button" className={css.textAction} onClick={openProject}>返回 Project Workspace ↗</button>
        </section>
        <section className={css.asideSection}>
          <div className={css.asideHeading}><h2>下一步</h2><span>只读入口</span></div>
          <button type="button" className={css.contextAction} onClick={() => { openStudio('image-studio') }}>查看候选素材 · Image Studio <span>↗</span></button>
          <button type="button" className={css.contextAction} onClick={() => { openStudio('cover-studio') }}>查看封面框架 · Cover Studio <span>↗</span></button>
          <small className={css.noWriteNote}>尚未提供批准写回；不会修改 selectedAsset。</small>
        </section>
        <section className={css.asideSection}>
          <div className={css.asideHeading}><h2>封面上下文</h2><span>{context.cover.value.family}</span></div>
          <dl className={css.contextFacts}>
            <div><dt>Route</dt><dd>{context.cover.value.route}</dd></div>
            <div><dt>Baseline</dt><dd>{context.cover.value.baselineStatus}</dd></div>
            <div><dt>P5</dt><dd>{context.assets.value.page} · {context.cover.value.p5State}</dd></div>
            <div><dt>候选</dt><dd>{context.assets.value.candidates.length} · 未批准</dd></div>
          </dl>
        </section>
      </aside>
    </div>
    <p className={css.detailFixtureNote}>只读 Runtime 投影 · Job / Review / Validation / Artifact 未写入</p>
  </div>
}

function EvidenceRow({ kind, result, artifactId, jobId, relatedId, relatedLabel }: {
  readonly kind: 'Review' | 'Validation'
  readonly result: string
  readonly artifactId: string
  readonly jobId: string
  readonly relatedId?: string
  readonly relatedLabel?: string
}) {
  const items: Array<readonly [string, string]> = [['Artifact ID', artifactId], ['Source Job ID', jobId]]
  if (relatedId !== undefined) items.push([relatedLabel ?? 'Related ID', relatedId])
  return <article className={css.evidenceRow}>
    <span className={css.evidenceKind}>{kind === 'Review' ? 'R' : 'V'}</span>
    <div className={css.evidenceMain}>
      <span className={css.evidenceResult}><strong>{kind}</strong><b className={resultClass(result)}>{result}</b></span>
      <span className={css.evidenceMeta}>Job <code title={jobId}>{shortIdentifier(jobId)}</code>{relatedId !== undefined && <> · Artifact <code title={relatedId}>{shortIdentifier(relatedId)}</code></>}</span>
      <TechnicalDetails items={items} />
    </div>
    <code className={css.shortArtifactId} title={artifactId}>{shortIdentifier(artifactId)}</code>
  </article>
}

function ArtifactRow({ artifact }: { artifact: { readonly id: string; readonly type: string; readonly sha256: string; readonly jobId: string } }) {
  return <article className={css.evidenceRow}>
    <span className={css.evidenceKind}>A</span>
    <div className={css.evidenceMain}>
      <span className={css.evidenceResult}><strong>{ARTIFACT_TYPE_LABEL[artifact.type] ?? artifact.type} Artifact</strong><span>只读引用</span></span>
      <span className={css.evidenceMeta}>Artifact <code title={artifact.id}>{shortIdentifier(artifact.id)}</code> · SHA-256 <code title={artifact.sha256}>{artifact.sha256.slice(0, 12)}…</code></span>
      <TechnicalDetails items={[
        ['Artifact ID', artifact.id], ['Source Job ID', artifact.jobId], ['SHA-256', artifact.sha256],
      ]} />
    </div>
  </article>
}

function TechnicalDetails({ items }: { readonly items: readonly (readonly [label: string, value: string])[] }) {
  return <details className={css.technicalDetails}><summary>查看完整技术信息</summary><dl>{items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd><code title={value}>{value}</code></dd></div>)}</dl></details>
}

function attentionSignals(context: XhsRealContext): string[] {
  const signals: string[] = []
  const counts = countBy(context.jobs.value, job => job.status)
  if ((counts.failed ?? 0) > 0) signals.push(`Job 失败 ${counts.failed}`)
  if ((counts.interrupted ?? 0) > 0) signals.push(`Job 中断 ${counts.interrupted}`)
  const modifyReviews = context.reviews.value.filter(item => item.reviewResult === 'MODIFY').length
  const failedReviews = context.reviews.value.filter(item => item.reviewResult === 'FAIL').length
  const failedValidations = context.validations.value.filter(item => item.result === 'FAIL').length
  if (modifyReviews > 0) signals.push(`Review MODIFY ${modifyReviews}`)
  if (failedReviews > 0) signals.push(`Review FAIL ${failedReviews}`)
  if (failedValidations > 0) signals.push(`Validation FAIL ${failedValidations}`)
  if (context.assets.value.status === 'AWAITING_HUMAN_REVIEW') signals.push(`P5 候选待人工判断 ${context.assets.value.candidates.length}`)
  return signals
}

function countBy<T>(items: readonly T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const item of items) counts[key(item)] = (counts[key(item)] ?? 0) + 1
  return counts
}

function formatJobSummary(counts: Readonly<Record<string, number>>): string {
  return ['completed', 'interrupted', 'failed', 'running', 'draft', 'ready', 'cancelled']
    .filter(status => (counts[status] ?? 0) > 0)
    .map(status => `${JOB_STATUS_LABEL[status] ?? status} ${counts[status]}`)
    .join(' · ') || '暂无关联 Job'
}

function statusClass(status: string): string {
  if (status === 'failed') return css.status_failed!
  if (status === 'interrupted' || status === 'cancelled') return css.status_interrupted!
  if (status === 'running') return css.status_running!
  if (status === 'completed') return css.status_completed!
  return css.status_other!
}

function resultClass(result: string): string {
  if (result === 'FAIL') return css.result_failed!
  if (result === 'MODIFY') return css.result_modify!
  if (result === 'PASS') return css.result_passed!
  return ''
}

function shortIdentifier(value: string): string {
  return value.length <= 20 ? value : `${value.slice(0, 10)}…${value.slice(-6)}`
}

function formatTimestamp(value: number | undefined): string {
  if (value === undefined) return '时间未知'
  return new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}
