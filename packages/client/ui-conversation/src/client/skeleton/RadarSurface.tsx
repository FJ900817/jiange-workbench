import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { selectWorkspaceIdentity } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  LocalAIHOTIntelligenceDetailResult,
  LocalAIHOTIntelligenceItem,
  LocalAIHOTIntelligenceRequest,
  LocalAIHOTIntelligenceResult,
  LocalAIHOTPendingRun,
  LocalAIHOTPendingRunRequest,
  LocalAIHOTReview,
  LocalAIHOTReviewReason,
  LocalAIHOTReviewResult,
  LocalAIHOTReviewsResult,
  LocalAIHOTReviewVerdict,
  LocalAIHOTReviewWriteRequest,
  LocalAIHOTReviewWriteResult,
  XhsFeedDetail,
  XhsFeedDetailResult,
  XhsCommentAnalysisResult,
  XhsCoverAssetResult,
  XhsFeedSummary,
  XhsSearchResult,
  XhsSearchFailureDiagnostic,
  XhsSearchSort,
  XhsSourceStatusResult,
  ScysCommentLoadResult,
  ScysEngagement,
  ScysContentDetailResult,
  ScysContentSearchResult,
  ScysContentSummary,
  ScysProjectDetailResult,
  ScysProjectSearchResult,
  ScysProjectSummary,
  ScysReconnectDiagnostic,
  ScysFeedMode,
  ScysFeedQueryResult,
  ScysSourceStatusResult,
  ScysTopicIdentity,
} from '@deepseek-ai/dsh-business-workbench/types'
import { loadRadarSignals, loadRadarStoryDetails, type RadarApiFailure, type RadarEvidence, type RadarSignal } from './aihot-radar-adapter.ts'
import { scysTokenCallbackDiagnosticLines } from './scys-status-diagnostic.ts'
import { deriveXhsIntelligence, type XhsAggregatedFeed, type XhsKeywordBatch, type XhsSignalCandidate } from './xhs-intelligence.ts'
import type { RadarSignalFixture } from './radar-fixtures.ts'
import { RADAR_CATEGORIES, RADAR_PROJECT_FIXTURES, RADAR_SIGNAL_FIXTURES } from './radar-fixtures.ts'
import { aipojuRadarClient, type AipojuHomeFeed, type AipojuTopic } from './aipoju-radar-client.ts'
import { AihotIntelligenceCenter } from './AihotIntelligenceCenter.tsx'
import css from './RadarSurface.module.css'

type RadarMode = 'real' | 'fixture'
type LoadState = 'loading' | 'ready' | 'unavailable'
type LocalListState = 'idle' | 'loading' | 'ready' | 'empty' | 'offline' | 'error'
type LocalReviewLoadState = 'idle' | 'loading' | 'ready' | 'unavailable'
type LocalReviewFilter = 'all' | 'pending_analysis' | 'pending_review' | 'kept' | 'maybe' | 'dropped' | 'blocked' | 'failed'
type RadarSpace = 'overview' | 'ai' | 'xiaohongshu' | 'shengcai' | 'aipoju' | 'signals'
type LocalAIHOTDetailItem = Extract<LocalAIHOTIntelligenceDetailResult, { status: 'available' }>['item']

interface LocalAIHOTClient {
  list: (request: LocalAIHOTIntelligenceRequest) => Promise<LocalAIHOTIntelligenceResult>
  detail: (articleId: string) => Promise<LocalAIHOTIntelligenceDetailResult>
  reviews: (articleIds: readonly string[]) => Promise<LocalAIHOTReviewsResult>
  review: (articleId: string) => Promise<LocalAIHOTReviewResult>
  writeReview: (request: LocalAIHOTReviewWriteRequest) => Promise<LocalAIHOTReviewWriteResult>
  processPending?: (request: LocalAIHOTPendingRunRequest) => Promise<{ readonly status: string; readonly run?: LocalAIHOTPendingRun }>
  pendingRun?: (runId: string) => Promise<{ readonly status: string; readonly run?: LocalAIHOTPendingRun }>
  pendingRuns?: () => Promise<{ readonly status: string; readonly runs?: readonly LocalAIHOTPendingRun[] }>
}

interface XhsRadarClient {
  getSourceStatus: () => Promise<XhsSourceStatusResult>
  search: (input: { readonly keyword: string; readonly sortBy?: XhsSearchSort }) => Promise<XhsSearchResult>
  detail: (input: { readonly id: string; readonly xsecToken: string; readonly loadComments?: boolean }) => Promise<XhsFeedDetailResult>
  getCoverAsset?: (input: { readonly assetId: string }) => Promise<XhsCoverAssetResult>
  analyzeComments?: (input: import('@deepseek-ai/dsh-business-workbench/types').XhsCommentAnalysisRequest) => Promise<XhsCommentAnalysisResult>
}

interface ScysRadarClient {
  getSourceStatus: () => Promise<ScysSourceStatusResult>
  connect: () => Promise<ScysSourceStatusResult>
  searchContent: (keyword: string) => Promise<ScysContentSearchResult>
  contentDetail: (identity: ScysTopicIdentity) => Promise<ScysContentDetailResult>
  searchProjects: (keyword: string) => Promise<ScysProjectSearchResult>
  projectDetail: (id: string) => Promise<ScysProjectDetailResult>
  loadComments: (identity: ScysTopicIdentity) => Promise<ScysCommentLoadResult>
}

interface ScysTodayFeed {
  readonly featured: readonly ScysContentSummary[]
  readonly latest: readonly ScysContentSummary[]
  readonly fetchedAt: string
  readonly stale: boolean
  readonly refreshErrorCodes: readonly string[]
}

const REVIEW_REASONS: readonly LocalAIHOTReviewReason[] = ['RELEVANT', 'ACTIONABLE', 'CONTENT_WORTHY', 'TOOL_WORTH_TRYING', 'BUSINESS_SIGNAL', 'TOO_GENERIC', 'PR_NOISE', 'DUPLICATE', 'LOW_VALUE']
const REVIEW_FILTERS: readonly { readonly id: LocalReviewFilter; readonly label: string }[] = [
  { id: 'all', label: '全部' }, { id: 'pending_analysis', label: '待分析' }, { id: 'pending_review', label: '待判断' },
  { id: 'kept', label: '已保留' }, { id: 'maybe', label: '一般' }, { id: 'dropped', label: '已丢弃' }, { id: 'blocked', label: '已阻断' }, { id: 'failed', label: '分析失败' },
]

const RADAR_SPACES: readonly { readonly id: RadarSpace; readonly label: string }[] = [
  { id: 'overview', label: '总览' },
  { id: 'ai', label: 'AI 情报中心' },
  { id: 'xiaohongshu', label: '小红书雷达' },
  { id: 'shengcai', label: '生财有术' },
  { id: 'aipoju', label: 'AI 破局俱乐部' },
  { id: 'signals', label: '综合信号' },
]

/** Render AIHOT-backed Radar data by default; fixtures require an explicit development-only prop. */
export function RadarSurface({ mode = 'real', localAIHOT, xhsRadar, scysRadar, isActive = true }: { readonly mode?: RadarMode; readonly localAIHOT?: LocalAIHOTClient; readonly xhsRadar?: XhsRadarClient; readonly scysRadar?: ScysRadarClient; readonly isActive?: boolean } = {}) {
  if (mode === 'fixture') return <RadarFixtureSurface />
  return <RadarPublicSurface isActive={isActive} {...(localAIHOT === undefined ? {} : { localAIHOT })} {...(xhsRadar === undefined ? {} : { xhsRadar })} {...(scysRadar === undefined ? {} : { scysRadar })} />
}

function RadarPublicSurface({ localAIHOT, xhsRadar, scysRadar, isActive }: { readonly localAIHOT?: LocalAIHOTClient; readonly xhsRadar?: XhsRadarClient; readonly scysRadar?: ScysRadarClient; readonly isActive: boolean }) {
  const [space, setSpace] = useState<RadarSpace>('overview')
  const [signalRefreshVersion, setSignalRefreshVersion] = useState(0)
  const [signals, setSignals] = useState<readonly RadarSignal[]>([])
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [failureKind, setFailureKind] = useState<string | null>(null)
  const [localItems, setLocalItems] = useState<readonly LocalAIHOTIntelligenceItem[]>([])
  const [localCounts, setLocalCounts] = useState<{ readonly articles: number; readonly analyses: number } | null>(null)
  const [localListState, setLocalListState] = useState<LocalListState>('idle')
  const [localLastSuccessfulFetchAt, setLocalLastSuccessfulFetchAt] = useState<string | null>(null)
  const [localReviews, setLocalReviews] = useState<ReadonlyMap<string, LocalAIHOTReview>>(() => new Map())
  const [localReviewLoadState, setLocalReviewLoadState] = useState<LocalReviewLoadState>('idle')
  const [localReviewFilter, setLocalReviewFilter] = useState<LocalReviewFilter>('all')
  const [savingReviewIds, setSavingReviewIds] = useState<ReadonlySet<string>>(() => new Set())
  const [reviewSaveFailures, setReviewSaveFailures] = useState<ReadonlyMap<string, string>>(() => new Map())
  const [selectedLocalItemId, setSelectedLocalItemId] = useState<string | null>(null)
  const [localDetail, setLocalDetail] = useState<LocalAIHOTDetailItem | null>(null)
  const [localDetailState, setLocalDetailState] = useState<LoadState>('ready')
  const [localDetailReviewState, setLocalDetailReviewState] = useState<LocalReviewLoadState>('idle')
  const [selectedPendingIds, setSelectedPendingIds] = useState<ReadonlySet<string>>(() => new Set())
  const [pendingRun, setPendingRun] = useState<LocalAIHOTPendingRun | null>(null)
  const [recentPendingRuns, setRecentPendingRuns] = useState<readonly LocalAIHOTPendingRun[]>([])
  const [pendingActionMessage, setPendingActionMessage] = useState<string | null>(null)
  const [pendingStarting, setPendingStarting] = useState(false)
  const [pendingConfirmation, setPendingConfirmation] = useState(false)
  const [pendingConfirmationIds, setPendingConfirmationIds] = useState<readonly string[]>([])
  const [pendingActionReady, setPendingActionReady] = useState(false)
  const [selectedSignalKey, setSelectedSignalKey] = useState<string | null>(null)
  const [detailState, setDetailState] = useState<LoadState>('ready')
  const [detailFailure, setDetailFailure] = useState<string | null>(null)
  const storyRequest = useRef<AbortController | null>(null)
  const localListRequestId = useRef(0)
  const localDetailRequestId = useRef(0)
  const pendingRequestRef = useRef<LocalAIHOTPendingRunRequest | null>(null)
  const previousLocalListTrigger = useRef({ isActive: false, space: 'overview' as RadarSpace, localAIHOT })
  const selectedSignal = useMemo(() => signals.find(signal => signal.signalKey === selectedSignalKey), [signals, selectedSignalKey])
  const selectedLocalItem = useMemo(() => localItems.find(item => item.articleId === selectedLocalItemId), [localItems, selectedLocalItemId])

  useEffect(() => {
    const controller = new AbortController()
    setLoadState('loading')
    setFailureKind(null)
    void loadRadarSignals(fetch, controller.signal).then(result => {
      if (controller.signal.aborted) return
      setSignals(result)
      setLoadState('ready')
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return
      setSignals([])
      setFailureKind(isRadarFailure(error) ? error.kind : 'offline')
      setLoadState('unavailable')
    })
    return () => { controller.abort() }
  }, [signalRefreshVersion])

  const refreshLocalIntelligence = useCallback(async (): Promise<void> => {
    const requestId = ++localListRequestId.current
    setLocalListState('loading')
    if (localAIHOT === undefined) {
      setLocalListState('offline')
      return
    }
    try {
      const result = await localAIHOT.list({ limit: 20 })
      if (requestId !== localListRequestId.current) return
      if (result.status === 'unavailable') {
        setLocalListState('offline')
        return
      }
      setLocalItems(result.items)
      setLocalCounts(result.counts)
      setLocalLastSuccessfulFetchAt(new Date().toISOString())
      setLocalListState(result.items.length === 0 ? 'empty' : 'ready')
      setSelectedPendingIds(current => new Set([...current].filter(id => result.items.some(item => item.articleId === id && item.intelligenceState === 'pending_analysis'))))
      const runs = await localAIHOT.pendingRuns?.()
      setPendingActionReady(runs?.status === 'available' && localAIHOT.processPending !== undefined)
      if (runs?.status === 'available' && runs.runs !== undefined) {
        setRecentPendingRuns(runs.runs)
        setPendingRun(current => {
          const persisted = runs.runs?.find(run => run.runId === current?.runId)
          if (persisted !== undefined) return persisted
          return runs.runs?.find(run => run.status === 'running') ?? current
        })
      }
      setLocalReviewLoadState('loading')
      const reviewResult = await localAIHOT.reviews(result.items.map(item => item.articleId))
      if (requestId !== localListRequestId.current) return
      if (reviewResult.status === 'unavailable') {
        setLocalReviewLoadState('unavailable')
        return
      }
      setLocalReviews(current => {
        const next = new Map(current)
        for (const item of result.items) next.delete(item.articleId)
        for (const review of reviewResult.reviews) next.set(review.articleId, review)
        return next
      })
      setLocalReviewLoadState('ready')
    } catch {
      if (requestId !== localListRequestId.current) return
      setLocalListState('error')
    }
  }, [localAIHOT])

  const requestPendingConfirmation = useCallback((): void => {
    if (localAIHOT?.processPending === undefined || localListState !== 'ready' || selectedPendingIds.size < 1 || selectedPendingIds.size > 3 || pendingStarting) return
    const requestedIds = [...selectedPendingIds]
    const previous = pendingRequestRef.current
    const request = previous !== null && JSON.stringify(previous.articleIds) === JSON.stringify(requestedIds)
      ? previous
      : { articleIds: requestedIds, idempotencyKey: globalThis.crypto.randomUUID() }
    pendingRequestRef.current = request
    setPendingConfirmationIds(request.articleIds)
    setPendingActionMessage(null)
    setPendingConfirmation(true)
  }, [localAIHOT, localListState, pendingStarting, selectedPendingIds])

  const startPendingAnalysis = useCallback(async (): Promise<void> => {
    if (localAIHOT?.processPending === undefined || localListState !== 'ready' || pendingStarting) return
    const request = pendingRequestRef.current
    if (request === null) return
    setPendingConfirmation(false)
    setPendingActionMessage(null)
    setPendingStarting(true)
    try {
      const result = await localAIHOT.processPending(request)
      if (result.status !== 'available' || result.run === undefined) {
        setPendingActionMessage(pendingActionStatusText(result.status))
        if (result.status !== 'unavailable') pendingRequestRef.current = null
        return
      }
      pendingRequestRef.current = null
      setPendingConfirmationIds([])
      setPendingRun(result.run)
      setSelectedPendingIds(new Set())
      setPendingActionMessage(null)
    } catch {
      setPendingActionMessage('连接暂时中断；重新尝试将复用同一请求标识，不会另起一批。')
    } finally { setPendingStarting(false) }
  }, [localAIHOT, localListState, pendingStarting, selectedPendingIds])

  const reconnectPendingRun = useCallback(async (runId: string): Promise<void> => {
    if (localAIHOT?.pendingRun === undefined) return
    const result = await localAIHOT.pendingRun(runId)
    if (result.status === 'available' && result.run !== undefined) setPendingRun(result.run)
  }, [localAIHOT])

  useEffect(() => {
    if (pendingRun === null || pendingRun.status !== 'running') return
    const timer = window.setTimeout(() => { void reconnectPendingRun(pendingRun.runId) }, 1200)
    return () => { window.clearTimeout(timer) }
  }, [pendingRun, reconnectPendingRun])

  useEffect(() => {
    if (pendingRun === null || pendingRun.status === 'running') return
    void refreshLocalIntelligence()
  }, [pendingRun, refreshLocalIntelligence])

  useEffect(() => {
    const previous = previousLocalListTrigger.current
    previousLocalListTrigger.current = { isActive, space, localAIHOT }
    const radarRegainedFocus = isActive && !previous.isActive
    const myIntelligenceEntered = isActive && space === 'ai' && previous.space !== 'ai'
    const clientChanged = isActive && localAIHOT !== previous.localAIHOT
    if (radarRegainedFocus || myIntelligenceEntered || clientChanged) void refreshLocalIntelligence()
  }, [isActive, localAIHOT, refreshLocalIntelligence, space])

  useEffect(() => () => { storyRequest.current?.abort() }, [])

  function openSignal(signal: RadarSignal): void {
    setSpace('ai')
    setSelectedLocalItemId(null)
    setLocalDetail(null)
    storyRequest.current?.abort()
    setSelectedSignalKey(signal.signalKey)
    setDetailFailure(null)
    if (signal.kind === 'item') {
      setDetailState('ready')
      return
    }
    const controller = new AbortController()
    storyRequest.current = controller
    setDetailState('loading')
    void loadRadarStoryDetails(signal, fetch, controller.signal).then(detail => {
      if (controller.signal.aborted) return
      setSignals(current => current.map(item => item.signalKey === detail.signalKey ? detail : item))
      setDetailState('ready')
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return
      setDetailFailure(isRadarFailure(error) ? error.kind : 'offline')
      setDetailState('unavailable')
    })
  }

  function openLocalItem(item: LocalAIHOTIntelligenceItem): void {
    const requestId = ++localDetailRequestId.current
    setSelectedSignalKey(null)
    setSelectedLocalItemId(item.articleId)
    setSpace('ai')
    setLocalDetail(null)
    setLocalDetailReviewState('loading')
    if (localAIHOT === undefined) {
      setLocalDetailState('unavailable')
      setLocalDetailReviewState('unavailable')
      return
    }
    setLocalDetailState('loading')
    void Promise.all([localAIHOT.detail(item.articleId), localAIHOT.review(item.articleId)]).then(([detailResult, reviewResult]) => {
      if (requestId !== localDetailRequestId.current) return
      if (detailResult.status === 'available') {
        setLocalDetail(detailResult.item)
        setLocalDetailState('ready')
      } else setLocalDetailState('unavailable')
      if (reviewResult.status === 'available') {
        setLocalReviews(current => {
          const next = new Map(current)
          if (reviewResult.review === null) next.delete(item.articleId)
          else next.set(item.articleId, reviewResult.review)
          return next
        })
        setLocalDetailReviewState('ready')
      } else setLocalDetailReviewState('unavailable')
    }).catch(() => {
      if (requestId !== localDetailRequestId.current) return
      setLocalDetailState('unavailable')
      setLocalDetailReviewState('unavailable')
    })
  }

  async function saveLocalReview(request: LocalAIHOTReviewWriteRequest): Promise<boolean> {
    if (localAIHOT === undefined || !['ready', 'empty'].includes(localListState) || localReviewLoadState !== 'ready') return false
    setSavingReviewIds(current => new Set(current).add(request.articleId))
    setReviewSaveFailures(current => { const next = new Map(current); next.delete(request.articleId); return next })
    try {
      const writeResult = await localAIHOT.writeReview(request)
      if (writeResult.status === 'not_reviewable') throw new Error('ARTICLE_NOT_REVIEWABLE')
      if (writeResult.status !== 'available') throw new Error('Review write failed')
      const readBack = await localAIHOT.review(request.articleId)
      if (readBack.status !== 'available' || readBack.review === null) throw new Error('Review read-back failed')
      setLocalReviews(current => new Map(current).set(request.articleId, readBack.review!))
      setLocalReviewLoadState('ready')
      setLocalDetailReviewState('ready')
      return true
    } catch (error: unknown) {
      const notReviewable = error instanceof Error && error.message === 'ARTICLE_NOT_REVIEWABLE'
      setReviewSaveFailures(current => new Map(current).set(request.articleId, notReviewable ? '内容状态已变化，当前不满足人工判断条件；列表正在刷新。' : '判断保存失败'))
      if (notReviewable) void refreshLocalIntelligence()
      return false
    } finally {
      setSavingReviewIds(current => { const next = new Set(current); next.delete(request.articleId); return next })
    }
  }

  return (
    <main className={css.root} aria-label="Radar">
      <div className={css.container}>
        <RadarNavigation active={space} onNavigate={next => { storyRequest.current?.abort(); setSelectedSignalKey(null); setSelectedLocalItemId(null); setSpace(next) }} />
        {selectedLocalItem !== undefined
          ? <LocalIntelligenceDetail item={selectedLocalItem} detail={localDetail} detailState={localDetailState} review={localReviews.get(selectedLocalItem.articleId)?.analysisId === selectedLocalItem.analysisId ? localReviews.get(selectedLocalItem.articleId) ?? null : null} reviewLoadState={localDetailReviewState} reviewWriteDisabled={!['ready', 'empty'].includes(localListState) || localReviewLoadState !== 'ready'} reviewSaving={savingReviewIds.has(selectedLocalItem.articleId)} reviewSaveFailure={reviewSaveFailures.get(selectedLocalItem.articleId) ?? null} onSaveReview={saveLocalReview} onBack={() => { setSelectedLocalItemId(null); setLocalDetail(null); setSpace('ai'); void refreshLocalIntelligence() }} />
          : selectedSignal !== undefined
          ? <SignalDetail signal={selectedSignal} detailState={detailState} detailFailure={detailFailure} onBack={() => { storyRequest.current?.abort(); setSelectedSignalKey(null); setSpace('ai') }} />
          : space === 'overview'
            ? <RadarOverview signals={signals} loadState={loadState} failureKind={failureKind} localItems={localItems} localListState={localListState} localLastSuccessfulFetchAt={localLastSuccessfulFetchAt} onNavigate={setSpace} onOpen={openSignal} onOpenLocal={openLocalItem} />
            : space === 'ai'
              ? <AihotIntelligenceCenter signals={signals} signalStatus={loadState === 'unavailable' ? 'unavailable' : loadState} signalFailure={failureKind} onOpenSignal={openSignal} onRefreshSignals={() => { setSignalRefreshVersion(current => current + 1) }} myIntelligence={<AIIntelligence localItems={localItems} localCounts={localCounts} localListState={localListState} localLastSuccessfulFetchAt={localLastSuccessfulFetchAt} localReviews={localReviews} reviewLoadState={localReviewLoadState} reviewFilter={localReviewFilter} reviewSavingIds={savingReviewIds} reviewSaveFailures={reviewSaveFailures} reviewWriteDisabled={!['ready', 'empty'].includes(localListState) || localReviewLoadState !== 'ready'} onReviewFilter={setLocalReviewFilter} onSaveReview={saveLocalReview} onRefreshLocal={refreshLocalIntelligence} onOpenLocal={openLocalItem} selectedPendingIds={selectedPendingIds} onPendingSelection={setSelectedPendingIds} onStartPendingAnalysis={requestPendingConfirmation} onConfirmPendingAnalysis={startPendingAnalysis} onCancelPendingAnalysis={() => { pendingRequestRef.current = null; setPendingConfirmationIds([]); setPendingConfirmation(false) }} pendingConfirmation={pendingConfirmation} pendingConfirmationIds={pendingConfirmationIds} pendingRun={pendingRun} pendingRuns={recentPendingRuns} pendingActionMessage={pendingActionMessage} onReconnectPendingRun={reconnectPendingRun} pendingActionAvailable={pendingActionReady && localAIHOT?.processPending !== undefined} starting={pendingStarting} />} />
              : space === 'xiaohongshu'
                ? <XiaohongshuRadar active={isActive} {...(xhsRadar === undefined ? {} : { dataClient: xhsRadar })} />
                : space === 'shengcai'
                  ? <ScysRadar active={isActive} {...(scysRadar === undefined ? {} : { dataClient: scysRadar })} />
                  : space === 'aipoju'
                    ? <AipojuRadar active={isActive} />
                    : <CrossSourceSignals />}
      </div>
    </main>
  )
}

function RadarNavigation({ active, onNavigate }: { active: RadarSpace; onNavigate: (space: RadarSpace) => void }) {
  return <nav className={css.spaceNav} aria-label="Radar 情报空间">
    {RADAR_SPACES.map(space => <button key={space.id} type="button" aria-current={active === space.id ? 'page' : undefined} className={active === space.id ? css.spaceNavActive : ''} onClick={() => { onNavigate(space.id) }}>{space.label}</button>)}
  </nav>
}

function RadarOverview({ signals, loadState, failureKind, localItems, localListState, localLastSuccessfulFetchAt, onNavigate, onOpen, onOpenLocal }: {
  signals: readonly RadarSignal[]
  loadState: LoadState
  failureKind: string | null
  localItems: readonly LocalAIHOTIntelligenceItem[]
  localListState: LocalListState
  localLastSuccessfulFetchAt: string | null
  onNavigate: (space: RadarSpace) => void
  onOpen: (signal: RadarSignal) => void
  onOpenLocal: (item: LocalAIHOTIntelligenceItem) => void
}) {
  return (
    <section className={css.overview} data-radar-route="/radar">
      <header className={css.pageHeader}>
        <div><h1>Radar</h1><p>外部情报与机会雷达</p></div>
        <button className={css.updateButton} type="button" disabled title="情报更新入口尚未接入">更新情报</button>
      </header>
      <div className={css.spaceGrid}>
      <OverviewCard space="ai" title="AI 情报中心" description="官方公共资讯、热点与周期报告；本地我的情报独立保留。" status="官方公共只读 · 本地数据隔离" accent="ai" onEnter={onNavigate}>
          <div className={css.overviewIntelligencePreview}>
            <LocalPreview items={localItems.slice(0, 1)} loadState={localListState} lastSuccessfulFetchAt={localLastSuccessfulFetchAt} onOpen={onOpenLocal} />
            <span>公共热点 · AIHOT</span>
            <PublicPreview signals={signals.slice(0, 1)} loadState={loadState} failureKind={failureKind} onOpen={onOpen} />
          </div>
        </OverviewCard>
        <OverviewCard space="xiaohongshu" title="小红书雷达" description="发现平台内容、搜索与用户需求信号。" status="小红书数据源暂不可用" accent="xhs" onEnter={onNavigate}>
          <PreviewSlots items={['今日信号', '爆文观察', '搜索发现', '评论需求']} />
        </OverviewCard>
        <OverviewCard space="shengcai" title="生财有术" description="项目案例、赚钱路径与可复用方法。" status="尚未接入数据源" accent="shengcai" onEnter={onNavigate}>
          <PreviewSlots items={['高价值案例', '可复用方法']} />
        </OverviewCard>
        <OverviewCard space="aipoju" title="AI 破局俱乐部" description="读取俱乐部主题与官方原文，保持来源可追溯。" status="官方 CLI · 只读" accent="aipoju" onEnter={onNavigate}>
          <PreviewSlots items={['最新主题', '关键词搜索', '官方原文']} />
        </OverviewCard>
        <OverviewCard space="signals" title="综合信号" description="寻找跨来源重复出现、相互验证的机会。" status="结构预留 · 暂无 Signal Registry" accent="signals" onEnter={onNavigate}>
          <PreviewSlots items={['跨来源关联', '待验证机会']} />
        </OverviewCard>
      </div>
    </section>
  )
}

function LocalPreview({ items, loadState, lastSuccessfulFetchAt, onOpen }: { items: readonly LocalAIHOTIntelligenceItem[]; loadState: LocalListState; lastSuccessfulFetchAt: string | null; onOpen: (item: LocalAIHOTIntelligenceItem) => void }) {
  if (loadState === 'idle' || (loadState === 'loading' && lastSuccessfulFetchAt === null)) return <p className={css.previewState} role="status">正在读取本地 AI 情报…</p>
  if (loadState === 'offline' || loadState === 'error') return <p className={css.previewState} role="alert">本地 AI 情报暂不可用{lastSuccessfulFetchAt === null ? '' : ` · 上次读取 ${formatTime(lastSuccessfulFetchAt)}`}</p>
  if (loadState === 'loading') return <div><p className={css.previewState} role="status">正在刷新 · 以下为上次读取结果（{formatTime(lastSuccessfulFetchAt)}）</p>{items.length > 0 && <PreviewLocalItems items={items} onOpen={onOpen} />}</div>
  if (items.length === 0) return <p className={css.previewState}>本地 AIHOT 暂无文章。</p>
  return <PreviewLocalItems items={items} onOpen={onOpen} />
}

function PreviewLocalItems({ items, onOpen }: { items: readonly LocalAIHOTIntelligenceItem[]; onOpen: (item: LocalAIHOTIntelligenceItem) => void }) {
  return <div className={css.previewSignals}>{items.map(item => <button key={item.articleId} type="button" aria-label={`打开本地情报：${item.title}`} onClick={() => { onOpen(item) }}><span>{item.title}</span><small>{item.source} · {formatTime(item.publishedAt)}</small></button>)}</div>
}

function OverviewCard({ space, title, description, status, accent, onEnter, children }: {
  space: Exclude<RadarSpace, 'overview'>
  title: string
  description: string
  status: string
  accent: 'ai' | 'xhs' | 'shengcai' | 'aipoju' | 'signals'
  onEnter: (space: RadarSpace) => void
  children: ReactNode
}) {
  return <article className={css.spaceCard} data-accent={accent}>
    <div className={css.cardHeading}><div><h2>{title}</h2><p>{description}</p></div><span className={css.spaceMark} aria-hidden="true">{accent === 'ai' ? 'A' : accent === 'xhs' ? '小' : accent === 'shengcai' ? '生' : accent === 'aipoju' ? '破' : '↗'}</span></div>
    <p className={css.cardStatus}>{status}</p>
    <div className={css.cardPreview}>{children}</div>
    <button className={css.enterLink} type="button" onClick={() => { onEnter(space) }}>进入{title} <span aria-hidden="true">→</span></button>
  </article>
}

function PublicPreview({ signals, loadState, failureKind, onOpen }: { signals: readonly RadarSignal[]; loadState: LoadState; failureKind: string | null; onOpen: (signal: RadarSignal) => void }) {
  if (loadState === 'loading') return <p className={css.previewState} role="status">正在读取公共热点…</p>
  if (loadState === 'unavailable') return <p className={css.previewState} role="alert">公共热点暂不可用{failureKind === null ? '' : ` · ${failureKind}`}</p>
  if (signals.length === 0) return <p className={css.previewState}>当前没有可展示的公共热点。</p>
  return <div className={css.previewSignals}>{signals.map(signal => <button key={signal.signalKey} type="button" aria-label={`打开信号：${signal.title}`} onClick={() => { onOpen(signal) }}><span>{signal.title}</span><small>{signal.sourceName} · {formatTime(signal.publishedAt)}</small></button>)}</div>
}

function PreviewSlots({ items }: { items: readonly string[] }) {
  return <ul className={css.previewSlots}>{items.map(item => <li key={item}><span aria-hidden="true">＋</span>{item}<small>等待真实来源</small></li>)}</ul>
}

function AIIntelligence({ localItems, localCounts, localListState, localLastSuccessfulFetchAt, localReviews, reviewLoadState, reviewFilter, reviewSavingIds, reviewSaveFailures, reviewWriteDisabled, onReviewFilter, onSaveReview, onRefreshLocal, onOpenLocal, selectedPendingIds, onPendingSelection, onStartPendingAnalysis, onConfirmPendingAnalysis, onCancelPendingAnalysis, pendingConfirmation, pendingConfirmationIds, pendingRun, pendingRuns, pendingActionMessage, onReconnectPendingRun, pendingActionAvailable, starting }: {
  localItems: readonly LocalAIHOTIntelligenceItem[]
  localCounts: { readonly articles: number; readonly analyses: number } | null
  localListState: LocalListState
  localLastSuccessfulFetchAt: string | null
  localReviews: ReadonlyMap<string, LocalAIHOTReview>
  reviewLoadState: LocalReviewLoadState
  reviewFilter: LocalReviewFilter
  reviewSavingIds: ReadonlySet<string>
  reviewSaveFailures: ReadonlyMap<string, string>
  reviewWriteDisabled: boolean
  onReviewFilter: (filter: LocalReviewFilter) => void
  onSaveReview: (request: LocalAIHOTReviewWriteRequest) => Promise<boolean>
  onRefreshLocal: () => void
  onOpenLocal: (item: LocalAIHOTIntelligenceItem) => void
  selectedPendingIds: ReadonlySet<string>
  onPendingSelection: (ids: ReadonlySet<string>) => void
  onStartPendingAnalysis: () => void
  onConfirmPendingAnalysis: () => void
  onCancelPendingAnalysis: () => void
  pendingConfirmation: boolean
  pendingConfirmationIds: readonly string[]
  pendingRun: LocalAIHOTPendingRun | null
  pendingRuns: readonly LocalAIHOTPendingRun[]
  pendingActionMessage: string | null
  onReconnectPendingRun: (runId: string) => void
  pendingActionAvailable: boolean
  starting: boolean
}) {
  return <section className={css.workspacePage} data-radar-route="/radar/ai/mine">
    <section className={css.myIntelligence} aria-labelledby="my-intelligence-heading"><div><span className={css.pageEyebrow}>LOCAL · AIHOT</span><h2 id="my-intelligence-heading">我的情报</h2><p>本地 AIHOT 持久化 Article / Analysis 只读投影</p></div><div className={css.connectionState}><strong>{localListStatusText(localListState, localCounts)}</strong><span>{localListState === 'offline' || localListState === 'error' || localListState === 'loading' && localLastSuccessfulFetchAt !== null
      ? localLastSuccessfulFetchAt === null ? '尚无上次成功读取结果' : `以下为上次成功读取结果 · ${formatTime(localLastSuccessfulFetchAt)}`
      : '独立本地来源 · 不回退公共热点'}</span></div></section>
    <section className={css.localDataSection} aria-labelledby="local-data-heading"><div className={css.sectionHeading}><div><h2 id="local-data-heading">本地情报</h2><p>Article / Analysis 只读 · 人工判断单独保存</p></div><div className={css.localDataActions}><button className={css.localRefresh} type="button" onClick={onRefreshLocal} disabled={localListState === 'loading'}>{localListState === 'loading' ? '刷新中…' : '刷新'}</button><span className={css.realTag}>LOCAL DATA</span></div></div>
      <PendingAnalysisAction selectedCount={selectedPendingIds.size} items={localItems} filter={reviewFilter} loadState={localListState} actionAvailable={pendingActionAvailable} starting={starting || pendingRun?.status === 'running'} onStart={onStartPendingAnalysis} onConfirm={onConfirmPendingAnalysis} onCancel={onCancelPendingAnalysis} confirming={pendingConfirmation} confirmIds={pendingConfirmationIds} run={pendingRun} recentRuns={pendingRuns} message={pendingActionMessage} onReconnect={onReconnectPendingRun} />
      <LocalIntelligenceList items={localItems} loadState={localListState} lastSuccessfulFetchAt={localLastSuccessfulFetchAt} reviews={localReviews} reviewLoadState={reviewLoadState} reviewFilter={reviewFilter} savingReviewIds={reviewSavingIds} reviewSaveFailures={reviewSaveFailures} reviewWriteDisabled={reviewWriteDisabled} onReviewFilter={onReviewFilter} onSaveReview={onSaveReview} onOpen={onOpenLocal} selectedPendingIds={selectedPendingIds} onPendingSelection={onPendingSelection} />
    </section>
  </section>
}

function PendingAnalysisAction({ selectedCount, items, filter, loadState, actionAvailable, starting, onStart, onConfirm, onCancel, confirming, confirmIds, run, recentRuns, message, onReconnect }: {
  selectedCount: number
  items: readonly LocalAIHOTIntelligenceItem[]
  filter: LocalReviewFilter
  loadState: LocalListState
  actionAvailable: boolean
  starting: boolean
  onStart: () => void
  onConfirm: () => void
  onCancel: () => void
  confirming: boolean
  confirmIds: readonly string[]
  run: LocalAIHOTPendingRun | null
  recentRuns: readonly LocalAIHOTPendingRun[]
  message: string | null
  onReconnect: (runId: string) => void
}) {
  const pendingItems = items.filter(item => item.intelligenceState === 'pending_analysis')
  const activeRun = run?.status === 'running' ? run : null
  const confirmedItems = confirmIds.map(id => items.find(item => item.articleId === id)).filter((item): item is LocalAIHOTIntelligenceItem => item !== undefined)
  return <section className={css.pendingAction} aria-label="处理待分析">
    {filter === 'pending_analysis' && <div className={css.pendingActionBar}>
      <div><strong>已选择 {selectedCount} 条</strong><span>仅处理明确选择的待分析文章 · 每次最多 3 条</span></div>
      <button type="button" disabled={!actionAvailable || loadState !== 'ready' || selectedCount < 1 || selectedCount > 3 || starting || activeRun !== null} onClick={onStart}>
        {starting ? '正在连接…' : activeRun ? '处理中' : '处理待分析'}
      </button>
    </div>}
    {filter === 'pending_analysis' && selectedCount === 3 && <p className={css.pendingActionHint} role="status">每次最多处理 3 条。</p>}
    {confirming && <div className={css.pendingRunSummary} role="group" aria-label="确认处理待分析">
      <strong>处理 {confirmIds.length} 条待分析情报</strong>
      {confirmedItems.map(item => <span key={item.articleId}>{item.title}</span>)}
      <span>系统将读取文章内容并调用 AI 分析，完成后文章进入“待判断 / 已阻断 / 分析失败”。只处理当前所选文章，不采集新来源。</span>
      <span>服务端按现有完整 Analysis Pipeline 估算请求预算：每篇最多预留 5 次，整批上限 15 次。</span>
      <div className={css.pendingConfirmActions}><button type="button" disabled={starting || confirmIds.length === 0} onClick={onConfirm}>开始处理</button><button type="button" disabled={starting} onClick={onCancel}>取消</button></div>
    </div>}
    {loadState === 'offline' && <p className={css.pendingActionHint}>本地 AI 情报暂不可用，处理待分析已停用。</p>}
    {!actionAvailable && loadState !== 'offline' && <p className={css.pendingActionHint}>受控处理服务暂不可用；不会改用其他执行入口。</p>}
    {message !== null && <p className={css.pendingActionHint} role="status">{message}</p>}
    {activeRun !== null && <div className={css.pendingRunProgress} role="status">
      <strong>正在处理 {Math.min(activeRun.currentArticle, activeRun.articleCount)} / {activeRun.articleCount}</strong>
      {activeRun.items.map(item => <span key={item.articleId}>{item.title} · {pendingArticleStatusText(item.status)}</span>)}
      <span>已完成 {activeRun.processedCount} · {activeRun.pendingReviewCount} 待判断 · {activeRun.blockedCount} 已阻断 · {activeRun.failedCount} 失败</span>
    </div>}
    {run !== null && run.status !== 'running' && <PendingRunSummary run={run} />}
    {recentRuns.length > 0 && <div className={css.pendingRunHistory}><strong>最近处理</strong>{recentRuns.slice(0, 5).map(entry => <div key={entry.runId}>
      <span>{formatTime(entry.startedAt)} · {pendingRunStatusText(entry.status)} · 处理 {entry.articleCount} 条 · {entry.pendingReviewCount} 待判断 · {entry.blockedCount} 阻断 · {entry.failedCount} 失败</span>
      {entry.status === 'running' && <button type="button" onClick={() => { onReconnect(entry.runId) }}>恢复状态</button>}
    </div>)}</div>}
    {filter === 'pending_analysis' && pendingItems.length === 0 && <p className={css.pendingActionHint}>当前没有待分析文章。</p>}
  </section>
}

function PendingRunSummary({ run }: { run: LocalAIHOTPendingRun }) {
  const headline = run.status === 'interrupted'
    ? '服务重启时批次已中断；不会自动恢复或重跑'
    : run.safetyStatus === 'failed'
      ? '安全校验未通过，批次已停止'
      : run.status === 'safety_stopped'
        ? '安全门槛触发，批次已停止'
        : run.status === 'failed'
          ? '批次失败，未自动重试'
          : `处理完成 · ${run.pendingReviewCount} 条待判断 · ${run.blockedCount} 条阻断 · ${run.failedCount} 条失败`
  return <div className={css.pendingRunSummary}>
    <strong>{headline}</strong>
    <details><summary>技术详情</summary><span>文章数 {run.articleCount} · 已处理 {run.processedCount}</span><span>模型请求 {run.requestAttempts}/{run.requestCap}</span><span>Run ID {run.runId}</span><span>安全状态 {run.safetyStatus === 'passed' ? '通过' : run.safetyStatus === 'failed' ? '失败' : '进行中'}</span><span>开始 {formatTime(run.startedAt)} · 结束 {run.finishedAt === null ? '运行中' : formatTime(run.finishedAt)}</span></details>
  </div>
}

function LocalIntelligenceList({ items, loadState, lastSuccessfulFetchAt, reviews, reviewLoadState, reviewFilter, savingReviewIds, reviewSaveFailures, reviewWriteDisabled, onReviewFilter, onSaveReview, onOpen, selectedPendingIds, onPendingSelection }: {
  items: readonly LocalAIHOTIntelligenceItem[]
  loadState: LocalListState
  lastSuccessfulFetchAt: string | null
  reviews: ReadonlyMap<string, LocalAIHOTReview>
  reviewLoadState: LocalReviewLoadState
  reviewFilter: LocalReviewFilter
  savingReviewIds: ReadonlySet<string>
  reviewSaveFailures: ReadonlyMap<string, string>
  reviewWriteDisabled: boolean
  onReviewFilter: (filter: LocalReviewFilter) => void
  onSaveReview: (request: LocalAIHOTReviewWriteRequest) => Promise<boolean>
  onOpen: (item: LocalAIHOTIntelligenceItem) => void
  selectedPendingIds: ReadonlySet<string>
  onPendingSelection: (ids: ReadonlySet<string>) => void
}) {
  const hasLastSuccessfulData = lastSuccessfulFetchAt !== null
  const filteredItems = items.filter(item => {
    if (reviewFilter === 'all') return true
    return item.intelligenceState === reviewFilter
  })
  if ((loadState === 'idle' || loadState === 'loading') && !hasLastSuccessfulData) return <p className={css.emptyState} role="status">正在读取本地 AI 情报…</p>
  return <>
    {loadState === 'offline' && <div className={css.unavailable} role="alert"><strong>本地 AI 情报暂不可用</strong><span>{hasLastSuccessfulData ? `以下为上次成功读取的数据 · ${formatTime(lastSuccessfulFetchAt)}。公共热点仍在下方独立展示。` : '请检查本地 AIHOT 服务与 Host 访问凭证；公共热点仍在下方独立展示。尚无上次成功读取的数据。'}</span></div>}
    {loadState === 'error' && <div className={css.unavailable} role="alert"><strong>本地 AI 情报读取失败</strong><span>{hasLastSuccessfulData ? `以下为上次成功读取的数据 · ${formatTime(lastSuccessfulFetchAt)}。公共热点仍在下方独立展示。` : '请检查本地 AIHOT 服务与 Host 访问凭证；公共热点仍在下方独立展示。尚无上次成功读取的数据。'}</span></div>}
    {loadState === 'loading' && hasLastSuccessfulData && <p className={css.refreshingNotice} role="status">正在重新读取 · 当前列表为上次成功读取结果（{formatTime(lastSuccessfulFetchAt)}）</p>}
    {reviewLoadState === 'unavailable' && loadState !== 'offline' && <p className={css.reviewStateNotice} role="status">人工判断暂不可用，暂不能保存。</p>}
    {(loadState === 'offline' || loadState === 'error') && <p className={css.reviewStateNotice} role="status">本地 AI 情报暂不可用，当前判断无法保存。</p>}
    {loadState !== 'offline' && loadState !== 'error' && <nav className={css.reviewFilters} aria-label="情报状态筛选">{REVIEW_FILTERS.map(filter => <button key={filter.id} type="button" aria-pressed={reviewFilter === filter.id} className={reviewFilter === filter.id ? css.reviewFilterActive : ''} onClick={() => { onReviewFilter(filter.id) }}>{filter.label}</button>)}</nav>}
    {items.length === 0
      ? loadState === 'empty' ? <p className={css.emptyState}>本地 AIHOT 暂无文章。</p>
        : hasLastSuccessfulData ? <p className={css.emptyState}>上次成功读取时没有文章。</p>
          : null
      : filteredItems.length === 0
        ? <p className={css.emptyState}>当前筛选下没有情报。</p>
        : <div className={css.localItemList}>{filteredItems.map(item => {
          const storedReview = reviews.get(item.articleId) ?? null
          const review = storedReview?.analysisId === item.analysisId ? storedReview : null
          return <article className={css.localItemRow} data-selectable={reviewFilter === 'pending_analysis' ? 'true' : 'false'} key={item.articleId}>
            {reviewFilter === 'pending_analysis' && item.intelligenceState === 'pending_analysis' && <label className={css.pendingSelect} aria-label={`选择待分析：${item.title}`}><input type="checkbox" checked={selectedPendingIds.has(item.articleId)} disabled={loadState !== 'ready' || selectedPendingIds.size >= 3 && !selectedPendingIds.has(item.articleId)} onChange={event => { const next = new Set(selectedPendingIds); if (event.currentTarget.checked) next.add(item.articleId); else next.delete(item.articleId); onPendingSelection(next) }} /><span>选择</span></label>}
            <button className={css.localItemOpen} type="button" aria-label={`打开本地情报：${item.title}`} onClick={() => { onOpen(item) }}>
              <span className={css.localItemBody}><strong>{item.title}</strong><span>{item.summary ?? item.excerptPreview ?? '暂无可展示内容'}</span><small>{item.source} · {formatTime(item.publishedAt)} · {intelligenceStateLabel(item.intelligenceState)}{item.contentBasis === 'excerpt' ? ' · 来源摘录' : item.contentBasis === 'body' ? ' · 正文可用' : ''}</small></span>
              <span className={css.localItemMeta}>
                <span className={css.intelligenceBadge} data-state={item.intelligenceState}>{intelligenceStateLabel(item.intelligenceState)}</span>
                {item.intelligenceState === 'blocked' && item.prefilterReason !== null && <span>{item.prefilterReason}</span>}
                {item.analysisId !== null && <><span>AIHOT 评分 · {item.score ?? '未评分'}</span><span>Selected · {item.selected === null ? '未生成' : item.selected ? '是' : '否'}</span></>}
                {item.reviewable && <span>我的判断 · {reviewLoadState !== 'ready' ? '暂不可用' : review === null ? '待判断' : reviewVerdictLabel(review.verdict)}</span>}
              </span>
            </button>
            {item.reviewable && <ReviewQuickActions item={item} review={review} disabled={reviewWriteDisabled || loadState === 'offline' || loadState === 'error' || savingReviewIds.has(item.articleId)} saving={savingReviewIds.has(item.articleId)} failureMessage={reviewSaveFailures.get(item.articleId) ?? null} onSave={onSaveReview} />}
          </article>
        })}</div>}
  </>
}

function LocalIntelligenceDetail({ item, detail, detailState, review, reviewLoadState, reviewWriteDisabled, reviewSaving, reviewSaveFailure, onSaveReview, onBack }: {
  item: LocalAIHOTIntelligenceItem
  detail: LocalAIHOTDetailItem | null
  detailState: LoadState
  review: LocalAIHOTReview | null
  reviewLoadState: LocalReviewLoadState
  reviewWriteDisabled: boolean
  reviewSaving: boolean
  reviewSaveFailure: string | null
  onSaveReview: (request: LocalAIHOTReviewWriteRequest) => Promise<boolean>
  onBack: () => void
}) {
  const value = detail ?? { ...item, excerpt: null, bodyText: null, contentTruncated: false, structure: null, analysisCreatedAt: null }
  return <div className={css.detailPage} data-radar-route="/radar/ai/local">
    <button className={css.backButton} type="button" onClick={onBack}>← <span>返回我的情报</span></button>
    <header className={css.detailHeader}><div><span className={css.detailEyebrow}>本地 AIHOT Article / Analysis</span><span className={css.intelligenceBadge} data-state={item.intelligenceState}>{intelligenceStateLabel(item.intelligenceState)}</span><h1>{item.title}</h1></div><div className={css.sourceMeta}><span>来源</span><strong>{item.source}</strong><span>发布时间</span><time>{formatTime(item.publishedAt)}</time></div></header>
    <div className={css.localDetailLayout}>
      <div className={css.detailMain}>
        {detailState === 'loading' && <p className={css.emptyState} role="status">正在读取本地情报详情…</p>}
        {detailState === 'unavailable' && <p className={css.emptyState} role="alert">本地情报详情暂不可用。</p>}
        {detailState === 'ready' && <>
        {value.summary !== null && <section className={css.summarySection}><div className={css.contentHeading}><span className={css.sectionIndex}>01</span><div><h2>AIHOT 摘要</h2><p>来自已持久化 Analysis；不是原始来源文本</p></div></div><p className={css.readableContent}>{value.summary}</p></section>}
        {value.analysisId === null && value.intelligenceState === 'pending_analysis' && <p className={css.notAnalyzedNotice}>待分析 · 尚未完成 AIHOT 分析</p>}
        {value.intelligenceState === 'blocked' && <p className={css.notAnalyzedNotice}>阻断原因 · {value.prefilterReason ?? '当前数据未提供阻断说明'}</p>}
        {(value.bodyText !== null || value.excerpt !== null) && <section className={css.sourceContentSection}><div className={css.contentHeading}><span className={css.sectionIndex}>{value.summary === null ? '01' : '02'}</span><div><h2>{value.contentBasis === 'body' ? '正文内容' : 'Feed 摘录'}</h2><p>{value.contentBasis === 'body' ? '已持久化正文' : '来源摘录 · 不代表完整正文'}</p></div></div><p className={css.readableContent}>{value.contentBasis === 'body' ? value.bodyText : value.excerpt}{detail?.contentTruncated ? ' …（内容已截断）' : ''}</p></section>}
        {value.analysisId !== null && <section className={css.analysisSection}><div className={css.contentHeading}><span className={css.sectionIndex}>03</span><div><h2>AIHOT 判断</h2><p>与我的人工判断分开保存 · 来自 Analysis</p></div></div><div className={css.localFacts}>{[
          ['AIHOT Score', value.score], ['Selected', value.selected === null ? null : value.selected ? '是' : '否'],
          ['预筛', value.prefilterLabel === null ? null : `${value.prefilterLabel}${value.prefilterReason ? ` · ${value.prefilterReason}` : ''}`],
          ['分类', value.category ?? '未归类'], ['标签', value.tags.length ? value.tags.join('、') : null], ['Item Type', value.itemType], ['选择理由', value.selectionReason],
        ].filter((entry): entry is [string, string | number] => entry[1] !== null).map(([label, fact]) => <div key={label}><span>{label}</span><strong>{fact}</strong></div>)}</div></section>}
        {detail?.structure?.fact != null && <section className={css.evidenceCard}><h2>核心事实</h2><dl className={css.structuredFacts}>{factEntries(detail.structure.fact).map(([label, fact]) => <div key={label}><dt>{label}</dt><dd>{fact}</dd></div>)}</dl></section>}
        </>}
      </div>
      <aside className={css.detailAside}>
        {detailState === 'ready' && value.reviewable && <LocalHumanReviewPanel articleId={item.articleId} review={review} loadState={reviewLoadState} disabled={reviewWriteDisabled} saving={reviewSaving} failureMessage={reviewSaveFailure} onSave={onSaveReview} />}
        {detailState === 'ready' && <section className={css.relationSection}><div className={css.asideHeading}><h2>来源记录</h2><span>LOCAL DATA</span></div><div className={css.relationRow}><span>正文状态</span><strong>{item.bodyStatus}</strong></div><details className={css.technicalDetails}><summary>技术详情</summary><div className={css.relationRow}><span>Article ID</span><strong>{item.articleId}</strong></div><div className={css.relationRow}><span>Analysis ID</span><strong>{item.analysisId ?? '未生成'}</strong></div></details><a className={css.externalLink} href={item.url} target="_blank" rel="noopener noreferrer">打开来源文章 ↗</a></section>}
      </aside>
    </div>
  </div>
}

function ReviewQuickActions({ item, review, disabled, saving, failureMessage, onSave }: {
  item: LocalAIHOTIntelligenceItem
  review: LocalAIHOTReview | null
  disabled: boolean
  saving: boolean
  failureMessage: string | null
  onSave: (request: LocalAIHOTReviewWriteRequest) => Promise<boolean>
}) {
  async function choose(verdict: LocalAIHOTReviewVerdict): Promise<void> {
    await onSave({ articleId: item.articleId, verdict, reasons: review?.reasons ?? [], note: review?.note ?? '' })
  }
  return <div className={css.localReviewControls} aria-label={`人工判断：${item.title}`}>
    <span className={css.localReviewStatus}>{saving ? '保存中…' : review === null ? '待判断' : `我的判断 · ${reviewVerdictLabel(review.verdict)}`}</span>
    <div className={css.humanVerdictButtons}>
      {(['KEEP', 'MAYBE', 'DROP'] as const).map(verdict => <button key={verdict} type="button" data-selected={review?.verdict === verdict} disabled={disabled || saving} onClick={() => { void choose(verdict) }}>{reviewVerdictLabel(verdict)}</button>)}
    </div>
    {failureMessage !== null && <span className={css.reviewSaveError} role="alert">{failureMessage}</span>}
  </div>
}

function LocalHumanReviewPanel({ articleId, review, loadState, disabled, saving, failureMessage, onSave }: {
  articleId: string
  review: LocalAIHOTReview | null
  loadState: LocalReviewLoadState
  disabled: boolean
  saving: boolean
  failureMessage: string | null
  onSave: (request: LocalAIHOTReviewWriteRequest) => Promise<boolean>
}) {
  const [draftReasons, setDraftReasons] = useState<readonly LocalAIHOTReviewReason[]>(review?.reasons ?? [])
  const [draftNote, setDraftNote] = useState(review?.note ?? '')
  const [draftDirty, setDraftDirty] = useState(false)
  useEffect(() => {
    setDraftReasons(review?.reasons ?? [])
    setDraftNote(review?.note ?? '')
    setDraftDirty(false)
  }, [review])

  async function save(verdict: LocalAIHOTReviewVerdict, reasons: readonly LocalAIHOTReviewReason[], note: string): Promise<void> {
    const saved = await onSave({ articleId, verdict, reasons, note })
    if (!saved) {
      setDraftReasons(review?.reasons ?? [])
      setDraftNote(review?.note ?? '')
      setDraftDirty(false)
    }
  }

  return <section className={css.actionSection} aria-labelledby="human-review-heading">
    <div className={css.asideHeading}><h2 id="human-review-heading">我的判断</h2><span>{loadState === 'unavailable' ? '暂不可用' : loadState === 'loading' ? '读取中' : review === null ? '待判断' : '已保存'}</span></div>
    {loadState === 'unavailable' && <p className={css.reviewOfflineNotice} role="status">本地 AI 情报暂不可用，当前判断无法保存</p>}
    {loadState === 'loading' && <p className={css.inlineHint} role="status">正在读取已保存的判断…</p>}
    <div className={css.humanVerdictButtons}>
      {(['KEEP', 'MAYBE', 'DROP'] as const).map(verdict => <button key={verdict} type="button" data-selected={review?.verdict === verdict} disabled={disabled || loadState !== 'ready' || saving} onClick={() => { void save(verdict, review?.reasons ?? [], review?.note ?? '') }}>{reviewVerdictLabel(verdict)}</button>)}
    </div>
    {review !== null && <p className={css.reviewSavedAt}>已保存 · {formatTime(review.updatedAt)}</p>}
    {reviewSaveStatus(loadState, review) && <p className={css.inlineHint}>{reviewSaveStatus(loadState, review)}</p>}
    {failureMessage !== null && <p className={css.reviewSaveError} role="alert">{failureMessage}</p>}
    <div className={css.reviewReasonBlock}>
      <span className={css.reviewFieldLabel}>原因（可选）</span>
      <div className={css.reviewReasonChoices}>{REVIEW_REASONS.map(reason => <button key={reason} type="button" data-selected={draftReasons.includes(reason)} disabled={disabled || review?.verdict === undefined || saving} onClick={() => {
        setDraftReasons(current => current.includes(reason) ? current.filter(item => item !== reason) : [...current, reason])
        setDraftDirty(true)
      }}>{reviewReasonLabel(reason)}</button>)}</div>
    </div>
    <label className={css.reviewNoteField}><span className={css.reviewFieldLabel}>备注（可选）</span><textarea value={draftNote} maxLength={2000} disabled={disabled || review?.verdict === undefined || saving} onChange={event => { setDraftNote(event.target.value); setDraftDirty(true) }} /></label>
    <button className={css.reviewSaveDetails} type="button" disabled={disabled || review?.verdict === undefined || !draftDirty || saving} onClick={() => { if (review !== null) void save(review.verdict, draftReasons, draftNote) }}>{saving ? '保存中…' : '保存原因与备注'}</button>
    {disabled && loadState !== 'unavailable' && <p className={css.inlineHint}>{loadState === 'ready' ? '当前不可写入。' : '正在确认本地情报状态，暂不能保存。'}</p>}
  </section>
}

function reviewVerdictLabel(verdict: LocalAIHOTReviewVerdict): string {
  switch (verdict) {
    case 'KEEP': return '保留'
    case 'MAYBE': return '一般'
    case 'DROP': return '丢弃'
  }
}

function intelligenceStateLabel(state: LocalAIHOTIntelligenceItem['intelligenceState']): string {
  switch (state) {
    case 'pending_analysis': return '待分析'
    case 'pending_review': return '待判断'
    case 'kept': return '已保留'
    case 'maybe': return '一般'
    case 'dropped': return '已丢弃'
    case 'blocked': return '已阻断'
    case 'failed': return '分析失败'
  }
}

function pendingArticleStatusText(status: LocalAIHOTPendingRun['items'][number]['status']): string {
  switch (status) {
    case 'waiting': return '等待处理'
    case 'fetching_content': return '正在获取内容'
    case 'analyzing': return '正在分析'
    case 'pending_review': return '待判断'
    case 'blocked': return '已阻断'
    case 'failed': return '分析失败'
    case 'interrupted': return '服务重启时中断'
  }
}

function pendingActionStatusText(status: string): string {
  switch (status) {
    case 'already_processing': return '所选文章已有受控批次正在处理。'
    case 'not_pending': return '所选文章状态已变化；请刷新列表后重新选择。'
    case 'protected_receipt': return '所选文章关联受保护回执，已阻止本次处理。'
    case 'invalid_request': return '选择已失效；请刷新后重新选择。'
    default: return '本地受控处理暂不可用；请求状态未知时请通过相同请求标识恢复，不要另起批次。'
  }
}

function pendingRunStatusText(status: LocalAIHOTPendingRun['status']): string {
  switch (status) {
    case 'running': return '处理中'
    case 'completed': return '已完成'
    case 'failed': return '失败'
    case 'safety_stopped': return '安全停止'
    case 'interrupted': return '已中断（不会自动恢复）'
  }
}

function factEntries(value: unknown): readonly (readonly [string, string])[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [['信息', formatFact(value)]]
  return Object.entries(value as Record<string, unknown>).map(([label, fact]) => [label, formatFact(fact)] as const)
}

function formatFact(value: unknown): string {
  if (value === null) return '—'
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(formatFact).join('、')
  if (typeof value === 'object') return Object.entries(value as Record<string, unknown>).map(([key, fact]) => `${key}：${formatFact(fact)}`).join('；')
  return ''
}

function reviewReasonLabel(reason: LocalAIHOTReviewReason): string {
  switch (reason) {
    case 'RELEVANT': return '相关'
    case 'ACTIONABLE': return '可行动'
    case 'CONTENT_WORTHY': return '值得成稿'
    case 'TOOL_WORTH_TRYING': return '值得试用工具'
    case 'BUSINESS_SIGNAL': return '商业信号'
    case 'TOO_GENERIC': return '过于泛泛'
    case 'PR_NOISE': return '公关噪音'
    case 'DUPLICATE': return '重复'
    case 'LOW_VALUE': return '价值较低'
  }
}

function reviewSaveStatus(state: LocalReviewLoadState, review: LocalAIHOTReview | null): string | null {
  if (state === 'unavailable' && review !== null) return `以下为上次读取的判断 · ${formatTime(review.updatedAt)}`
  if (state === 'unavailable') return '人工判断暂不可用。'
  return null
}

type ScysArea = 'today' | 'search' | 'projects' | 'comments'

type AipojuPageState = 'idle' | 'loading' | 'ready' | 'empty' | 'auth_required' | 'error'

/** Read-only AI 破局俱乐部 page backed by the native private Shell bridge. */
function AipojuRadar({ active }: { readonly active: boolean }) {
  const [keyword, setKeyword] = useState('')
  const [homeFeed, setHomeFeed] = useState<AipojuHomeFeed | null>(null)
  const [searchTopics, setSearchTopics] = useState<readonly AipojuTopic[]>([])
  const [searchMode, setSearchMode] = useState(false)
  const [selected, setSelected] = useState<AipojuTopic | null>(null)
  const [homeState, setHomeState] = useState<AipojuPageState>('idle')
  const [searchState, setSearchState] = useState<AipojuPageState>('idle')
  const [detailState, setDetailState] = useState<AipojuPageState>('idle')
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [homeRefreshing, setHomeRefreshing] = useState(false)
  const homeFeedRef = useRef<AipojuHomeFeed | null>(null)
  const requestId = useRef(0)
  const homeRequest = useRef<Promise<void> | null>(null)

  const loadHome = useCallback(async (refresh = false): Promise<void> => {
    if (homeRequest.current !== null) return await homeRequest.current
    const previousFeed = homeFeedRef.current
    if (previousFeed === null) setHomeState('loading')
    setHomeRefreshing(true)
    setErrorCode(null)
    const pending = (async (): Promise<void> => {
      const result = await aipojuRadarClient.list(refresh)
      if (result.status === 'ready') {
        homeFeedRef.current = result.value
        setHomeFeed(result.value)
        setHomeState(result.value.featured.length + result.value.latest.length > 0 ? 'ready' : 'empty')
        setErrorCode(result.value.refreshErrorCode)
      } else if (result.status === 'auth_required') {
        if (previousFeed !== null) {
          const stale = { ...previousFeed, stale: true, refreshErrorCode: 'AUTH_REQUIRED' }
          homeFeedRef.current = stale; setHomeFeed(stale); setHomeState('ready')
        } else setHomeState('auth_required')
        setErrorCode(null)
      } else if (result.status === 'empty') {
        homeFeedRef.current = null; setHomeFeed(null); setHomeState('empty'); setErrorCode(null)
      } else {
        if (previousFeed !== null) {
          const stale = { ...previousFeed, stale: true, refreshErrorCode: result.errorCode }
          homeFeedRef.current = stale; setHomeFeed(stale); setHomeState('ready')
        } else setHomeState('error')
        setErrorCode(result.errorCode)
      }
    })()
    homeRequest.current = pending
    try { await pending } finally {
      if (homeRequest.current === pending) homeRequest.current = null
      setHomeRefreshing(false)
    }
  }, [])

  useEffect(() => {
    if (active) void loadHome()
  }, [active, loadHome])

  const search = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    const current = ++requestId.current
    setSearchMode(true); setSearchState('loading'); setErrorCode(null); setSelected(null); setDetailState('idle')
    const result = await aipojuRadarClient.search(keyword)
    if (current !== requestId.current) return
    if (result.status === 'ready') { setSearchTopics(result.value); setSearchState('ready'); setErrorCode(null) }
    else if (result.status === 'empty') { setSearchTopics([]); setSearchState('empty'); setErrorCode(null) }
    else if (result.status === 'auth_required') { setSearchState('auth_required'); setErrorCode(null) }
    else { setSearchState('error'); setErrorCode(result.errorCode) }
  }

  const openTopic = async (topic: AipojuTopic): Promise<void> => {
    const current = ++requestId.current
    setSelected(topic); setDetailState('loading'); setErrorCode(null)
    const result = await aipojuRadarClient.detail(topic.topicId)
    if (current !== requestId.current) return
    if (result.status === 'ready') { setSelected(result.value); setDetailState('ready') }
    else if (result.status === 'auth_required') { setDetailState('auth_required') }
    else if (result.status === 'empty') { setDetailState('empty') }
    else { setDetailState('error'); setErrorCode(result.errorCode) }
  }

  return <section className={css.workspacePage} data-radar-route="/radar/aipoju">
    <header className={css.pageHeader}>
      <div><span className={css.pageEyebrow} data-accent="aipoju">AIPOJU CLUB</span><h1>AI 破局俱乐部</h1><p>真实主题首页；精选为本地排序，最新动态按官方发布时间排列。</p></div>
      <span className={css.awaitingBadge}>{homeFeed?.stale === true ? '缓存内容' : homeState === 'ready' || homeState === 'empty' ? '已连接' : homeState === 'auth_required' ? '需要授权' : homeState === 'error' ? '暂不可用' : '连接检查中'}</span>
    </header>
    {selected === null && <>
      <form className={css.aipojuSearchForm} onSubmit={(event) => { void search(event) }}>
        <label className={css.aipojuSearchLabel} htmlFor="aipoju-keyword">搜索主题</label>
        <input id="aipoju-keyword" className={css.aipojuSearchInput} value={keyword} onChange={(event) => { setKeyword(event.currentTarget.value) }} maxLength={80} placeholder="输入关键词" />
        <button className={css.aipojuAction} type="submit" disabled={searchState === 'loading' || homeRefreshing || keyword.trim().length === 0}>搜索</button>
        {searchMode && <button className={css.aipojuQuietAction} type="button" onClick={() => { setSearchMode(false); setSearchState('idle'); setErrorCode(null) }}>返回首页</button>}
        <button className={css.aipojuQuietAction} type="button" onClick={() => { void loadHome(true) }} disabled={homeRefreshing}>刷新</button>
      </form>
      {searchMode
        ? <>
          <div className={css.aipojuSectionHeading}><div><h2>搜索结果</h2><p>最多显示20条官方 CLI 返回内容。</p></div></div>
          <AipojuPageNotice state={searchState} errorCode={errorCode} />
          {searchState === 'ready' && <div className={css.aipojuSearchResults}>{searchTopics.map(topic => <AipojuTopicCard key={topic.topicId} topic={topic} onOpen={() => { void openTopic(topic) }} />)}</div>}
        </>
        : <>
          {homeFeed?.stale === true && <p className={css.aipojuStaleNotice} role="status">刷新失败，正在展示 {formatTime(homeFeed.fetchedAt)} 的缓存内容{homeFeed.refreshErrorCode === null ? '' : `（${homeFeed.refreshErrorCode}）`}。</p>}
          <AipojuPageNotice state={homeState} errorCode={homeFeed?.stale === true ? null : errorCode} />
          {homeFeed !== null && <>
            <section className={css.aipojuFeedSection} aria-labelledby="aipoju-featured-heading">
              <div className={css.aipojuSectionHeading}><div><h2 id="aipoju-featured-heading">本周精选</h2><p>近7天内容的本地排序：时间、真实互动与内容完整度；非平台官方精选。</p></div><span>{homeFeed.featured.length} 篇</span></div>
              {homeFeed.featured.length > 0
                ? <div className={css.aipojuFeaturedGrid}>{homeFeed.featured.map(topic => <AipojuFeaturedCard key={topic.topicId} topic={topic} onOpen={() => { void openTopic(topic) }} />)}</div>
                : <p className={css.aipojuFeedEmpty}>近7天没有可验证发布时间的主题。</p>}
            </section>
            <section className={css.aipojuFeedSection} aria-labelledby="aipoju-latest-heading">
              <div className={css.aipojuSectionHeading}><div><h2 id="aipoju-latest-heading">最新动态</h2><p>{formatAipojuTimeRange(homeFeed.latest)}</p></div><span>{homeFeed.latest.length} 条</span></div>
              {homeFeed.latest.length > 0
                ? <div className={css.aipojuLatestList}>{homeFeed.latest.map(topic => <AipojuTopicRow key={topic.topicId} topic={topic} onOpen={() => { void openTopic(topic) }} />)}</div>
                : <p className={css.aipojuFeedEmpty}>没有更多不同主题。</p>}
            </section>
            <p className={css.aipojuFeedFootnote}>首页共读取 {homeFeed.candidateCount} 条真实候选；列表缓存在本机内存约15分钟。</p>
          </>}
        </>}
      </>}
    {selected !== null
      ? <article className={css.aipojuDetail}>
        <button className={css.backButton} type="button" onClick={() => { setSelected(null); setDetailState('idle'); setErrorCode(null) }}>← <span>返回主题列表</span></button>
        <header className={css.detailHeader}><div><span className={css.detailEyebrow}>AI 破局俱乐部 · 官方主题</span><h1>{aipojuTopicTitle(selected)}</h1></div></header>
        <div className={css.aipojuMeta}><span>作者：{selected.author ?? '未提供'}</span><span>发布时间：{formatTime(selected.createdAt)}</span>{aipojuInteractionLabels(selected.interactionCounts).map(value => <span key={value}>{value}</span>)}</div>
        {detailState === 'loading' && <p className={css.emptyState} role="status">正在读取主题详情…</p>}
        {detailState === 'auth_required' && <p className={css.aipojuNotice} role="alert">CLI 认证不可用，请在 Terminal 检查官方 CLI 登录状态。</p>}
        {detailState === 'error' && <p className={css.aipojuNotice} role="alert">主题详情暂时不可用{errorCode === null ? '' : `（${errorCode}）`}，请稍后再试。</p>}
        {detailState === 'empty' && <p className={css.emptyState}>官方 CLI 未返回该主题详情。</p>}
        {detailState === 'ready' && <>
          {selected.content !== null && <section className={css.aipojuBody} aria-label="主题正文"><h2>正文</h2><p>{formatAipojuContent(selected.content) || '官方数据未提供正文。'}</p></section>}
          {selected.images !== null && selected.images.length > 0 && <div className={css.aipojuImages}>{selected.images.map((image, index) => <AipojuImage key={`${selected.topicId}-${index}`} src={image} index={index} />)}</div>}
          {selected.interactionCounts !== null && <section className={css.aipojuInteractions} aria-label="互动数据"><h2>互动数据</h2>{Object.entries(selected.interactionCounts).map(([label, count]) => <span key={label}>{formatAipojuCount(label, count)}</span>)}</section>}
          {selected.sourceUrl !== null && <a className={css.aipojuOfficialLink} href={selected.sourceUrl} target="_blank" rel="noreferrer">打开官网原文 <span aria-hidden="true">↗</span></a>}
        </>}
      </article>
      : null}
  </section>
}

function AipojuPageNotice({ state, errorCode }: { readonly state: AipojuPageState; readonly errorCode: string | null }) {
  if (state === 'loading' || state === 'idle') return <p className={css.emptyState} role="status">正在读取俱乐部主题…</p>
  if (state === 'auth_required') return <p className={css.aipojuNotice} role="alert">官方 CLI 认证不可用。请在 Terminal 完成检查后再重试；工作台不会读取或显示凭据。</p>
  if (state === 'error') return <p className={css.aipojuNotice} role="alert">主题读取失败{errorCode === null ? '' : `（${errorCode}）`}，请稍后再试。</p>
  if (state === 'empty') return <p className={css.emptyState}>没有找到主题。</p>
  return null
}

function AipojuTopicRow({ topic, onOpen }: { readonly topic: AipojuTopic; readonly onOpen: () => void }) {
  const title = aipojuTopicTitle(topic)
  const excerpt = formatAipojuExcerpt(topic.content, title)
  return <button className={css.aipojuTopicRow} type="button" onClick={onOpen}>
    {topic.images?.[0] !== undefined && <AipojuFeedImage key={`${topic.topicId}-${topic.images[0]}`} topic={topic} src={topic.images[0]} variant="row" />}
    <span className={css.aipojuTopicMain}><strong>{title}</strong>{excerpt.length > 0 && <span>{excerpt}</span>}<small>{topic.author ?? '作者未提供'} · {formatTime(topic.createdAt)} · {aipojuInteractionLabels(topic.interactionCounts).join(' · ') || '互动数据未提供'}</small></span>
    <span className={css.rowArrow} aria-hidden="true">↗</span>
  </button>
}

function AipojuFeaturedCard({ topic, onOpen }: { readonly topic: AipojuTopic; readonly onOpen: () => void }) {
  const title = aipojuTopicTitle(topic)
  const excerpt = formatAipojuExcerpt(topic.content, title, 180)
  return <button className={css.aipojuFeaturedCard} type="button" onClick={onOpen}>
    <span className={css.aipojuFeaturedBody}><strong>{title}</strong>{excerpt.length > 0 && <span>{excerpt}</span>}<small>{topic.author ?? '作者未提供'} · {formatTime(topic.createdAt)}</small><small>{aipojuInteractionLabels(topic.interactionCounts).join(' · ') || '互动数据未提供'}</small></span>
    {topic.images?.[0] !== undefined && <AipojuFeedImage key={`${topic.topicId}-${topic.images[0]}`} topic={topic} src={topic.images[0]} variant="featured" />}
  </button>
}

function AipojuTopicCard({ topic, onOpen }: { readonly topic: AipojuTopic; readonly onOpen: () => void }) {
  const title = aipojuTopicTitle(topic)
  const excerpt = formatAipojuExcerpt(topic.content, title)
  return <button className={css.aipojuTopicCard} type="button" onClick={onOpen}>
    {topic.images?.[0] !== undefined && <AipojuFeedImage key={`${topic.topicId}-${topic.images[0]}`} topic={topic} src={topic.images[0]} variant="card" />}
    <span className={css.aipojuTopicCardBody}><strong>{title}</strong>{excerpt.length > 0 && <span>{excerpt}</span>}<small>{topic.author ?? '作者未提供'} · {formatTime(topic.createdAt)}</small><small>{aipojuInteractionLabels(topic.interactionCounts).join(' · ') || '互动数据未提供'}</small></span>
  </button>
}

function AipojuFeedImage({ topic, src, variant }: { readonly topic: AipojuTopic; readonly src: string; readonly variant: 'card' | 'featured' | 'row' }) {
  const [failed, setFailed] = useState(false)
  const imageClass = variant === 'card' ? css.aipojuCardImage : variant === 'featured' ? css.aipojuFeaturedImage : css.aipojuRowImage
  if (failed) return null
  return <img className={imageClass} src={src} alt={`${aipojuTopicTitle(topic)}配图`} loading="lazy" onError={() => { setFailed(true) }} />
}

function aipojuTopicTitle(topic: AipojuTopic): string {
  const title = topic.title.trim()
  if (title.length > 0) return title
  const summary = formatAipojuExcerpt(topic.content, '', 56)
  return summary.length > 0 ? summary : '未提供标题和摘要'
}

function formatAipojuExcerpt(content: string | null, title: string, maxLength = 110): string {
  const paragraphs = formatAipojuContent(content).split(/\n+/gu).map(line => line.trim()).filter(Boolean)
  const normalizedTitle = normalizeAipojuText(title)
  if (normalizedTitle.length > 0 && paragraphs.length > 0) {
    for (let index = 0; index < Math.min(3, paragraphs.length);) {
      const paragraph = paragraphs[index] as string
      const normalizedParagraph = normalizeAipojuText(paragraph)
      const sharedPrefixLength = aipojuSharedPrefixLength(normalizedParagraph, normalizedTitle)
      const shorterLength = Math.min(normalizedParagraph.length, normalizedTitle.length)
      const titleOverlap = shorterLength >= 16 && sharedPrefixLength / shorterLength >= 0.8
      if (normalizedParagraph === normalizedTitle || (titleOverlap && (normalizedTitle.startsWith(normalizedParagraph) || normalizedParagraph.startsWith(normalizedTitle)))) {
        paragraphs.splice(index, 1)
        continue
      }
      index += 1
    }
    const first = paragraphs[0]
    if (first !== undefined) {
      const normalizedFirst = normalizeAipojuText(first)
      const sharedPrefixLength = aipojuSharedPrefixLength(normalizedFirst, normalizedTitle)
      const shorterLength = Math.min(normalizedFirst.length, normalizedTitle.length)
      const titleOverlap = shorterLength >= 16 && sharedPrefixLength / shorterLength >= 0.8
      if (titleOverlap && normalizedFirst.startsWith(normalizedTitle)) {
        const remainder = stripAipojuTitlePrefix(first, normalizedTitle)
        if (remainder.length > 0) paragraphs[0] = remainder
        else paragraphs.shift()
      }
    }
  }
  let text = paragraphs.join(' ').replace(/\s+/gu, ' ').trim()
  while (normalizedTitle.length > 0 && normalizeAipojuText(text).startsWith(normalizedTitle)) {
    text = stripAipojuTitlePrefix(text, normalizedTitle)
  }
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength).trimEnd()}…`
}

function aipojuSharedPrefixLength(left: string, right: string): number {
  const limit = Math.min(left.length, right.length)
  let index = 0
  while (index < limit && left[index] === right[index]) index += 1
  return index
}

function normalizeAipojuText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}\p{S}\p{Cf}]+/gu, '')
}

function stripAipojuTitlePrefix(value: string, normalizedTitle: string): string {
  let normalizedLength = 0
  let index = 0
  while (index < value.length && normalizedLength < normalizedTitle.length) {
    const codePoint = value.codePointAt(index)
    if (codePoint === undefined) break
    const character = String.fromCodePoint(codePoint)
    index += character.length
    normalizedLength += normalizeAipojuText(character).length
  }
  return value.slice(index).replace(/^[\s\p{P}\p{S}]+/u, '').trim()
}

function aipojuInteractionLabels(counts: Readonly<Record<string, number>> | null): string[] {
  if (counts === null) return []
  return Object.entries(counts).slice(0, 3).map(([key, count]) => formatAipojuCount(key, count))
}

function formatAipojuCount(key: string, count: number): string {
  const label = key === 'likes' || key === 'likeCount' || key === 'totalLikeCount' ? '赞'
    : key === 'comments' || key === 'commentCount' || key === 'totalCommentCount' ? '评论'
      : key === 'collections' || key === 'collectCount' || key === 'collectionCount' || key === 'totalCollectionCount' || key === 'favoriteCount' ? '收藏' : key
  return `${label} ${new Intl.NumberFormat('zh-CN').format(count)}`
}

function formatAipojuTimeRange(topics: readonly AipojuTopic[]): string {
  const timestamps = topics.map(topic => topic.createdAt === null ? Number.NaN : Date.parse(topic.createdAt)).filter(Number.isFinite).sort((left, right) => left - right)
  if (timestamps.length === 0) return '发布时间未提供'
  const format = (timestamp: number): string => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric' }).format(timestamp)
  return timestamps.length === 1 ? `发布时间 ${format(timestamps[0] as number)}` : `${format(timestamps[0] as number)}—${format(timestamps[timestamps.length - 1] as number)}`
}

function AipojuImage({ src, index }: { readonly src: string; readonly index: number }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <div className={css.aipojuImageFallback} role="img" aria-label={`图片 ${index + 1} 无法加载`}>图片暂不可用</div>
  return <img className={css.aipojuImage} src={src} alt={`主题图片 ${index + 1}`} loading="lazy" onError={() => { setFailed(true) }} />
}

function formatAipojuContent(value: string | null): string {
  if (value === null) return ''
  const text = value
    .replace(/<!--[\s\S]*?-->/gu, '')
    .replace(/<(script|style|iframe|object|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/giu, '')
    .replace(/<br\s*\/?\s*>/giu, '\n')
    .replace(/<\/(?:p|div|li|h[1-6]|blockquote|section|article|tr)\s*>/giu, '\n')
    .replace(/<(?:p|div|li|h[1-6]|blockquote|section|article|tr)\b[^>]*>/giu, '\n')
    .replace(/<\/?[a-z][a-z\d:-]*\b[^>]*>/giu, '')
    .replace(/&(#(?:x[\da-f]{1,6}|\d{1,7})|[a-z][a-z\d]{1,31});/giu, decodeAipojuEntity)
  const lines = text.replace(/\r\n?/gu, '\n').split('\n')
  const readableLines = lines.map(line => line.replace(/[\t ]+/gu, ' ').trim())
  return readableLines.join('\n').replace(/\n{3,}/gu, '\n\n').trim()
}

function decodeAipojuEntity(entity: string, reference: string): string {
  const named: Readonly<Record<string, string>> = {
    amp: '&', apos: "'", copy: '©', gt: '>', hellip: '…', ldquo: '“', lsquo: '‘',
    lt: '<', mdash: '—', nbsp: ' ', ndash: '–', quot: '"', rdquo: '”', reg: '®', rsquo: '’',
  }
  if (!reference.startsWith('#')) return named[reference.toLowerCase()] ?? entity
  const codePoint = reference[1]?.toLowerCase() === 'x' ? Number.parseInt(reference.slice(2), 16) : Number.parseInt(reference.slice(1), 10)
  if (!Number.isInteger(codePoint) || codePoint <= 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) return entity
  return String.fromCodePoint(codePoint)
}

/** Read-only SCYS source page; every source operation is a fixed Workbench Host method. */
function ScysRadar({ active, dataClient }: { readonly active: boolean; readonly dataClient?: ScysRadarClient }) {
  const [area, setArea] = useState<ScysArea>('today')
  const [sourceStatus, setSourceStatus] = useState<ScysSourceStatusResult['status']>('error')
  const [sourceDiagnostic, setSourceDiagnostic] = useState<ScysReconnectDiagnostic | null>(null)
  const [keyword, setKeyword] = useState('AI')
  const [projectKeyword, setProjectKeyword] = useState('AI')
  const [todayFeed, setTodayFeed] = useState<ScysTodayFeed | null>(null)
  const [todayLoadError, setTodayLoadError] = useState<string | null>(null)
  const [contentItems, setContentItems] = useState<readonly ScysContentSummary[]>([])
  const [projectItems, setProjectItems] = useState<readonly ScysProjectSummary[]>([])
  const [selectedContent, setSelectedContent] = useState<ScysContentSummary | null>(null)
  const [contentDetail, setContentDetail] = useState<ScysContentSummary | null>(null)
  const [projectDetail, setProjectDetail] = useState<ScysProjectSummary | null>(null)
  const [comments, setComments] = useState<readonly import('@deepseek-ai/dsh-business-workbench/types').ScysComment[]>([])
  const [commentLoadState, setCommentLoadState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const todayRequest = useRef<Promise<void> | null>(null)
  useEffect(() => {
    if (!active || dataClient === undefined) return
    let live = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = async (): Promise<void> => {
      const result = await dataClient.getSourceStatus().catch((): ScysSourceStatusResult => ({ status: 'error' }))
      if (!live) return
      setSourceStatus(result.status)
      setSourceDiagnostic(result.diagnostic ?? null)
      if (result.status === 'connecting') timer = setTimeout(() => { void refresh() }, 1400)
    }
    void refresh()
    return () => { live = false; if (timer !== undefined) clearTimeout(timer) }
  }, [active, dataClient])

  const connect = async (): Promise<void> => {
    if (dataClient === undefined) { setSourceStatus('error'); return }
    setMessage(null)
    const result = await dataClient.connect().catch((): ScysSourceStatusResult => ({ status: 'error' }))
    setSourceStatus(result.status)
    setSourceDiagnostic(result.diagnostic ?? null)
  }

  const refreshToday = async (forceRefresh = false): Promise<void> => {
    if (dataClient === undefined || sourceStatus !== 'connected') return
    if (todayRequest.current !== null) return await todayRequest.current
    setLoading(true); setMessage(null); setTodayLoadError(null)
    const pending = (async (): Promise<void> => {
      const results: Partial<Record<ScysFeedMode, ScysFeedQueryResult>> = {}
      // Keep the three fixed upstream reads sequential; the Host cache and singleflight also cover repeated IPC calls.
      for (const mode of ['digested', 'hot', 'recent'] as const) {
        results[mode] = await aipojuRadarClient.queryScysFeed(mode, forceRefresh).catch(() => ({ status: 'SCYS_MCP_UNAVAILABLE' as const }))
      }
      const failures = Object.values(results).filter((result): result is Extract<ScysFeedQueryResult, { readonly status: string }> => result !== undefined && result.status !== 'ready' && result.status !== 'empty')
      const successful = Object.values(results).filter((result): result is Extract<ScysFeedQueryResult, { readonly status: 'ready' | 'empty' }> => result !== undefined && (result.status === 'ready' || result.status === 'empty'))
      if (successful.length === 0) {
        const error = failures[0]?.status ?? 'SCYS_FEED_QUERY_ERROR'
        setTodayLoadError(scysFeedErrorMessage(error))
        return
      }
      const query = (mode: ScysFeedMode) => results[mode]
      const featured = composeScysFeatured(query('digested'), query('hot'))
      const latest = composeScysLatest(query('recent'), featured)
      const queryInfos = successful.map(result => result.query)
      const timestamps = queryInfos.map(info => Date.parse(info.fetchedAt)).filter(Number.isFinite)
      const fetchedAt = timestamps.length === 0 ? new Date().toISOString() : new Date(Math.min(...timestamps)).toISOString()
      const refreshErrorCodes = [...new Set([
        ...failures.map(result => result.status),
        ...queryInfos.flatMap(info => info.refreshErrorCode === null ? [] : [info.refreshErrorCode]),
      ])]
      setTodayFeed({ featured, latest, fetchedAt, stale: queryInfos.some(info => info.stale) || failures.length > 0, refreshErrorCodes })
      if (featured.length + latest.length === 0) setTodayLoadError(null)
    })()
    todayRequest.current = pending
    try { await pending } finally {
      if (todayRequest.current === pending) todayRequest.current = null
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!active || area !== 'today' || sourceStatus !== 'connected' || todayFeed !== null || todayLoadError !== null) return
    void refreshToday()
  }, [active, area, sourceStatus, todayFeed, todayLoadError])

  const searchContent = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (dataClient === undefined || sourceStatus !== 'connected') return
    setLoading(true); setMessage(null); setContentDetail(null)
    const result = await dataClient.searchContent(keyword).catch(() => ({ status: 'SCYS_MCP_UNAVAILABLE' as const }))
    if (result.status === 'ready') { setContentItems(result.items); setMessage(null) }
    else if (result.status === 'empty') { setContentItems([]); setMessage(null) }
    else { setContentItems([]); setMessage(scysErrorMessage(result.status)) }
    setLoading(false)
  }

  const searchProjects = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (dataClient === undefined || sourceStatus !== 'connected') return
    setLoading(true); setMessage(null); setProjectDetail(null)
    const result = await dataClient.searchProjects(projectKeyword).catch(() => ({ status: 'SCYS_MCP_UNAVAILABLE' as const }))
    if (result.status === 'ready') setProjectItems(result.items)
    else { setProjectItems([]); setMessage(scysErrorMessage(result.status)) }
    setLoading(false)
  }

  const openContent = async (item: ScysContentSummary): Promise<void> => {
    if (dataClient === undefined || item.id === null) return
    setSelectedContent(item); setContentDetail(null); setComments([]); setCommentLoadState('idle'); setArea('comments'); setLoading(true); setMessage(null)
    const result = await dataClient.contentDetail({ entityType: item.entityType, entityId: item.entityId }).catch(() => ({ status: 'SCYS_MCP_UNAVAILABLE' as const }))
    if (result.status === 'ready') setContentDetail(result.item)
    else setMessage(scysErrorMessage(result.status))
    setLoading(false)
  }

  const openProject = async (item: ScysProjectSummary): Promise<void> => {
    if (dataClient === undefined || item.id === null) return
    setLoading(true); setMessage(null)
    const result = await dataClient.projectDetail(item.id).catch(() => ({ status: 'SCYS_MCP_UNAVAILABLE' as const }))
    if (result.status === 'ready') setProjectDetail(result.item)
    else setMessage(scysErrorMessage(result.status))
    setLoading(false)
  }

  const loadComments = async (): Promise<void> => {
    if (dataClient === undefined || selectedContent?.id === null || selectedContent === null) return
    setLoading(true); setCommentLoadState('loading'); setMessage(null)
    const result = await dataClient.loadComments({ entityType: selectedContent.entityType, entityId: selectedContent.entityId }).catch(() => ({ status: 'SCYS_MCP_UNAVAILABLE' as const }))
    if (result.status === 'ready') { setComments(result.comments); setCommentLoadState('loaded') }
    else if (result.status === 'empty') { setComments([]); setCommentLoadState('loaded') }
    else { setCommentLoadState('error'); setMessage(scysErrorMessage(result.status)) }
    setLoading(false)
  }

  const renderContentList = (values: readonly ScysContentSummary[]) => values.length === 0
    ? <p className={css.emptyState}>{loading ? '正在读取真实内容…' : '暂无已读取内容。'}</p>
    : <div className={css.signalList}>{values.map((item, index) => <button key={`${item.id ?? 'item'}-${index}`} className={css.signalRow} type="button" onClick={() => { void openContent(item) }} disabled={item.id === null}>
      <span className={css.signalBody}><strong>{item.title ?? '未提供标题'}</strong><span className={css.signalSummary}>{scysSummary(item, 180)}</span><span className={css.signalMeta}>{item.author ?? ''}{item.publishedAt === null ? '' : ` · ${formatScysDateTime(item.publishedAt)}`}{item.contentType === null ? '' : ` · ${formatScysContentType(item.contentType)}`}{scysEngagementText(item.engagement)}</span></span><span className={css.rowArrow} aria-hidden="true">↗</span>
    </button>)}</div>

  return <section className={`${css.workspacePage} ${css.xhsWorkspace}`} data-radar-route="/radar/shengcai">
    <header className={css.pageHeader}><div><span className={css.pageEyebrow} data-accent="shengcai">SHENGCAI INTELLIGENCE</span><h1>生财有术</h1><p>只展示通过官方只读能力读取的真实内容。</p></div><span className={css.awaitingBadge}>{sourceStatus === 'connected' ? '已连接' : sourceStatus === 'connecting' ? '连接中' : sourceStatus === 'expired' ? '需要重新授权' : sourceStatus === 'disconnected' ? '未连接' : '暂不可用'}</span></header>
    <div className={css.xhsSourceCard} data-status={sourceStatus}><div className={css.xhsSourceCopy}><strong>生财有术来源状态</strong><span>{sourceStatus === 'connected' ? '已连接' : sourceStatus === 'connecting' ? '请在浏览器完成授权…' : sourceStatus === 'expired' ? '授权已过期，请重新连接。' : sourceStatus === 'disconnected' ? '未连接' : '来源暂不可用'}</span>{sourceDiagnostic !== null && <><small role="status">重连诊断：阶段 {sourceDiagnostic.stage} · {sourceDiagnostic.errorCode}{sourceDiagnostic.httpStatus === null ? '' : ` · HTTP ${sourceDiagnostic.httpStatus}`} · {sourceDiagnostic.safeMessage}</small>{sourceDiagnostic.httpObservations.map((observation, index) => <small key={`${observation.phase}-${index}`}>HTTP 边界：{observation.phase} · Fetch {observation.requestAttempted ? '已调用' : '未调用'}{observation.httpStatus === null ? ' · 无响应状态' : ` · HTTP ${observation.httpStatus}`}{observation.errorType === null ? '' : ` · ${observation.errorType}`}{observation.errorCode === null ? '' : ` · ${observation.errorCode}`}</small>)}{scysTokenCallbackDiagnosticLines(sourceDiagnostic).map((line, index) => <small key={`token-callback-${index}`}>{line}</small>)}<small>错误类型：{sourceDiagnostic.errorType}{sourceDiagnostic.safeErrorCode === null ? '' : ` · ${sourceDiagnostic.safeErrorCode}`}{sourceDiagnostic.sdkErrorSourceFile === null ? '' : ` · SDK ${sourceDiagnostic.sdkErrorSourceFile}:${sourceDiagnostic.sdkErrorSourceLine ?? '未知'}`}</small></>}</div>{sourceStatus !== 'connected' && <button className={css.localRefresh} type="button" onClick={() => { void connect() }} disabled={sourceStatus === 'connecting'}>{sourceStatus === 'expired' ? '重新授权' : '连接生财有术'}</button>}</div>
    <nav className={css.categories} aria-label="生财有术情报区域">{([['today', '今日生财'], ['search', '内容搜索'], ['projects', '项目机会'], ['comments', '评论观察']] as const).map(([id, label]) => <button key={id} type="button" className={area === id ? css.categoryActive : ''} onClick={() => { setArea(id); setMessage(null) }}>{label}</button>)}</nav>
    {message !== null && <div className={css.unavailable} role="alert"><strong>{message}</strong></div>}
    {area === 'today' && <section className={css.publicDataSection}>
      <div className={css.sectionHeading}><div><h2>今日生财</h2><p>来自平台近期、精华与热门筛选条件；未返回逐篇标记，不代表官方逐篇认证。</p></div><button className={css.localRefresh} type="button" onClick={() => { void refreshToday(true) }} disabled={loading || sourceStatus !== 'connected'}>{loading ? '正在更新…' : '更新今日生财'}</button></div>
      {todayFeed?.stale === true && <p className={css.aipojuStaleNotice} role="status">当前显示 {formatTime(todayFeed.fetchedAt)} 的 Host 内存缓存{todayFeed.refreshErrorCodes.length === 0 ? '' : `；部分刷新未完成（${todayFeed.refreshErrorCodes.join('、')}）`}。</p>}
      {todayLoadError !== null && <p className={css.aipojuNotice} role="alert">{todayLoadError}</p>}
      {todayFeed !== null && <>
        <section className={css.aipojuFeedSection} aria-labelledby="scys-featured-heading">
          <div className={css.aipojuSectionHeading}><div><h2 id="scys-featured-heading">值得关注</h2><p>精华筛选优先，热门筛选补充；按筛选来源、发布时间和真实互动数据排序，不添加逐篇官方徽标。</p></div><span>{todayFeed.featured.length} 篇</span></div>
          {todayFeed.featured.length > 0 ? <div className={`${css.aipojuFeaturedGrid} ${css.scysFeedFeaturedGrid}`}>{todayFeed.featured.map(item => <ScysFeaturedCard key={scysFeedIdentity(item)} item={item} onOpen={() => { void openContent(item) }} />)}</div> : <p className={css.aipojuFeedEmpty}>近期筛选中暂无可展示内容。</p>}
        </section>
        <section className={css.aipojuFeedSection} aria-labelledby="scys-latest-heading">
          <div className={css.aipojuSectionHeading}><div><h2 id="scys-latest-heading">最新动态</h2><p>{formatScysTimeRange(todayFeed.latest)}</p></div><span>{todayFeed.latest.length} 条</span></div>
          {todayFeed.latest.length > 0 ? <div className={css.aipojuLatestList}>{todayFeed.latest.map(item => <ScysTopicRow key={scysFeedIdentity(item)} item={item} onOpen={() => { void openContent(item) }} />)}</div> : <p className={css.aipojuFeedEmpty}>近期没有更多不同文章。</p>}
        </section>
        <p className={css.aipojuFeedFootnote}>展示 {todayFeed.featured.length + todayFeed.latest.length} 篇真实文章；列表仅缓存在当前 Host 内存约15分钟。最近缓存更新时间：{formatTime(todayFeed.fetchedAt)}。</p>
      </>}
      {todayFeed === null && todayLoadError === null && <p className={css.emptyState} role="status">{loading ? '正在读取真实近期、精华与热门内容…' : sourceStatus === 'connected' ? '正在准备内容…' : '连接生财有术后自动加载真实内容。'}</p>}
    </section>}
    {area === 'search' && <section className={css.publicDataSection}><div className={css.xhsSearch}><div><h2>内容搜索</h2><p>搜索生财的真实主题与内容。</p></div><form onSubmit={event => { void searchContent(event) }}><input aria-label="搜索生财内容" value={keyword} onChange={event => setKeyword(event.target.value)} disabled={sourceStatus !== 'connected'} /><button className={css.localRefresh} type="submit" disabled={loading || sourceStatus !== 'connected'}>搜索</button></form></div>{renderContentList(contentItems)}</section>}
    {area === 'projects' && <section className={css.publicDataSection}><div className={css.xhsSearch}><div><h2>项目机会</h2><p>来自生财项目库的真实案例。</p></div><form onSubmit={event => { void searchProjects(event) }}><input aria-label="搜索项目案例" value={projectKeyword} onChange={event => setProjectKeyword(event.target.value)} disabled={sourceStatus !== 'connected'} /><button className={css.localRefresh} type="submit" disabled={loading || sourceStatus !== 'connected'}>搜索</button></form></div>{projectItems.length === 0 ? <p className={css.emptyState}>{loading ? '正在读取项目案例…' : '暂无已读取项目案例。'}</p> : <div className={css.signalList}>{projectItems.map((item, index) => <button key={`${item.id ?? 'project'}-${index}`} className={css.signalRow} type="button" onClick={() => { void openProject(item) }} disabled={item.id === null}><span className={css.signalBody}><strong>{item.title ?? '未提供名称'}</strong><span className={css.signalSummary}>{formatAipojuExcerpt(item.summary ?? item.description, item.title ?? '', 180)}</span><span className={css.signalMeta}>{item.publishedAt === null ? '' : formatScysDateTime(item.publishedAt)}{scysEngagementText(item.engagement)}</span></span><span className={css.rowArrow} aria-hidden="true">↗</span></button>)}</div>}{projectDetail !== null && <article className={css.sourceContentSection}><h2>{projectDetail.title ?? '项目详情'}</h2><p className={css.readableContent}>{projectDetail.description ?? projectDetail.summary ?? '暂无正文。'}</p>{projectDetail.url !== null && <a className={css.scysFeedCardLink} href={projectDetail.url} target="_blank" rel="noreferrer">打开生财原文 ↗</a>}</article>}</section>}
    {area === 'comments' && <section className={css.publicDataSection}><div className={css.sectionHeading}><div><h2>评论观察</h2><p>只在选择内容后读取评论；不做 AI 分析。</p></div>{selectedContent !== null && <button className={css.localRefresh} type="button" onClick={() => { void loadComments() }} disabled={commentLoadState === 'loading'}>{commentLoadState === 'loading' ? '正在加载评论…' : commentLoadState === 'loaded' ? '重新加载评论' : '加载评论'}</button>}</div>{selectedContent === null ? <p className={css.emptyState}>请先从今日生财或内容搜索选择一条内容。</p> : <><article className={css.sourceContentSection}><h2>{(contentDetail ?? selectedContent).title ?? '内容详情'}</h2><dl className={css.structuredFacts}><div><dt>作者</dt><dd>{(contentDetail ?? selectedContent).author ?? '—'}</dd></div><div><dt>发布时间</dt><dd>{(contentDetail ?? selectedContent).publishedAt === null ? '—' : formatScysDateTime((contentDetail ?? selectedContent).publishedAt)}</dd></div><div><dt>互动</dt><dd>赞 {displayCount((contentDetail ?? selectedContent).engagement.likeCount)} · 收藏 {displayCount((contentDetail ?? selectedContent).engagement.favoriteCount)} · 投锚 {displayCount((contentDetail ?? selectedContent).engagement.coinCount)} · 评论 {displayCount((contentDetail ?? selectedContent).engagement.commentCount)}</dd></div></dl><p className={`${css.readableContent} ${css.scysReadableContent}`}>{formatAipojuContent((contentDetail ?? selectedContent).content ?? (contentDetail ?? selectedContent).summary) || '暂无正文。'}</p>{(contentDetail ?? selectedContent).url !== null && <a className={css.scysFeedCardLink} href={(contentDetail ?? selectedContent).url ?? undefined} target="_blank" rel="noreferrer">打开生财原文 ↗</a>}</article><div className={css.scysCommentsSection}><div className={css.scysCommentsHeading}><h3>评论</h3><span>{commentLoadState === 'loaded' ? `${comments.length} 条` : commentLoadState === 'loading' ? '正在读取' : '按需加载'}</span></div>{commentLoadState === 'loading' && comments.length === 0 && <p className={css.emptyState} role="status">正在读取评论…</p>}{comments.map((comment, index) => <article className={css.scysComment} key={comment.id ?? index}><p>{formatAipojuContent(comment.text) || '未提供评论内容'}</p><small>{comment.author ?? ''}{comment.publishedAt === null ? '' : ` · ${formatScysDateTime(comment.publishedAt)}`}{comment.likeCount === null ? '' : ` · 赞 ${comment.likeCount}`}</small></article>)}{commentLoadState === 'loaded' && comments.length === 0 && <p className={css.emptyState} role="status">暂无评论。</p>}{commentLoadState === 'idle' && <p className={css.emptyState}>选择“加载评论”后查看真实评论。</p>}</div></>}</section>}
    <p className={css.fixtureNote}>授权后，搜索和详情会通过 Workbench Host 的固定只读方法访问；页面不会调用写操作。</p>
  </section>
}

function scysErrorMessage(status: string): string {
  if (status === 'SCYS_TOPIC_IDENTITY_MISSING') return '来源未提供有效文章标识，无法读取详情或评论。'
  if (status === 'SCYS_NOT_CONNECTED') return '请先连接生财有术。'
  if (status === 'SCYS_AUTH_EXPIRED') return '授权已过期，请重新连接。'
  if (status === 'SCYS_MCP_UNAVAILABLE') return '生财数据源暂不可用，请稍后再试。'
  return '本次读取未完成，请稍后重试。'
}

function scysFeedErrorMessage(status: string): string {
  if (status === 'SCYS_AUTH_EXPIRED') return '授权已过期；若已有缓存会继续展示缓存内容。'
  if (status === 'SCYS_NOT_CONNECTED') return '生财有术尚未连接；若已有缓存会继续展示缓存内容。'
  if (status === 'SCYS_FEED_QUERY_UNSUPPORTED') return '当前官方工具未提供所需的信息流筛选能力。'
  return '部分生财内容暂时未能刷新；若有缓存会继续展示。'
}

function composeScysFeatured(digested: ScysFeedQueryResult | undefined, hot: ScysFeedQueryResult | undefined): ScysContentSummary[] {
  const selected: ScysContentSummary[] = []
  const identities = new Set<string>()
  for (const result of [digested, hot]) {
    if (result === undefined || (result.status !== 'ready' && result.status !== 'empty')) continue
    for (const item of scysFeedSort(result.status === 'ready' ? result.items : [])) {
      const identity = scysFeedIdentity(item)
      if (identity.length === 0 || identities.has(identity)) continue
      identities.add(identity)
      selected.push(item)
      if (selected.length === 8) return selected
    }
  }
  return selected
}

function composeScysLatest(recent: ScysFeedQueryResult | undefined, featured: readonly ScysContentSummary[]): ScysContentSummary[] {
  if (recent === undefined || (recent.status !== 'ready' && recent.status !== 'empty')) return []
  const excluded = new Set(featured.map(scysFeedIdentity))
  const selected: ScysContentSummary[] = []
  for (const item of scysFeedSort(recent.status === 'ready' ? recent.items : [])) {
    const identity = scysFeedIdentity(item)
    if (identity.length === 0 || excluded.has(identity)) continue
    excluded.add(identity)
    selected.push(item)
    if (selected.length === 12) break
  }
  return selected
}

function scysFeedSort(items: readonly ScysContentSummary[]): ScysContentSummary[] {
  return [...items].sort((left, right) => scysPublishedMillis(right) - scysPublishedMillis(left)
    || scysRealInteractionTotal(right) - scysRealInteractionTotal(left))
}

function scysFeedIdentity(item: ScysContentSummary): string {
  return item.entityType === null || item.entityType.length === 0 || item.entityId === null || item.entityId.length === 0
    ? '' : `${item.entityType}:${item.entityId}`
}

function scysPublishedMillis(item: ScysContentSummary): number {
  if (item.publishedAt === null) return Number.NEGATIVE_INFINITY
  const value = Date.parse(item.publishedAt)
  return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY
}

function scysRealInteractionTotal(item: ScysContentSummary): number {
  const values = [item.engagement.likeCount, item.engagement.favoriteCount, item.engagement.coinCount, item.engagement.commentCount]
  return values.reduce<number>((total, value) => total + (value !== null && Number.isFinite(value) ? value : 0), 0)
}

function formatScysTimeRange(items: readonly ScysContentSummary[]): string {
  const times = items.map(scysPublishedMillis).filter(Number.isFinite).sort((left, right) => left - right)
  if (times.length === 0) return '发布时间未提供'
  const format = (value: number): string => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(value)
  return times.length === 1 ? `发布时间 ${format(times[0] as number)}` : `发布时间 ${format(times[0] as number)}—${format(times[times.length - 1] as number)}`
}

function formatScysDateTime(value: string | null): string {
  if (value === null) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '时间格式不可用'
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(parsed)
  const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find(entry => entry.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`
}

function formatScysContentType(value: string): string {
  return value === 'talk' || value === 'article' ? '文章' : value
}

function scysSummary(item: ScysContentSummary, maxLength: number): string {
  return formatAipojuExcerpt(item.summary ?? item.content, item.title ?? '', maxLength)
}

function scysOfficialUrl(item: ScysContentSummary): string | null {
  if (item.url === null) return null
  try {
    const url = new URL(item.url)
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.username.length === 0 && url.password.length === 0 ? url.href : null
  } catch {
    return null
  }
}

function ScysFeaturedCard({ item, onOpen }: { readonly item: ScysContentSummary; readonly onOpen: () => void }) {
  const excerpt = scysSummary(item, 180)
  const url = scysOfficialUrl(item)
  return <article className={`${css.aipojuFeaturedCard} ${css.scysFeedFeaturedCard}`}>
    <button className={css.scysFeedCardButton} type="button" onClick={onOpen} disabled={scysFeedIdentity(item).length === 0}>
      <span className={css.aipojuFeaturedBody}><strong>{item.title ?? '未提供标题'}</strong>{excerpt.length > 0 && <span>{excerpt}</span>}<small>{item.author ?? '作者未提供'} · {item.publishedAt === null ? '时间未提供' : formatScysDateTime(item.publishedAt)}</small><small>{scysEngagementText(item.engagement).replace(/^ · /u, '') || '互动数据未提供'}</small></span>
    </button>
    {url !== null && <a className={css.scysFeedCardLink} href={url} target="_blank" rel="noreferrer">打开生财原文 ↗</a>}
  </article>
}

function ScysTopicRow({ item, onOpen }: { readonly item: ScysContentSummary; readonly onOpen: () => void }) {
  const excerpt = scysSummary(item, 150)
  const url = scysOfficialUrl(item)
  return <article className={css.scysFeedRowWrap}>
    <button className={css.aipojuTopicRow} type="button" onClick={onOpen} disabled={scysFeedIdentity(item).length === 0}>
      <span className={css.aipojuTopicMain}><strong>{item.title ?? '未提供标题'}</strong>{excerpt.length > 0 && <span>{excerpt}</span>}<small>{item.author ?? '作者未提供'} · {item.publishedAt === null ? '时间未提供' : formatScysDateTime(item.publishedAt)} · {scysEngagementText(item.engagement).replace(/^ · /u, '') || '互动数据未提供'}</small></span>
      <span className={css.rowArrow} aria-hidden="true">↗</span>
    </button>
    {url !== null && <a className={css.scysFeedCardLink} href={url} target="_blank" rel="noreferrer">打开原文 ↗</a>}
  </article>
}

function displayCount(count: number | null): string {
  return count === null ? '—' : String(count)
}

function scysEngagementText(engagement: ScysEngagement): string {
  const values = [
    engagement.likeCount === null ? null : `赞 ${engagement.likeCount}`,
    engagement.favoriteCount === null ? null : `收藏 ${engagement.favoriteCount}`,
    engagement.coinCount === null ? null : `投锚 ${engagement.coinCount}`,
    engagement.commentCount === null ? null : `评论 ${engagement.commentCount}`,
  ].filter((value): value is string => value !== null)
  return values.length === 0 ? '' : ` · ${values.join(' · ')}`
}

const XHS_DEFAULT_TOPICS = ['AI设计', '设计审美', 'AI工作流', 'AI Agent', '小红书运营'] as const
const XHS_MAX_TOPICS = 5
type XhsArea = 'today' | 'popular' | 'search' | 'comments'
type XhsSourceUiStatus = XhsSourceStatusResult['status'] | 'checking'
type XhsSearchUiStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'offline' | 'logged_out' | 'timeout' | 'error'
type XhsTopicOutcome = { readonly keyword: string; readonly status: 'ready' | 'empty' | 'failed'; readonly error?: XhsSearchResult['status'] }

function XiaohongshuRadar({ active, dataClient }: { readonly active: boolean; readonly dataClient?: XhsRadarClient }) {
  const [area, setArea] = useState<XhsArea>('search')
  const [sourceStatus, setSourceStatus] = useState<XhsSourceUiStatus>('checking')
  const [searchKeyword, setSearchKeyword] = useState('设计')
  const [searchSort, setSearchSort] = useState<XhsSearchSort>('综合')
  const [searchStatus, setSearchStatus] = useState<XhsSearchUiStatus>('idle')
  const [searchDiagnostic, setSearchDiagnostic] = useState<XhsSearchFailureDiagnostic | null>(null)
  const [searchFeeds, setSearchFeeds] = useState<readonly XhsFeedSummary[]>([])
  const [topicText, setTopicText] = useState(XHS_DEFAULT_TOPICS.join('，'))
  const [todayBatches, setTodayBatches] = useState<readonly XhsKeywordBatch[]>([])
  const [topicOutcomes, setTopicOutcomes] = useState<readonly XhsTopicOutcome[]>([])
  const [todayProgress, setTodayProgress] = useState<{ readonly current: number; readonly total: number } | null>(null)
  const [lastTopicRefreshAt, setLastTopicRefreshAt] = useState<string | null>(null)
  const [todayStatus, setTodayStatus] = useState<XhsSearchUiStatus>('idle')
  const [selectedFeed, setSelectedFeed] = useState<XhsFeedSummary | null>(null)
  const [feedDetail, setFeedDetail] = useState<XhsFeedDetail | null>(null)
  const [coverLoadStates, setCoverLoadStates] = useState<Readonly<Record<string, 'loaded' | 'error'>>>({})
  const [coverDeliveryCounts, setCoverDeliveryCounts] = useState({ success: 0, failed: 0, cacheHit: 0 })
  const [detailStatus, setDetailStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [commentStatus, setCommentStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [analysisStatus, setAnalysisStatus] = useState<'idle' | 'loading' | 'ready' | 'empty' | 'error'>('idle')
  const [commentAnalysis, setCommentAnalysis] = useState<Extract<XhsCommentAnalysisResult, { status: 'ready' }> | null>(null)
  const [commentAnalysisError, setCommentAnalysisError] = useState<Extract<XhsCommentAnalysisResult, { status: 'error' }> | null>(null)

  useEffect(() => {
    if (!active) return
    let cancelled = false
    setSourceStatus('checking')
    if (dataClient === undefined) {
      setSourceStatus('source_offline')
      return
    }
    void dataClient.getSourceStatus().then(result => {
      if (!cancelled) setSourceStatus(result.status)
    }).catch(() => { if (!cancelled) setSourceStatus('source_offline') })
    return () => { cancelled = true }
  }, [active, dataClient])

  const canRead = sourceStatus === 'connected' && dataClient !== undefined
  const topics = [...new Set(topicText.split(/[，,\n]/u).map(topic => topic.trim()).filter(Boolean))]
  const topicsOverLimit = topics.length > XHS_MAX_TOPICS
  const intelligence = useMemo(() => deriveXhsIntelligence(todayBatches), [todayBatches])
  const coverAuditKnown = intelligence.feeds.length > 0 && intelligence.feeds.every(feed => feed.coverAudit !== undefined)
  const coverLoadCounts = intelligence.feeds.reduce((counts, feed) => {
    const state = coverLoadStates[xhsFeedDiagnosticKey(feed)]
    if (state === 'loaded') counts.loaded += 1
    else if (state === 'error') counts.error += 1
    return counts
  }, { loaded: 0, error: 0 })
  const coverAuditCounts = intelligence.feeds.reduce((counts, feed) => {
    const audit = feed.coverAudit
    if (audit === undefined) return counts
    if (audit.rawCoverPresent) counts.rawPresent += 1
    if (audit.urlDefaultPresent) counts.urlDefault += 1
    if (audit.urlPresent) counts.url += 1
    if (audit.urlPrePresent) counts.urlPre += 1
    if (audit.infoListUrlPresent) counts.infoListUrl += 1
    if (audit.hostMapped) counts.hostMapped += 1
    return counts
  }, { rawPresent: 0, urlDefault: 0, url: 0, urlPre: 0, infoListUrl: 0, hostMapped: 0 })

  const runSearch = async (keyword: string, sortBy: XhsSearchSort = '综合'): Promise<XhsSearchResult> => {
    if (!canRead || dataClient === undefined) return { status: sourceStatus === 'logged_out' ? 'logged_out' : 'source_offline' }
    return dataClient.search({ keyword, sortBy })
  }

  const executeSearch = async (keyword: string, sortBy: XhsSearchSort): Promise<void> => {
    if (keyword.trim().length === 0) return
    setSearchStatus('loading')
    setSearchDiagnostic(null)
    const startedAt = performance.now()
    try {
      const result = await runSearch(keyword, sortBy)
      setSearchStatus(searchUiStatus(result.status))
      setSearchDiagnostic(result.status === 'ready' || result.status === 'empty' ? null : result.diagnostic ?? null)
      setSearchFeeds(result.status === 'ready' ? result.feeds : [])
    } catch {
      setSearchStatus('offline')
      setSearchDiagnostic({
        errorCode: 'REMOTE_TRANSPORT_ERROR',
        failureStage: 'remote_transport',
        durationMs: Math.round(performance.now() - startedAt),
        httpStatus: null,
      })
      setSearchFeeds([])
    }
  }

  const submitSearch = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (searchKeyword.trim().length === 0) return
    await executeSearch(searchKeyword, searchSort)
  }


  const refreshTodaySignals = async (): Promise<void> => {
    if (!canRead || topics.length === 0 || topicsOverLimit) {
      setTodayStatus(sourceStatus === 'logged_out' ? 'logged_out' : 'offline')
      return
    }
    setTodayStatus('loading')
    setCoverLoadStates({})
    setCoverDeliveryCounts({ success: 0, failed: 0, cacheHit: 0 })
    setTodayProgress({ current: 0, total: topics.length })
    const nextBatches: XhsKeywordBatch[] = []
    const nextOutcomes: XhsTopicOutcome[] = []
    for (const [index, keyword] of topics.entries()) {
      setTodayProgress({ current: index + 1, total: topics.length })
      try {
        const result = await runSearch(keyword)
        if (result.status === 'ready') {
          nextBatches.push({ keyword, feeds: result.feeds })
          nextOutcomes.push({ keyword, status: result.feeds.length > 0 ? 'ready' : 'empty' })
        } else if (result.status === 'empty') nextOutcomes.push({ keyword, status: 'empty' })
        else nextOutcomes.push({ keyword, status: 'failed', error: result.status })
      } catch {
        nextOutcomes.push({ keyword, status: 'failed', error: 'search_error' })
      }
    }
    setTodayBatches(nextBatches)
    setTopicOutcomes(nextOutcomes)
    setLastTopicRefreshAt(new Date().toISOString())
    setTodayProgress(null)
    const successful = nextOutcomes.filter(outcome => outcome.status !== 'failed').length
    setTodayStatus(successful === 0 ? 'error' : nextBatches.some(batch => batch.feeds.length > 0) ? 'ready' : 'empty')
  }

  const openFeed = async (feed: XhsFeedSummary, nextArea: XhsArea): Promise<void> => {
    setSelectedFeed(feed)
    setFeedDetail(null)
    setCommentStatus('idle')
    setCommentAnalysis(null)
    setCommentAnalysisError(null)
    setAnalysisStatus('idle')
    setArea(nextArea)
    if (dataClient === undefined || feed.id === null || feed.xsecToken === null) {
      setDetailStatus('error')
      return
    }
    setDetailStatus('loading')
    try {
      const result = await dataClient.detail({ id: feed.id, xsecToken: feed.xsecToken })
      if (result.status === 'ready') {
        setFeedDetail(result.detail)
        setDetailStatus('ready')
        setCommentStatus(result.detail.comments.length > 0 ? 'ready' : 'idle')
      } else setDetailStatus('error')
    } catch {
      setDetailStatus('error')
    }
  }

  const loadComments = async (): Promise<void> => {
    if (dataClient === undefined || selectedFeed?.id === null || selectedFeed?.id === undefined || selectedFeed.xsecToken === null) return
    setCommentStatus('loading')
    setCommentAnalysis(null)
    setCommentAnalysisError(null)
    setAnalysisStatus('idle')
    try {
      const result = await dataClient.detail({ id: selectedFeed.id, xsecToken: selectedFeed.xsecToken, loadComments: true })
      if (result.status !== 'ready' || result.detail.comments.length === 0) {
        setCommentStatus('error')
        return
      }
      setFeedDetail(current => current === null ? result.detail : { ...current, comments: result.detail.comments })
      setCommentStatus('ready')
    } catch {
      setCommentStatus('error')
    }
  }

  const analyzeLoadedComments = async (): Promise<void> => {
    if (dataClient?.analyzeComments === undefined || selectedFeed?.id == null || feedDetail === null) return
    const comments = feedDetail.comments.slice(0, 10).filter(comment => typeof comment.content === 'string' && comment.content.trim().length > 0)
    if (comments.length === 0) {
      setAnalysisStatus('empty')
      setCommentAnalysis(null)
      setCommentAnalysisError(null)
      return
    }
    setAnalysisStatus('loading')
    setCommentAnalysis(null)
    setCommentAnalysisError(null)
    try {
      const result = await dataClient.analyzeComments({
        noteId: selectedFeed.id,
        noteTitle: feedDetail.title,
        noteText: feedDetail.content,
        comments: feedDetail.comments.slice(0, 10).map(comment => ({ id: comment.id, content: comment.content })),
      })
      if (result.status === 'ready') {
        setCommentAnalysis(result)
        setCommentAnalysisError(null)
        setAnalysisStatus('ready')
      } else if (result.status === 'no_comments') setAnalysisStatus('empty')
      else {
        setCommentAnalysisError(result)
        setAnalysisStatus('error')
      }
    } catch {
      setCommentAnalysisError({
        status: 'error', errorCode: 'UNKNOWN_ANALYSIS_ERROR', providerId: null, modelId: null,
        llmStreamCalled: false, providerRequestSent: 'not_started', providerResponseReceived: false,
        failureStage: 'remote_transport', durationMs: 0, streamEventCount: 0, responseCharacterCount: 0,
      })
      setAnalysisStatus('error')
    }
  }

  const areaItems: readonly { readonly id: XhsArea; readonly label: string }[] = [
    { id: 'today', label: '今日信号' }, { id: 'popular', label: '爆文观察' },
    { id: 'search', label: '搜索发现' }, { id: 'comments', label: '评论需求' },
  ]
  const popularFeeds = intelligence.feeds
  const visibleFeeds: readonly XhsFeedSummary[] = area === 'popular' ? popularFeeds : searchFeeds

  return <section className={`${css.workspacePage} ${css.xhsWorkspace}`} data-radar-route="/radar/xiaohongshu">
    <header className={css.pageHeader}>
      <div><span className={css.pageEyebrow} data-accent="xhs">XIAOHONGSHU RADAR</span><h1>小红书雷达</h1><p>发现平台内容、搜索与用户需求信号。</p></div>
      <span className={css.xhsSourceStatus} data-status={sourceStatus}>{sourceStatus === 'checking' ? '检查来源…' : sourceStatus === 'connected' ? '已连接' : sourceStatus === 'logged_out' ? '未登录' : '不可用'}</span>
    </header>
    <section className={css.xhsSourceCard} aria-label="小红书来源状态" data-status={sourceStatus}>
      <div className={css.xhsSourceCopy} role="status">
        <strong>小红书</strong>
        <span>{sourceStatus === 'checking' ? '正在检查登录状态…' : sourceStatus === 'connected' ? '已登录' : sourceStatus === 'logged_out' ? '未登录' : '小红书数据源暂不可用'}</span>
      </div>
      {sourceStatus === 'logged_out' && <small>小红书需要重新登录。</small>}
      {sourceStatus === 'source_offline' && <small>请检查本机小红书数据源连接。</small>}
    </section>
    <nav className={css.xhsAreaNav} aria-label="小红书雷达区域">{areaItems.map(item => <button key={item.id} type="button" aria-current={area === item.id ? 'page' : undefined} onClick={() => { setArea(item.id) }}>{item.label}</button>)}</nav>
    {area === 'today' && <section className={css.xhsTopics}>
      <label htmlFor="xhs-topics">监控关键词 <span>逗号分隔，最多 5 个；仅点击更新时逐个搜索，不自动刷新</span></label>
      <textarea id="xhs-topics" value={topicText} onChange={event => { setTopicText(event.target.value) }} rows={2} />
      {topicsOverLimit && <small className={css.xhsInlineError} role="alert">当前有 {topics.length} 个关键词；最多保留 5 个后才能更新。</small>}
      <button type="button" onClick={() => { void refreshTodaySignals() }} disabled={!canRead || topics.length === 0 || topicsOverLimit || todayStatus === 'loading'}>{todayStatus === 'loading' ? '正在更新…' : '更新小红书情报'}</button>
      {todayProgress !== null && <p className={css.xhsProgress} role="status">正在更新 {todayProgress.current}/{todayProgress.total}：{topics[todayProgress.current - 1]}</p>}
      {lastTopicRefreshAt !== null && <p className={css.xhsProgress}>最后更新：{new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(lastTopicRefreshAt))}</p>}
      {topicOutcomes.length > 0 && <div className={css.xhsTopicOutcomes} aria-label="关键词更新结果">{topicOutcomes.map(outcome => <span key={outcome.keyword} data-status={outcome.status}>{outcome.keyword} · {outcome.status === 'ready' ? '成功' : outcome.status === 'empty' ? '无结果' : outcome.error === 'search_timeout' ? '超时' : '失败'}</span>)}</div>}
    </section>}
    {area === 'search' && <section className={css.xhsSearch} aria-labelledby="xhs-search-heading">
      <div><h2 id="xhs-search-heading">搜索发现</h2><p>按需搜索；结果仅来自小红书真实搜索响应。</p></div>
      <form onSubmit={event => { void submitSearch(event) }}>
        <input type="search" aria-label="搜索小红书关键词" placeholder="输入关键词" value={searchKeyword} onChange={event => { setSearchKeyword(event.target.value) }} disabled={!canRead} />
        <select aria-label="小红书搜索排序" value={searchSort} onChange={event => {
          const nextSort = event.target.value as XhsSearchSort
          setSearchSort(nextSort)
          if (searchStatus !== 'idle' && searchStatus !== 'loading') void executeSearch(searchKeyword, nextSort)
        }} disabled={!canRead || searchStatus === 'loading'}>
          <option value="综合">综合排序</option>
          <option value="最新">最新</option>
          <option value="最多点赞">最多点赞</option>
          <option value="最多评论">最多评论</option>
          <option value="最多收藏">最多收藏</option>
        </select>
        <button type="submit" disabled={!canRead || searchStatus === 'loading'}>{searchStatus === 'loading' ? '搜索中…' : '搜索'}</button>
      </form>
    </section>}
    {area === 'popular' && <div className={css.xhsSectionIntro}><h2>爆文观察</h2><p>当前监控结果中的高互动笔记；不是小红书全站热榜。</p></div>}
    {area === 'comments' && <div className={css.xhsSectionIntro}><h2>评论需求</h2><p>先从搜索发现或爆文观察选择笔记；评论仅在打开详情时读取。</p></div>}
    {area === 'comments' && selectedFeed !== null
      ? <><button className={css.xhsCommentAction} type="button" onClick={() => { setArea('search'); setSelectedFeed(null); setFeedDetail(null); setDetailStatus('idle'); setCommentStatus('idle'); setCommentAnalysis(null); setCommentAnalysisError(null); setAnalysisStatus('idle') }}>返回搜索结果</button><XhsFeedDetailView feed={selectedFeed} detail={feedDetail} getImageAsset={dataClient?.getCoverAsset} state={detailStatus} commentState={commentStatus} analysis={commentAnalysis} analysisError={commentAnalysisError} analysisState={analysisStatus} canAnalyze={dataClient?.analyzeComments !== undefined} onLoadComments={() => { void loadComments() }} onAnalyzeComments={() => { void analyzeLoadedComments() }} /></>
      : area !== 'comments' && <>
        {area === 'popular' && <>
          <p className={css.xhsSourceFootnote}>当前监控结果中的高互动笔记</p>
          {import.meta.env.DEV && <details className={css.xhsCoverDiagnostics} open>
            <summary>临时封面链路诊断（仅汇总计数）</summary>
            <div>
              <span>TOTAL_FEEDS = {intelligence.feeds.length}</span>
              <span>RAW_COVER_PRESENT = {coverAuditKnown ? coverAuditCounts.rawPresent : 'UNKNOWN'}</span>
              <span>RAW_COVER_MISSING = {coverAuditKnown ? intelligence.feeds.length - coverAuditCounts.rawPresent : 'UNKNOWN'}</span>
              <span>HOST_MAPPED_COVER = {coverAuditKnown ? coverAuditCounts.hostMapped : 'UNKNOWN'}</span>
              <span>HOST_EMPTY_COVER = {coverAuditKnown ? intelligence.feeds.length - coverAuditCounts.hostMapped : 'UNKNOWN'}</span>
              <span>RENDERER_COVER_PRESENT = {intelligence.feeds.filter(feed => feed.coverAssetId !== null).length}</span>
              <span>RENDERER_COVER_EMPTY = {intelligence.feeds.filter(feed => feed.coverAssetId === null).length}</span>
              <span>IMG_LOAD_SUCCESS = {coverLoadCounts.loaded}</span>
              <span>IMG_LOAD_ERROR = {coverLoadCounts.error}</span>
              <span>IMG_NOT_ATTEMPTED = {intelligence.feeds.filter(feed => feed.coverAssetId !== null).length - coverLoadCounts.loaded - coverLoadCounts.error}</span>
              <span>HOST_COVER_FETCH_SUCCESS = {coverDeliveryCounts.success}</span>
              <span>HOST_COVER_FETCH_FAILED = {coverDeliveryCounts.failed}</span>
              <span>HOST_COVER_CACHE_HIT = {coverDeliveryCounts.cacheHit}</span>
              <span>RAW_URL_DEFAULT_PRESENT = {coverAuditKnown ? coverAuditCounts.urlDefault : 'UNKNOWN'}</span>
              <span>RAW_URL_PRESENT = {coverAuditKnown ? coverAuditCounts.url : 'UNKNOWN'}</span>
              <span>RAW_URL_PRE_PRESENT = {coverAuditKnown ? coverAuditCounts.urlPre : 'UNKNOWN'}</span>
              <span>RAW_INFO_LIST_URL_PRESENT = {coverAuditKnown ? coverAuditCounts.infoListUrl : 'UNKNOWN'}</span>
            </div>
          </details>}
        </>}
        {area === 'today' && <XhsSearchState status={todayStatus} />}
        {area === 'search' && <XhsSearchState status={searchStatus} diagnostic={searchDiagnostic} />}
        {area === 'today' && intelligence.signals.length > 0 && <XhsSignalList signals={intelligence.signals} feeds={intelligence.feeds} onOpen={feed => { void openFeed(feed, 'today') }} />}
        {visibleFeeds.length > 0 && <div className={css.xhsFeedList}>{visibleFeeds.map((feed, index) => {
          const aggregated = area === 'popular' ? intelligence.feeds.find(item => item.id === feed.id) : undefined
          return <XhsFeedCard key={`${feed.id ?? 'unidentified'}-${index}`} feed={feed} getCoverAsset={dataClient?.getCoverAsset} onOpen={() => { void openFeed(feed, area) }} onComments={() => { void openFeed(feed, 'comments') }} onCoverLoad={() => { setCoverLoadStates(current => ({ ...current, [xhsFeedDiagnosticKey(feed)]: 'loaded' })) }} onCoverError={() => { setCoverLoadStates(current => ({ ...current, [xhsFeedDiagnosticKey(feed)]: 'error' })) }} onCoverDelivery={result => { setCoverDeliveryCounts(current => ({ success: current.success + (result.status === 'ready' ? 1 : 0), failed: current.failed + (result.status === 'error' ? 1 : 0), cacheHit: current.cacheHit + (result.status === 'ready' && result.cacheHit ? 1 : 0) })) }} {...(aggregated === undefined ? {} : { keywords: aggregated.matchedKeywords, engagementScore: aggregated.engagementScore })} />
        })}</div>}
        {area === 'popular' && visibleFeeds.length === 0 && <p className={css.xhsEmpty}>先搜索或手动更新监控关键词，再查看真实结果中的互动排序。</p>}
      </>}
    {area !== 'comments' && selectedFeed !== null && detailStatus !== 'idle' && <><button className={css.xhsCommentAction} type="button" onClick={() => { setSelectedFeed(null); setFeedDetail(null); setDetailStatus('idle'); setCommentStatus('idle'); setCommentAnalysis(null); setCommentAnalysisError(null); setAnalysisStatus('idle') }}>关闭详情</button><XhsFeedDetailView feed={selectedFeed} detail={feedDetail} getImageAsset={dataClient?.getCoverAsset} state={detailStatus} commentState={commentStatus} analysis={commentAnalysis} analysisError={commentAnalysisError} analysisState={analysisStatus} canAnalyze={dataClient?.analyzeComments !== undefined} onLoadComments={() => { void loadComments() }} onAnalyzeComments={() => { void analyzeLoadedComments() }} /></>}
  </section>
}

function XhsSearchState({ status, diagnostic }: { readonly status: XhsSearchUiStatus; readonly diagnostic?: XhsSearchFailureDiagnostic | null }) {
  const copy: Record<XhsSearchUiStatus, string> = {
    idle: '输入关键词开始一次真实搜索。', loading: '正在搜索小红书…', ready: '', empty: '没有返回结果。',
    offline: '小红书数据源暂不可用。', logged_out: '小红书需要重新登录。', timeout: '本次搜索超时，请稍后重试。', error: '本次搜索失败，请稍后重试。',
  }
  if (copy[status] === '') return null
  const detail = diagnostic === undefined || diagnostic === null ? '' : `（${xhsSearchDiagnosticMessage(diagnostic.errorCode)}；${diagnostic.errorCode} · ${diagnostic.failureStage}${diagnostic.httpStatus === null ? '' : ` · HTTP ${diagnostic.httpStatus}`} · ${diagnostic.durationMs} ms）`
  return <p className={css.xhsEmpty} role={status === 'error' || status === 'offline' || status === 'timeout' ? 'alert' : 'status'}>{diagnostic === undefined || diagnostic === null ? copy[status] : `${xhsSearchDiagnosticMessage(diagnostic.errorCode)}。`}{detail}</p>
}

function xhsSearchDiagnosticMessage(code: XhsSearchFailureDiagnostic['errorCode']): string {
  switch (code) {
    case 'REMOTE_TRANSPORT_ERROR': return 'Workbench 与 Host 通信失败'
    case 'MCP_UNAVAILABLE': return '小红书 MCP 不可用'
    case 'MCP_TIMEOUT': return '小红书搜索超时'
    case 'MCP_BROWSER_ERROR': return '小红书搜索浏览器处理失败'
    case 'MCP_UPSTREAM_ERROR': return '小红书搜索上游响应失败'
    case 'MCP_SEARCH_ERROR': return '小红书搜索服务返回错误'
    case 'RESULT_MAPPING_ERROR': return '小红书搜索结果格式异常'
    case 'UNKNOWN': return '搜索失败，原因未分类'
  }
}

function xhsFeedDiagnosticKey(feed: XhsFeedSummary): string {
  return feed.id ?? `${feed.title ?? ''}\u0000${feed.author ?? ''}`
}

function XhsFeedCard({ feed, getCoverAsset, onOpen, onComments, onCoverLoad, onCoverError, onCoverDelivery, keywords, engagementScore }: { readonly feed: XhsFeedSummary; readonly getCoverAsset?: XhsRadarClient['getCoverAsset']; readonly onOpen: () => void; readonly onComments: () => void; readonly onCoverLoad: () => void; readonly onCoverError: () => void; readonly onCoverDelivery: (result: XhsCoverAssetResult) => void; readonly keywords?: readonly string[]; readonly engagementScore?: number }) {
  return <article className={css.xhsFeedCard}>
    <XhsFeedCover key={feed.coverAssetId ?? 'no-cover'} assetId={feed.coverAssetId} getCoverAsset={getCoverAsset} onLoad={onCoverLoad} onError={onCoverError} onDelivery={onCoverDelivery} />
    <button className={css.xhsFeedTitle} type="button" onClick={onOpen} disabled={feed.id === null || feed.xsecToken === null}>{feed.title ?? '未提供标题'}</button>
    <span className={css.xhsFeedAuthor}>{feed.author ?? '作者未提供'}{feed.noteType === null ? '' : ` · ${feed.noteType}`}</span>
    <div className={css.xhsFeedMetrics}><span>赞 {formatCount(feed.likeCount)}</span><span>藏 {formatCount(feed.collectCount)}</span><span>评 {formatCount(feed.commentCount)}</span></div>
    {keywords !== undefined && <span className={css.xhsFeedAuthor}>命中关键词：{keywords.join('、') || '—'} · 高互动评分 {engagementScore ?? '—'}</span>}
    <button className={css.xhsCommentAction} type="button" onClick={onComments} disabled={feed.id === null || feed.xsecToken === null}>查看评论需求</button>
  </article>
}

function XhsFeedCover({ assetId, getCoverAsset, onLoad, onError, onDelivery }: { readonly assetId: string | null; readonly getCoverAsset?: XhsRadarClient['getCoverAsset']; readonly onLoad: () => void; readonly onError: () => void; readonly onDelivery: (result: XhsCoverAssetResult) => void }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const callbacks = useRef({ onLoad, onError, onDelivery })
  callbacks.current = { onLoad, onError, onDelivery }
  useEffect(() => {
    let cancelled = false
    setObjectUrl(null)
    setLoaded(false)
    setFailed(false)
    if (assetId === null || getCoverAsset === undefined) return () => { cancelled = true }
    void getCoverAsset({ assetId }).then(result => {
      if (cancelled) return
      callbacks.current.onDelivery(result)
      if (result.status !== 'ready' || !isXhsCoverMimeType(result.mimeType)) {
        setFailed(true)
        callbacks.current.onError()
        return
      }
      try {
        const binary = atob(result.base64)
        const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
        setObjectUrl(URL.createObjectURL(new Blob([bytes], { type: result.mimeType })))
      } catch {
        setFailed(true)
        callbacks.current.onError()
      }
    }).catch(() => {
      if (cancelled) return
      callbacks.current.onDelivery({ status: 'error' })
      setFailed(true)
      callbacks.current.onError()
    })
    return () => { cancelled = true }
  }, [assetId, getCoverAsset])
  useEffect(() => () => { if (objectUrl !== null) URL.revokeObjectURL(objectUrl) }, [objectUrl])
  return <div className={css.xhsFeedCover}>
    {!loaded && <span className={css.xhsFeedCoverFallback} role="img" aria-label="无封面">无封面</span>}
    {objectUrl !== null && !failed && <img className={loaded ? css.xhsFeedCoverImageLoaded : css.xhsFeedCoverImagePending} src={objectUrl} alt="" onLoad={() => { setLoaded(true); callbacks.current.onLoad() }} onError={() => { setObjectUrl(null); setFailed(true); callbacks.current.onError() }} />}
  </div>
}

function isXhsCoverMimeType(value: string): boolean {
  return value === 'image/jpeg' || value === 'image/png' || value === 'image/webp' || value === 'image/avif'
}

function XhsDetailImage({ assetId, getImageAsset, index }: { readonly assetId: string | null; readonly getImageAsset?: XhsRadarClient['getCoverAsset']; readonly index: number }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let cancelled = false
    setObjectUrl(null)
    setLoaded(false)
    setFailed(false)
    if (assetId === null || getImageAsset === undefined) {
      setFailed(true)
      return () => { cancelled = true }
    }
    void getImageAsset({ assetId }).then(result => {
      if (cancelled) return
      if (result.status !== 'ready' || !isXhsCoverMimeType(result.mimeType)) {
        setFailed(true)
        return
      }
      try {
        const binary = atob(result.base64)
        const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
        setObjectUrl(URL.createObjectURL(new Blob([bytes], { type: result.mimeType })))
      } catch {
        setFailed(true)
      }
    }).catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [assetId, getImageAsset])
  useEffect(() => () => { if (objectUrl !== null) URL.revokeObjectURL(objectUrl) }, [objectUrl])
  return <div className={css.xhsDetailImage}>
    {!loaded && <span className={css.xhsDetailImageFallback} role="img" aria-label={`笔记图片 ${index + 1} 暂不可用`}>{failed ? '图片暂不可用' : '正在加载图片…'}</span>}
    {objectUrl !== null && !failed && <img className={loaded ? css.xhsDetailImageLoaded : css.xhsDetailImagePending} src={objectUrl} alt={`笔记图片 ${index + 1}`} loading="lazy" onLoad={() => { setLoaded(true) }} onError={() => { setObjectUrl(null); setFailed(true) }} />}
  </div>
}

function XhsSignalList({ signals, feeds, onOpen }: { readonly signals: readonly XhsSignalCandidate[]; readonly feeds: readonly XhsAggregatedFeed[]; readonly onOpen: (feed: XhsAggregatedFeed) => void }) {
  return <div className={css.xhsSignalList} aria-label="今日信号">
    {signals.map((signal, index) => {
      const feedIndex = signal.feedIndexes[0]
      const feed = feedIndex === undefined ? undefined : feeds[feedIndex]
      return <article className={css.xhsSignalCard} key={`${signal.type}-${feed?.id ?? index}`}>
        <span>{signal.matchedSignalTypes.map(signalTypeLabel).join(' · ')}</span>
        <h3>{signal.title}</h3><p>{signal.reason}</p>
        <small>来源关键词：{signal.keywords.join('、') || '未提供'} · 相关笔记 {signal.feedIndexes.length} 条</small>
        {feed !== undefined && <button className={css.xhsFeedTitle} type="button" disabled={feed.id === null || feed.xsecToken === null} onClick={() => { onOpen(feed) }}>{feed.title ?? '打开相关笔记'}</button>}
      </article>
    })}
  </div>
}

function signalTypeLabel(type: XhsSignalCandidate['type']): string {
  switch (type) {
    case 'cross_keyword': return '交叉信号'
    case 'high_comment': return '讨论需求'
    case 'high_collect': return '强实用需求'
    case 'high_engagement': return '高互动内容'
    default: return assertNever(type)
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected XHS signal type: ${value}`)
}

function XhsFeedDetailView({ feed, detail, getImageAsset, state, commentState, analysis, analysisError, analysisState, canAnalyze, onLoadComments, onAnalyzeComments }: { readonly feed: XhsFeedSummary; readonly detail: XhsFeedDetail | null; readonly getImageAsset?: XhsRadarClient['getCoverAsset']; readonly state: 'idle' | 'loading' | 'ready' | 'error'; readonly commentState: 'idle' | 'loading' | 'ready' | 'error'; readonly analysis: Extract<XhsCommentAnalysisResult, { status: 'ready' }> | null; readonly analysisError: Extract<XhsCommentAnalysisResult, { status: 'error' }> | null; readonly analysisState: 'idle' | 'loading' | 'ready' | 'empty' | 'error'; readonly canAnalyze: boolean; readonly onLoadComments: () => void; readonly onAnalyzeComments: () => void }) {
  if (state === 'loading') return <p className={css.xhsEmpty} role="status">正在读取笔记详情…</p>
  if (state !== 'ready' || detail === null) return <p className={css.xhsEmpty} role="alert">笔记详情读取失败；可返回列表后再次选择。</p>
  const loadedComments = detail.comments.slice(0, 10).filter(comment => typeof comment.content === 'string' && comment.content.trim().length > 0)
  const commentsByRef = new Map<string, (typeof loadedComments)[number]>(loadedComments.map((comment, index) => [`C${String(index + 1).padStart(2, '0')}`, comment]))
  const categories = [
    ['question', '用户在问什么'], ['blocker', '用户卡在哪里'], ['desired_outcome', '真正想解决什么'],
    ['content_opportunity', '内容机会'], ['commercial_demand', '产品 / 服务需求'],
  ] as const
  return <article className={css.xhsDetail}>
    <header><span>{detail.author ?? feed.author ?? '作者未提供'}</span><h2>{detail.title ?? feed.title ?? '未提供标题'}</h2></header>
    {detail.content !== null && <p className={css.xhsDetailContent}>{detail.content}</p>}
    {detail.imageAssetIds.length > 0 && <div className={css.xhsImageGrid} aria-label="笔记图片">{detail.imageAssetIds.map((assetId, index) => <XhsDetailImage key={`${assetId ?? 'unavailable'}-${index}`} assetId={assetId} getImageAsset={getImageAsset} index={index} />)}</div>}
    <div className={css.xhsFeedMetrics}><span>赞 {formatCount(detail.likeCount)}</span><span>藏 {formatCount(detail.collectCount)}</span><span>评 {formatCount(detail.commentCount)}</span></div>
    <section className={css.xhsAnalysis} aria-label="评论需求提炼">
      <div><h3>评论需求提炼</h3><p>分析将使用当前已加载评论调用配置的 AI 模型，不写入 Harness Session。</p></div>
      <button className={css.xhsCommentAction} type="button" disabled={!canAnalyze || loadedComments.length === 0 || analysisState === 'loading'} onClick={onAnalyzeComments}>{analysisState === 'loading' ? '正在提炼…' : '提炼需求'}</button>
      {loadedComments.length === 0 && <span>{detail.commentCount === 0 ? '这篇笔记暂时没有评论。' : commentState === 'loading' ? '正在加载评论…' : '请先加载评论后再提炼需求。'}</span>}
      {analysisState === 'error' && <div role="alert"><span>本次分析未完成，请稍后重试。原始模型内容不会显示。</span>{analysisError !== null && <small data-testid="xhs-analysis-diagnostic">错误码 {analysisError.errorCode} · 阶段 {analysisError.failureStage} · Provider {analysisError.providerId ?? 'unknown'} · Model {analysisError.modelId ?? 'unknown'} · llm.stream {analysisError.llmStreamCalled ? 'called' : 'not called'} · Provider 请求 {analysisError.providerRequestSent} · Provider 响应 {analysisError.providerResponseReceived ? 'yes' : 'no'} · HTTP {analysisError.httpStatus ?? 'none'} · stream 事件 {analysisError.streamEventCount} · 响应字符 {analysisError.responseCharacterCount} · {analysisError.durationMs} ms</small>}</div>}
      {analysisState === 'empty' && <span>暂无可分析评论。</span>}
      {analysis !== null && analysis.insights.length === 0 && <span>暂无足够评论证据。</span>}
      {analysis !== null && categories.map(([category, title]) => {
        const insights = analysis.insights.filter(item => item.category === category)
        return <section className={css.xhsAnalysisCategory} key={category}>
          <h4>{title}</h4>
          {insights.length === 0 ? <p>暂无足够评论证据。</p> : insights.map((item, index) => <article key={`${category}-${index}`}>
            <p>{item.insight}</p><small>证据 {item.evidenceRefs.length} 条 · 可信度 {item.confidence === 'high' ? '高' : item.confidence === 'medium' ? '中' : '低'}</small>
            <div>{item.evidenceRefs.map(ref => commentsByRef.has(ref) ? <button className={css.xhsEvidenceLink} key={ref} type="button" onClick={() => {
              const target = document.querySelector<HTMLElement>(`[data-comment-ref="${ref}"]`)
              if (target === null) return
              target.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
              target.classList.add(css.xhsCommentHighlighted!)
              window.setTimeout(() => target.classList.remove(css.xhsCommentHighlighted!), 1_500)
            }}>查看对应评论</button> : null)}</div>
          </article>)}
        </section>
      })}
    </section>
    <section className={css.xhsComments}><h3>评论需求 · 原始评论</h3><p>仅展示来源返回的评论，不自动分类或推断需求标签。</p>
      {detail.comments.length > 0 ? detail.comments.map((comment, index) => {
        const ref = index < 10 && typeof comment.content === 'string' && comment.content.trim().length > 0
          ? `C${String(detail.comments.slice(0, index).filter(item => typeof item.content === 'string' && item.content.trim().length > 0).length + 1).padStart(2, '0')}`
          : undefined
        return <article key={comment.id ?? index} {...(ref === undefined ? {} : { 'data-comment-ref': ref })}><strong>{comment.author ?? '作者未提供'}</strong><p>{comment.content ?? '评论内容未提供'}</p><small>赞 {formatCount(comment.likeCount)}{comment.createdAt === null ? '' : ` · ${comment.createdAt}`}</small></article>
      })
        : detail.commentCount === 0 ? <span>这篇笔记暂时没有评论。</span>
          : commentState === 'loading' ? <span role="status">正在加载评论…</span>
            : commentState === 'error' ? <><span role="alert">评论暂时加载失败，可重试。</span><button className={css.xhsCommentAction} type="button" onClick={onLoadComments}>重试加载评论</button></>
              : <><span>这篇笔记有评论，但详情未返回评论内容。</span><button className={css.xhsCommentAction} type="button" onClick={onLoadComments}>加载评论</button></>}
    </section>
  </article>
}

function searchUiStatus(status: XhsSearchResult['status']): XhsSearchUiStatus {
  switch (status) {
    case 'ready': return 'ready'
    case 'empty': return 'empty'
    case 'logged_out': return 'logged_out'
    case 'source_offline': return 'offline'
    case 'search_timeout': return 'timeout'
    case 'search_error': return 'error'
  }
}

function formatCount(value: number | null): string {
  return value === null ? '—' : new Intl.NumberFormat('zh-CN').format(value)
}

function CrossSourceSignals() {
  return <section className={css.workspacePage} data-radar-route="/radar/signals">
    <header className={css.pageHeader}><div><span className={css.pageEyebrow} data-accent="signals">CROSS-SOURCE</span><h1>综合信号</h1><p>识别多个来源之间重复出现、相互验证的机会。</p></div><span className={css.awaitingBadge}>结构预留</span></header>
    <div className={css.signalPrinciples}><article><span>01</span><h2>重复出现</h2><p>等待多个正式来源提供可关联的信息。</p></article><article><span>02</span><h2>相互验证</h2><p>当前尚无跨来源 Signal Registry。</p></article><article><span>03</span><h2>机会判断</h2><p>暂无综合信号；不以示例内容代替真实记录。</p></article></div>
  </section>
}

function SignalDetail({ signal, detailState, detailFailure, onBack }: { signal: RadarSignal; detailState: LoadState; detailFailure: string | null; onBack: () => void }) {
  return (
    <div className={css.detailPage}>
      <button className={css.backButton} type="button" onClick={onBack}>← <span>返回 AI 情报</span></button>
      <header className={css.detailHeader}>
        <div>
          <span className={css.detailEyebrow}>{signal.kind === 'story' ? 'AIHOT Story · 事件聚合' : 'AIHOT Item · 未提供 Story 关联'}</span>
          <h1>{signal.title}</h1>
        </div>
        <div className={css.sourceMeta}>
          <span>{signal.kind === 'story' ? '首篇报道' : '发布时间'}</span><time>{formatTime(signal.publishedAt)}</time>
          <span className={css.sourceIdentifier}>{signal.kind === 'story' ? `Story ID · ${signal.storyId ?? 'UNAVAILABLE'}` : `Item ID · ${signal.signalKey.slice('item:'.length)}`}</span>
        </div>
      </header>
      {signal.kind === 'item' && <p className={css.itemFallbackNote}>公开 API 未在此 Item 中提供 Story 关联；本页面按 Item 级条目展示，不自行推断它绝无其他 Story 关系。</p>}
      <div className={css.detailLayout}>
        <div className={css.detailMain}>
          <section className={css.summarySection} aria-labelledby="radar-summary-heading">
            <div className={css.contentHeading}><span className={css.sectionIndex}>01</span><div><h2 id="radar-summary-heading">AIHOT 事件摘要</h2><p>AIHOT 汇总 · 非原始来源原话</p></div></div>
            {detailState === 'loading' && <p className={css.summaryText} role="status">正在读取该 Story 的摘要与来源记录…</p>}
            {detailState === 'unavailable' && <p className={css.summaryText} role="alert">情报源暂时不可用（{detailFailure ?? 'offline'}），没有使用 Fixture 替代。</p>}
            {detailState === 'ready' && <p className={css.summaryText}>{signal.summary ?? 'AIHOT 未提供摘要。'}</p>}
          </section>
          <section className={css.evidenceSection} aria-labelledby="radar-evidence-heading">
            <div className={css.contentHeading}><span className={css.sectionIndex}>02</span><div><h2 id="radar-evidence-heading">来源与 Evidence</h2><p>{signal.evidence.length} 条 API 返回的来源记录</p></div></div>
            {detailState === 'loading'
              ? <p className={css.emptyState} role="status">正在载入来源记录…</p>
              : detailState === 'unavailable'
                ? <p className={css.emptyState}>Evidence 暂不可用；没有使用 Fixture 替代。</p>
                : signal.evidence.length === 0
              ? <p className={css.emptyState}>AIHOT 当前未返回 Evidence 明细。</p>
              : <><div className={css.evidenceList}>{signal.evidence.slice(0, 5).map(item => <EvidenceRow key={item.evidenceId} evidence={item} />)}</div>{signal.evidence.length > 5 && <p className={css.emptyState}>AIHOT 返回 {signal.evidence.length} 条来源；本 PoC 展示前 5 条。</p>}</>}
          </section>
          <section className={css.analysisSection} aria-labelledby="radar-analysis-heading">
            <div className={css.contentHeading}><span className={css.sectionIndex}>03</span><div><h2 id="radar-analysis-heading">Workbench 分析</h2><p>独立于来源与 AIHOT 摘要</p></div></div>
            <p className={css.analysisText}>尚未运行分析</p>
          </section>
        </div>
        <aside className={css.detailAside} aria-label="Signal 来源信息">
          <section className={css.relationSection}>
            <div className={css.asideHeading}><h2>来源追踪</h2><span>AIHOT Public API</span></div>
            <div className={css.relationRow}><span>Signal 类型</span><strong>{signal.kind === 'story' ? 'Story' : 'Item'}</strong></div>
            {signal.ranking !== null && <div className={css.relationRow}><span>热点排名</span><strong>#{signal.ranking}</strong></div>}
            {signal.sourceCount !== null && <div className={css.relationRow}><span>来源数</span><strong>{signal.sourceCount}</strong></div>}
            {signal.participationCount !== null && <div className={css.relationRow}><span>参与来源信号数</span><strong>{signal.participationCount}</strong></div>}
            <a className={css.externalLink} href={signal.aihotUrl} target="_blank" rel="noopener noreferrer">查看 AIHOT 原始记录 ↗</a>
            {signal.originalUrl !== null && <a className={css.externalLink} href={signal.originalUrl} target="_blank" rel="noopener noreferrer">打开原始来源 ↗</a>}
          </section>
        </aside>
      </div>
    </div>
  )
}

function EvidenceRow({ evidence }: { evidence: RadarEvidence }) {
  return (
    <article className={css.evidenceCard}>
      <div className={css.evidenceTopline}><strong>{evidence.sourceName}</strong><span>{evidence.firstParty === null ? '来源属性未提供' : evidence.firstParty ? '一手来源' : '转述来源'}</span></div>
      <h3>{evidence.title}</h3>
      <p>{evidence.summary ?? '来源摘要未提供。'}</p>
      <div className={css.evidenceFooter}>
        <time>{formatTime(evidence.publishedAt)}</time>
        <span className={css.evidenceLinks}>
          <a href={evidence.aihotUrl} target="_blank" rel="noopener noreferrer">AIHOT</a>
          {evidence.originalUrl !== null && <a href={evidence.originalUrl} target="_blank" rel="noopener noreferrer">原文</a>}
        </span>
      </div>
    </article>
  )
}

function RadarFixtureSurface() {
  const [signals, setSignals] = useState<RadarSignalFixture[]>(() => RADAR_SIGNAL_FIXTURES.map(signal => ({ ...signal })))
  const [category, setCategory] = useState<(typeof RADAR_CATEGORIES)[number]>('全部')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [projectPickerOpen, setProjectPickerOpen] = useState(false)
  const [saveAfterPick, setSaveAfterPick] = useState(false)
  const [workConfirmationOpen, setWorkConfirmationOpen] = useState(false)
  const selected = signals.find(signal => signal.signal_id === selectedId)
  const filteredSignals = signals.filter(signal => categoryMatches(category, signal))

  function updateSelected(update: (signal: RadarSignalFixture) => RadarSignalFixture): void {
    if (selectedId === null) return
    setSignals(current => current.map(signal => signal.signal_id === selectedId ? update(signal) : signal))
  }

  function pickProject(projectId: string): void {
    const project = RADAR_PROJECT_FIXTURES.find(item => item.project_id === projectId)
    if (project === undefined) return
    updateSelected(signal => ({ ...signal, project_id: project.project_id, project_name: project.name, ...(saveAfterPick ? { evidence_status: 'saved' as const } : {}) }))
    setProjectPickerOpen(false)
    setSaveAfterPick(false)
  }

  function saveEvidence(): void {
    if (selected?.project_id === null || selected?.project_id === undefined) {
      setSaveAfterPick(true)
      setProjectPickerOpen(true)
      return
    }
    updateSelected(signal => ({ ...signal, evidence_status: 'saved' }))
  }

  return (
    <main className={css.root} aria-label="Radar">
      <div className={css.container}>
        {selected === undefined
          ? <>
            <header className={css.pageHeader}><div><h1>Radar</h1><p>开发 Fixture · 不会与真实 API 混排</p></div><span className={css.localTag}>Fixture only</span></header>
            <nav className={css.categories} aria-label="信号分类">{RADAR_CATEGORIES.map(item => <button key={item} type="button" className={item === category ? css.categoryActive : ''} aria-pressed={item === category} onClick={() => { setCategory(item) }}>{item}</button>)}</nav>
            <section className={css.signalSection} aria-labelledby="radar-fixture-heading">
              <div className={css.sectionHeading}><h2 id="radar-fixture-heading">今日值得关注</h2><span>外部信号 · 示例资料</span></div>
              <div className={css.signalList}>{filteredSignals.map(signal => <button key={signal.signal_id} className={css.signalRow} type="button" aria-label={`打开信号：${signal.title}`} onClick={() => { setSelectedId(signal.signal_id) }}><span className={css.signalBody}><strong>{signal.title}</strong><span className={css.signalSummary}>{signal.summary}</span><span className={css.signalMeta}>{signal.source_name} · Fixture</span></span></button>)}</div>
            </section>
          </>
          : <FixtureDetail
            signal={selected}
            projectPickerOpen={projectPickerOpen}
            saveAfterPick={saveAfterPick}
            workConfirmationOpen={workConfirmationOpen}
            onBack={() => { setSelectedId(null); setProjectPickerOpen(false); setWorkConfirmationOpen(false) }}
            onSaveEvidence={saveEvidence}
            onToggleProjectPicker={() => { setSaveAfterPick(false); setProjectPickerOpen(open => !open) }}
            onPickProject={pickProject}
            onOpenWork={() => { setWorkConfirmationOpen(true) }}
            onConfirmWork={() => { updateSelected(signal => ({ ...signal, work_status: 'created' })); setWorkConfirmationOpen(false) }}
            onGoToWork={() => { selectWorkspaceIdentity('work') }}
          />}
      </div>
    </main>
  )
}

function FixtureDetail({ signal, projectPickerOpen, saveAfterPick, workConfirmationOpen, onBack, onSaveEvidence, onToggleProjectPicker, onPickProject, onOpenWork, onConfirmWork, onGoToWork }: {
  signal: RadarSignalFixture
  projectPickerOpen: boolean
  saveAfterPick: boolean
  workConfirmationOpen: boolean
  onBack: () => void
  onSaveEvidence: () => void
  onToggleProjectPicker: () => void
  onPickProject: (id: string) => void
  onOpenWork: () => void
  onConfirmWork: () => void
  onGoToWork: () => void
}) {
  return <div className={css.detailPage}>
    <button className={css.backButton} type="button" onClick={onBack}>← <span>返回 Radar</span></button>
    <header className={css.detailHeader}><div><span className={css.detailEyebrow}>外部信号 · {signal.source_name}</span><h1>{signal.title}</h1></div><div className={css.sourceMeta}><span>获取时间</span><time>{signal.captured_at}</time></div></header>
    <div className={css.detailLayout}>
      <div className={css.detailMain}>
        <section className={css.evidenceSection}><div className={css.contentHeading}><span className={css.sectionIndex}>01</span><div><h2>原始来源与 Evidence</h2><p>来源材料 · 不是 AI 改写</p></div></div><div className={css.evidenceCard}><div className={css.evidenceTopline}><strong>{signal.source_name}</strong><span>{signal.evidence.link_label}</span></div><h3>{signal.evidence.original_title}</h3><p>{signal.evidence.original_summary}</p><blockquote>{signal.evidence.quote}</blockquote><div className={css.evidenceFooter}><span>Fixture 来源占位 · 本轮不联网</span><time>{signal.captured_at}</time></div></div></section>
        <section className={css.summarySection}><div className={css.contentHeading}><span className={css.sectionIndex}>02</span><div><h2>AI 摘要</h2><p>对来源材料的归纳 · Fixture</p></div></div><p className={css.summaryText}>{signal.summary}</p></section>
        <section className={css.analysisSection}><div className={css.contentHeading}><span className={css.sectionIndex}>03</span><div><h2>为什么值得关注</h2><p>判断与分析 · 不是来源原话</p></div></div><p className={css.analysisText}>{signal.analysis}</p></section>
      </div>
      <aside className={css.detailAside} aria-label="Fixture 操作">
        <section className={css.actionSection}><div className={css.asideHeading}><h2>下一步</h2><span>本地演示</span></div>
          <button type="button" className={signal.evidence_status === 'saved' ? css.savedAction : css.primaryAction} onClick={onSaveEvidence}>{signal.evidence_status === 'saved' ? 'Evidence 已保存' : '保存为 Evidence'}</button>
          <button type="button" className={css.secondaryAction} onClick={onToggleProjectPicker}>{signal.project_name === null ? '关联 Project' : `已关联 · ${signal.project_name}`}</button>
          {projectPickerOpen && <div className={css.projectPicker}><label htmlFor="fixture-project-picker">选择示例 Project</label><select id="fixture-project-picker" value={signal.project_id ?? ''} onChange={event => { if (event.target.value !== '') onPickProject(event.target.value) }}><option value="">请选择</option>{RADAR_PROJECT_FIXTURES.map(project => <option key={project.project_id} value={project.project_id}>{project.name}</option>)}</select>{saveAfterPick && <small>选择后将本地保存为 Evidence。</small>}</div>}
          {signal.project_name === null && <p className={css.inlineHint}>保存 Evidence 前，请先选择一个示例 Project。</p>}
          {signal.evidence_status === 'saved' && <p className={css.savedNotice} role="status">已保存为示例 Evidence，关联项目：{signal.project_name}</p>}
          <span className={css.actionDivider} />
          {signal.work_status === 'none' ? <button type="button" className={css.secondaryAction} onClick={onOpenWork}>转成 Work</button> : <div className={css.workCreated} role="status"><strong>已生成演示 Work</strong><span>没有写入 Work Runtime</span><button type="button" onClick={onGoToWork}>前往 Work →</button></div>}
          {workConfirmationOpen && <div className={css.workConfirmation}><strong>即将创建演示 Work</strong><dl><div><dt>Work</dt><dd>研究“设计审美训练”搜索趋势</dd></div><div><dt>所属 Project</dt><dd>{signal.project_name ?? '请选择 Project'}</dd></div><div><dt>来源</dt><dd>Radar Signal</dd></div></dl><p>确认只更新当前页面的 Fixture，不创建正式 Work。</p><button type="button" onClick={onConfirmWork}>确认生成演示 Work</button></div>}
        </section>
        <section className={css.relationSection}><div className={css.asideHeading}><h2>关联信息</h2><span>本地关系</span></div><div className={css.relationRow}><span>Project</span><strong>{signal.project_name ?? '尚未关联'}</strong></div><div className={css.relationRow}><span>Evidence</span><strong>{signal.evidence_status === 'saved' ? '已保存（示例）' : '未保存'}</strong></div><div className={css.relationRow}><span>Work</span><strong>{signal.work_status === 'created' ? '演示 Work' : '未创建'}</strong></div></section>
      </aside>
    </div>
  </div>
}

function categoryMatches(category: (typeof RADAR_CATEGORIES)[number], signal: RadarSignalFixture): boolean {
  switch (category) {
    case '全部': return true
    case '小红书': return signal.source_type === 'xiaohongshu'
    case 'AI': return signal.source_type === 'ai'
    case '设计': return signal.source_type === 'design'
    case '商业': return false
    case '生财': return signal.source_type === 'shengcai'
  }
}

function formatTime(value: string | null): string {
  if (value === null) return '时间未提供'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed)
}

function localListStatusText(state: LocalListState, counts: { readonly articles: number; readonly analyses: number } | null): string {
  switch (state) {
    case 'idle': return '等待本地 AIHOT 读取'
    case 'loading': return '正在读取本地 AIHOT'
    case 'ready':
    case 'empty': return `${counts?.articles ?? 0} 篇文章 · ${counts?.analyses ?? 0} 条分析`
    case 'offline': return '本地 AI 情报暂不可用'
    case 'error': return '本地 AI 情报读取失败'
  }
}

function isRadarFailure(error: unknown): error is RadarApiFailure {
  return typeof error === 'object' && error !== null && 'kind' in error && ['timeout', 'offline', 'http', 'schema'].includes(String(error.kind))
}
