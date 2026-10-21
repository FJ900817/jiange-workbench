import { useEffect, useState } from 'react'
import { selectWorkspaceIdentity } from '@deepseek-ai/dsh-client-ui-primitives'
import type { XhsRealContext } from '@deepseek-ai/dsh-business-workbench/types'
import { consumeProjectContextNavigation, requestProjectContextNavigation, useProjectContextNavigation } from './project-context-navigation.ts'
import { useXhsRealContext } from './xhs-real-context-store.ts'
import { MediaCreationStudio } from './MediaCreationStudio.tsx'
import type { ConversationInjected } from '../contract/slots.ts'
import css from './StudiosSurface.module.css'

type StudioPage = 'home' | 'image' | 'cover'

const WORK_LABEL = 'Swiss 封面框架与 P5 素材审核'

/** Render the real, read-only Studios routes for the active XHS sample. */
export function StudiosSurface({ mediaStudio }: { readonly mediaStudio?: ConversationInjected['mediaStudio'] } = {}) {
  const [creationModality, setCreationModality] = useState<'image' | 'video' | null>(null)
  const realContext = useXhsRealContext()
  if (creationModality !== null) {
    if (mediaStudio === undefined) return <SurfaceNotice text="Host 媒体创作入口尚不可用。" />
    return <MediaCreationStudio modality={creationModality} bridge={mediaStudio} onBack={() => { setCreationModality(null) }} />
  }
  if (realContext.status === 'loading') return <SurfaceNotice text="正在读取账号 2 Swiss 真实样本…" mediaStudio={mediaStudio} onOpenImageCreation={() => { setCreationModality('image') }} onOpenVideoCreation={() => { setCreationModality('video') }} />
  if (realContext.status === 'unavailable') return <SurfaceNotice text="真实样本当前不可读取；不会用候选 Fixture 替代。" mediaStudio={mediaStudio} onOpenImageCreation={() => { setCreationModality('image') }} onOpenVideoCreation={() => { setCreationModality('video') }} />
  return <RealStudiosSurface context={realContext.context} mediaStudioAvailable={mediaStudio !== undefined} onOpenImageCreation={() => { setCreationModality('image') }} onOpenVideoCreation={() => { setCreationModality('video') }} />
}

function SurfaceNotice({ text, mediaStudio, onOpenImageCreation, onOpenVideoCreation }: {
  readonly text: string
  readonly mediaStudio?: ConversationInjected['mediaStudio']
  readonly onOpenImageCreation?: () => void
  readonly onOpenVideoCreation?: () => void
}) {
  return <main className={css.root} aria-label="Studios"><div className={css.studioContainer}><h1>Studios</h1><p>{text}</p>
    {mediaStudio !== undefined && onOpenImageCreation !== undefined && onOpenVideoCreation !== undefined && <section className={css.mediaMockSection} aria-labelledby="studios-media-heading"><div className={css.sectionHeading}><h2 id="studios-media-heading">独立媒体创作 · Mock</h2><span>不依赖 XHS 样本</span></div><div className={css.mediaMockActions}><button type="button" onClick={onOpenImageCreation}><strong>Image Studio</strong><span>连续创作 · 多作品 · 版本关联</span><b>打开图像创作 ↗</b></button><button type="button" onClick={onOpenVideoCreation}><strong>Video Studio</strong><span>异步任务 · 状态恢复 · 历史版本</span><b>打开视频创作 ↗</b></button></div></section>}
  </div></main>
}

function RealStudiosSurface({ context, mediaStudioAvailable, onOpenImageCreation, onOpenVideoCreation }: { readonly context: XhsRealContext; readonly mediaStudioAvailable: boolean; readonly onOpenImageCreation: () => void; readonly onOpenVideoCreation: () => void }) {
  const [page, setPage] = useState<StudioPage>('home')
  const [selectedCandidate, setSelectedCandidate] = useState<string | undefined>(context.assets.value.candidates[0]?.sha256)
  const [selectedPage, setSelectedPage] = useState(context.assets.value.page)
  const projectNavigation = useProjectContextNavigation()
  const candidate = context.assets.value.candidates.find(item => item.sha256 === selectedCandidate)
  const openProject = () => {
    requestProjectContextNavigation('project-detail')
    selectWorkspaceIdentity('projects')
  }
  const openWork = () => {
    requestProjectContextNavigation('work-detail')
    selectWorkspaceIdentity('work')
  }

  useEffect(() => {
    if (projectNavigation?.destination === 'image-studio') {
      setPage('image')
      consumeProjectContextNavigation('image-studio')
    } else if (projectNavigation?.destination === 'cover-studio') {
      setPage('cover')
      consumeProjectContextNavigation('cover-studio')
    }
  }, [projectNavigation])

  if (page === 'home') return <StudiosHome context={context} mediaStudioAvailable={mediaStudioAvailable} onOpenImage={() => { setPage('image') }} onOpenCover={() => { setPage('cover') }} onOpenImageCreation={onOpenImageCreation} onOpenVideoCreation={onOpenVideoCreation} />
  if (page === 'image') return <ImageStudio context={context} selectedCandidate={candidate} selectedCandidateId={selectedCandidate} onSelect={setSelectedCandidate} onOpenProject={openProject} onOpenWork={openWork} onOpenCover={() => { setPage('cover') }} />
  return <CoverStudio context={context} selectedPage={selectedPage} onSelectPage={setSelectedPage} onOpenProject={openProject} onOpenWork={openWork} onOpenImage={() => { setPage('image') }} />
}

function StudiosHome({ context, mediaStudioAvailable, onOpenImage, onOpenCover, onOpenImageCreation, onOpenVideoCreation }: {
  readonly context: XhsRealContext
  readonly mediaStudioAvailable: boolean
  readonly onOpenImage: () => void
  readonly onOpenCover: () => void
  readonly onOpenImageCreation: () => void
  readonly onOpenVideoCreation: () => void
}) {
  const contextLabel = `${context.identity.replaceAll('/', ' · ')} · ${context.cover.value.family}`
  return <main className={css.root} aria-label="Studios"><div className={css.container}>
    <header className={css.pageHeader}><div><span className={css.eyebrow}>专业生产空间 · 真实只读上下文</span><h1>Studios</h1><p>为当前业务工作选择专业生产能力。</p></div></header>
    <section className={css.projectContext} aria-label="当前 Project 与 Work 上下文">
      <span className={css.contextLabel}>当前上下文</span><strong>{context.project.value.displayName}</strong><span className={css.contextDivider}>/</span><span>{WORK_LABEL}</span><span className={css.contextMeta}>{contextLabel}</span>
    </section>
    <section className={css.studioList} aria-labelledby="studios-available-heading">
      <div className={css.sectionHeading}><h2 id="studios-available-heading">可用 Studios</h2><span>沿用当前样本</span></div>
      <button type="button" className={css.featuredStudio} onClick={onOpenImage}>
        <span className={css.featuredVisual}><RealCandidateThumbnail candidate={context.assets.value.candidates[0]} /></span>
        <span className={css.studioCopy}><span className={css.studioType}>P5 · {context.assets.value.candidates.length} 个真实候选 · {context.assets.value.status}</span><strong>Image Studio</strong><span>查看 Swiss 封面素材与现有候选，不生成或审批。</span><span className={css.studioAction}>继续查看候选 ↗</span></span>
      </button>
      <div className={css.secondaryStudios}>
        <button type="button" className={css.secondaryStudio} onClick={onOpenCover}><span className={`${css.studioGlyph} ${css.coverGlyph}`} aria-hidden="true">▧</span><span><strong>Cover Studio</strong><small>{context.cover.value.family} · {context.cover.value.baselineStatus} · {context.cover.value.pages[0]}–{context.cover.value.pages.at(-1)}</small></span><span className={css.rowArrow} aria-hidden="true">↗</span></button>
      </div>
    </section>
    {mediaStudioAvailable && <section className={css.mediaMockSection} aria-labelledby="studios-media-heading"><div className={css.sectionHeading}><h2 id="studios-media-heading">媒体创作 · Mock</h2><span>任务与历史写入 Host 工程存储</span></div><div className={css.mediaMockActions}><button type="button" onClick={onOpenImageCreation}><strong>Image Studio</strong><span>连续创作 · 多作品 · 版本关联</span><b>打开图像创作 ↗</b></button><button type="button" onClick={onOpenVideoCreation}><strong>Video Studio</strong><span>异步任务 · 状态恢复 · 历史版本</span><b>打开视频创作 ↗</b></button></div></section>}
    <section className={css.futureStudios} aria-labelledby="studios-future-heading"><div className={css.sectionHeading}><h2 id="studios-future-heading">后续空间</h2><span>尚不可用</span></div><div className={css.futureStudioList}>{['Avatar Studio', 'Voice Studio'].map(name => <div className={css.futureStudioRow} key={name}><span>{name}</span><span>Coming later</span></div>)}</div></section>
  </div></main>
}

function ImageStudio({ context, selectedCandidate, selectedCandidateId, onSelect, onOpenProject, onOpenWork, onOpenCover }: {
  readonly context: XhsRealContext
  readonly selectedCandidate: XhsRealContext['assets']['value']['candidates'][number] | undefined
  readonly selectedCandidateId: string | undefined
  readonly onSelect: (id: string) => void
  readonly onOpenProject: () => void
  readonly onOpenWork: () => void
  readonly onOpenCover: () => void
}) {
  return <main className={`${css.root} ${css.studioRoot}`} aria-label="Image Studio"><div className={css.studioContainer}>
    <StudioHeader title="Image Studio" context={context} status="Swiss · P5 · 只读候选" />
    <div className={css.breadcrumb} aria-label="Image Studio 当前上下文"><span>{context.project.value.displayName}</span><span>/</span><span>{WORK_LABEL}</span><span>/</span><strong>{context.cover.value.family} · {context.assets.value.page}</strong><span className={css.breadcrumbTail}>{context.identity.replaceAll('/', ' · ')}</span></div>
    <div className={css.realStudioLayout}><section className={css.realCandidateMain}>
      <div className={css.canvasToolbar}><div><span className={css.canvasLabel}>当前素材槽</span><strong>{context.assets.value.page} <span>Hero Material · {context.cover.value.family}</span></strong></div><span className={css.assetStatus}><span className={css.statusDot} />{context.assets.value.status}</span></div>
      <div className={css.realCandidatePreview}>{selectedCandidate === undefined ? <p>当前来源没有可预览的候选文件。</p> : <><img src={selectedCandidate.dataUrl} alt={selectedCandidate.displayName} /><div><strong>{selectedCandidate.displayName}</strong><span>{selectedCandidate.provider} · {selectedCandidate.model}</span><code title={selectedCandidate.sha256}>SHA-256 {shortHash(selectedCandidate.sha256)}</code><span>{selectedCandidate.bytes.toLocaleString()} bytes · {selectedCandidate.status}</span></div></>}</div>
      <div className={css.sectionHeading}><h2>候选素材</h2><span>{context.assets.value.candidates.length} 个真实候选 · 均未批准</span></div>
      <div className={css.realCandidateGrid}>{context.assets.value.candidates.map((item, index) => <button type="button" key={item.sha256} className={item.sha256 === selectedCandidateId ? css.realCandidateActive : ''} aria-pressed={item.sha256 === selectedCandidateId} onClick={() => { onSelect(item.sha256) }}><img src={item.dataUrl} alt="" /><span><strong>{item.displayName || `候选 ${index + 1}`}</strong><small>{item.provider} · {item.model}</small><small title={item.sha256}>SHA {shortHash(item.sha256)}</small></span><span>候选 · 未批准</span></button>)}</div>
    </section><aside className={css.contextPanel} aria-label="Image Studio Manifest"><div className={css.sectionLabelRow}><h2>Asset Manifest</h2><span>真实只读</span></div><dl className={css.metadataList}><div><dt>状态</dt><dd>{context.assets.value.status}</dd></div><div><dt>正式素材</dt><dd>{context.assets.value.selectedAsset === null ? '尚未人工确认' : '已有选择记录'}</dd></div><div><dt>自动选择</dt><dd>{context.assets.value.automaticSelection ? '开启' : '关闭'}</dd></div><div><dt>当前槽</dt><dd>{context.assets.value.page} · {context.cover.value.p5State}</dd></div></dl><p className={css.realReadonlyNote}>当前有 {context.assets.value.candidates.length} 个候选素材，尚未人工确认正式素材。</p><p className={css.realReadonlyNote}>预览与选择仅改变当前页面焦点，不会批准、拒绝或写入 Asset Manifest。</p><StudioNavigation onOpenProject={onOpenProject} onOpenWork={onOpenWork} /><button type="button" className={css.textAction} onClick={onOpenCover}>继续到 Cover Studio ↗</button></aside></div>
  </div></main>
}

function CoverStudio({ context, selectedPage, onSelectPage, onOpenProject, onOpenWork, onOpenImage }: {
  readonly context: XhsRealContext
  readonly selectedPage: string
  readonly onSelectPage: (page: string) => void
  readonly onOpenProject: () => void
  readonly onOpenWork: () => void
  readonly onOpenImage: () => void
}) {
  return <main className={`${css.root} ${css.studioRoot}`} aria-label="Cover Studio"><div className={css.studioContainer}>
    <StudioHeader title="Cover Studio" context={context} status="Swiss · Baseline FROZEN" />
    <div className={css.breadcrumb} aria-label="Cover Studio 当前上下文"><span>{context.project.value.displayName}</span><span>/</span><span>{WORK_LABEL}</span><span>/</span><strong>{context.cover.value.route} · {context.cover.value.family}</strong><span className={css.breadcrumbTail}>{context.identity.replaceAll('/', ' · ')}</span></div>
    <div className={css.realCoverLayout}><section className={css.realCoverMain}>
      <div className={css.sectionHeading}><h2>当前框架</h2><span>{context.cover.value.family} · {context.cover.value.templateVersion}</span></div>
      <div className={css.realPageRail}>{context.cover.value.pages.map(page => <button type="button" key={page} aria-pressed={selectedPage === page} className={selectedPage === page ? css.realPageActive : ''} onClick={() => { onSelectPage(page) }}><strong>{page}</strong><small>{page === context.assets.value.page ? context.cover.value.p5State : '框架页面'}</small></button>)}</div>
      <div className={css.realPageCanvas}><span className={css.eyebrow}>{selectedPage} · {context.cover.value.family} framework</span><h2>{selectedPage === context.assets.value.page ? `${selectedPage} 仍为正式占位` : `${selectedPage} · 冻结框架页面`}</h2><p>{selectedPage === context.assets.value.page ? `当前槽位状态为 ${context.cover.value.p5State}。${context.assets.value.candidates.length} 个候选尚未批准或注入。` : '此页属于已冻结的 Swiss Baseline；当前视图不渲染页面 PNG。'}</p><span className={css.realPlaceholderBadge}>{selectedPage === context.assets.value.page ? context.cover.value.p5State : 'FROZEN BASELINE'}</span></div>
    </section><aside className={css.contextPanel} aria-label="Cover Studio 状态"><div className={css.sectionLabelRow}><h2>生产状态</h2><span>只读来源</span></div><dl className={css.metadataList}><div><dt>Route / Family</dt><dd>{context.cover.value.route} · {context.cover.value.family}</dd></div><div><dt>Baseline</dt><dd>{context.cover.value.baselineStatus} · {context.cover.value.baselineImmutable ? 'immutable' : 'mutable'}</dd></div><div><dt>页面</dt><dd>{context.cover.value.pages.join(' · ')}</dd></div><div><dt>P5</dt><dd>{context.cover.value.p5State} · 未注入批准素材</dd></div><div><dt>Renderer framework</dt><dd>{context.renderer.value.status} · {context.renderer.value.pagesPassed}/{context.renderer.value.pagesTotal}</dd></div><div><dt>Provider calls</dt><dd>{context.renderer.value.providerCalls} · image {context.renderer.value.imageGenerationCalls}</dd></div></dl><p className={css.realReadonlyNote}>Framework Ready 表示框架渲染检查完成，不代表最终封面已生成；本页未运行 Renderer。</p><button type="button" className={css.textAction} onClick={onOpenImage}>查看 P5 候选 ↗</button><StudioNavigation onOpenProject={onOpenProject} onOpenWork={onOpenWork} /></aside></div>
  </div></main>
}

function StudioHeader({ title, context, status }: { readonly title: string; readonly context: XhsRealContext; readonly status: string }) {
  const backToStudios = () => { selectWorkspaceIdentity('studios') }
  return <header className={css.studioHeader}><div><button type="button" className={css.backButton} onClick={backToStudios}>← <span>返回 Studios</span></button><div className={css.studioTitleLine}><div><span className={css.eyebrow}>{context.identity.replaceAll('/', ' · ')}</span><h1>{title}</h1></div><span className={css.prototypeTag}>{status}</span></div></div><span className={css.localOnly}>只读 · 不调用 Provider</span></header>
}

function StudioNavigation({ onOpenProject, onOpenWork }: { readonly onOpenProject: () => void; readonly onOpenWork: () => void }) {
  return <nav className={css.studioNavigation} aria-label="关联业务上下文"><span>返回关联上下文</span><button type="button" onClick={onOpenProject}>Project ↗</button><button type="button" onClick={onOpenWork}>Work ↗</button></nav>
}

function RealCandidateThumbnail({ candidate }: { readonly candidate: XhsRealContext['assets']['value']['candidates'][number] | undefined }) {
  return candidate === undefined ? <span className={css.realThumbEmpty}>P5</span> : <img className={css.realThumbnail} src={candidate.dataUrl} alt="P5 真实候选素材预览" />
}

function shortHash(value: string): string {
  return `${value.slice(0, 12)}…${value.slice(-6)}`
}
