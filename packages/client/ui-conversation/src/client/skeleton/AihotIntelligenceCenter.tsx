import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { loadAihotItems, loadAihotReport, loadAihotReportIndex, type AihotCategory, type AihotItemsCursor, type AihotItemsQuery, type AihotPublicItem, type AihotReport, type AihotReportEntry } from './aihot-public-api.ts'
import { RadarApiFailure, clearRadarApiCache, loadRadarStoryDetails, type RadarSignal } from './aihot-radar-adapter.ts'
import css from './AihotIntelligenceCenter.module.css'

type CenterSection = 'home' | 'library' | 'hotspots' | 'reports' | 'mine'
type ReadStatus = 'loading' | 'ready' | 'empty' | 'error' | 'offline' | 'rate_limited'
type ReportKind = AihotReport['kind']
type SortMode = NonNullable<AihotItemsQuery['by']>
type Failure = { readonly kind: string; readonly message: string }

const SECTIONS: readonly { readonly id: CenterSection; readonly label: string }[] = [
  { id: 'home', label: '情报首页' }, { id: 'library', label: '完整资讯库' },
  { id: 'hotspots', label: '热点事件' }, { id: 'reports', label: '情报报告' }, { id: 'mine', label: '我的情报' },
]
const CATEGORIES: readonly { readonly id: AihotCategory; readonly label: string }[] = [
  { id: 'ai-models', label: '模型' }, { id: 'ai-products', label: '产品' }, { id: 'industry', label: '行业' },
  { id: 'paper', label: '论文' }, { id: 'tip', label: '技巧' }, { id: 'opinion', label: '观点' },
]
const REPORTS: readonly { readonly id: ReportKind; readonly label: string }[] = [
  { id: 'daily', label: '日报' }, { id: 'weekly', label: '周报' }, { id: 'monthly', label: '月报' },
]

/** Combines official AIHOT public reads with the existing, separate local-intelligence view. */
export function AihotIntelligenceCenter({ signals, signalStatus, signalFailure, onOpenSignal, onRefreshSignals = () => {}, myIntelligence }: {
  readonly signals: readonly RadarSignal[]
  readonly signalStatus: 'loading' | 'ready' | 'unavailable'
  readonly signalFailure: string | null
  readonly onOpenSignal: (signal: RadarSignal) => void
  readonly onRefreshSignals?: () => void
  readonly myIntelligence: ReactNode
}) {
  const [section, setSection] = useState<CenterSection>('home')
  return <section className={css.root} data-radar-route="/radar/ai" aria-label="AI 情报中心">
    <header className={css.header}><div><span className={css.eyebrow}>AI INTELLIGENCE</span><h1>AI 情报中心</h1><p>AIHOT 官方公共发布与本地“我的情报”分开管理。</p></div><span className={css.publicBadge}>官方公共数据 · 只读</span></header>
    <nav className={css.navigation} aria-label="AI 情报中心">
      {SECTIONS.map(item => <button key={item.id} type="button" aria-current={section === item.id ? 'page' : undefined} onClick={() => { setSection(item.id) }}>{item.label}</button>)}
    </nav>
    {section === 'home' && <Home signals={signals} signalStatus={signalStatus} signalFailure={signalFailure} onOpenSignal={onOpenSignal} onRefreshSignals={onRefreshSignals} onNavigate={setSection} />}
    {section === 'library' && <Library />}
    {section === 'hotspots' && <Hotspots signals={signals} status={signalStatus} failure={signalFailure} onOpen={onOpenSignal} />}
    {section === 'reports' && <Reports />}
    {section === 'mine' && <div className={css.mine}>{myIntelligence}</div>}
  </section>
}

function Home({ signals, signalStatus, signalFailure, onOpenSignal, onRefreshSignals, onNavigate }: {
  readonly signals: readonly RadarSignal[]; readonly signalStatus: 'loading' | 'ready' | 'unavailable'; readonly signalFailure: string | null
  readonly onOpenSignal: (signal: RadarSignal) => void; readonly onRefreshSignals: () => void; readonly onNavigate: (section: CenterSection) => void
}) {
  const focus = signals.find(signal => signal.kind === 'story' && signal.storyId !== null) ?? null
  const hot = signals.filter(signal => signal.signalKey !== focus?.signalKey).slice(0, 4)
  const [focusDetail, setFocusDetail] = useState<RadarSignal | null>(null)
  const [focusFailure, setFocusFailure] = useState<Failure | null>(null)

  useEffect(() => {
    setFocusDetail(null)
    setFocusFailure(null)
    if (focus === null) return
    const controller = new AbortController()
    void loadRadarStoryDetails(focus, fetch, controller.signal).then(setFocusDetail).catch(error => {
      if (!controller.signal.aborted) setFocusFailure(failureFor(error))
    })
    return () => { controller.abort() }
  }, [focus])

  const evidence = (focusDetail?.evidence ?? []).slice().sort((a, b) => timeValue(b.publishedAt) - timeValue(a.publishedAt)).slice(0, 2)
  const isLoading = signalStatus === 'loading'
  const isUnavailable = signalStatus === 'unavailable'
  const readStatus: ReadStatus = isLoading ? 'loading' : isUnavailable ? 'error' : focus === null ? 'empty' : 'ready'
  const failure = signalFailure === null ? null : { kind: signalFailure, message: 'AIHOT 热点读取失败。' }

  return <div className={css.home}>
    <div className={css.homeMasthead}>
      <div><span className={css.homeEyebrow}>AI INTELLIGENCE · {shanghaiDate()}</span><h2>今天，AI 正在发生什么？</h2><p>先看一个焦点，再快速扫过正在发展的事件。</p></div>
      <div className={css.homeActions}><span className={css.readSource}><i />{isLoading ? '正在读取官方数据' : isUnavailable ? '官方数据暂不可用' : 'AIHOT 官方公共数据'}</span><button type="button" onClick={() => { clearRadarApiCache(); onRefreshSignals() }} disabled={isLoading}>刷新</button></div>
    </div>
    {readStatus === 'loading' && <StatusLine status="loading" />}
    {readStatus === 'error' && <StatusLine status="error" failure={failure} />}
    {readStatus === 'empty' && <p className={css.homeEmpty}>AIHOT 官方当前没有可展示的 Story 焦点。</p>}
    {focus !== null && <section className={css.focus} aria-labelledby="aihot-focus-title">
      <div className={css.focusCopy}>
        <div className={css.focusMeta}><span><b>01</b> 今日焦点</span><span>AIHOT Story</span><time>{formatTime(focus.publishedAt)}</time></div>
        <h3 id="aihot-focus-title">{focus.title}</h3>
        <p className={css.focusSummary}>{focusDetail?.summary ?? (focusFailure === null ? '正在读取 AIHOT 官方事件摘要…' : 'AIHOT 事件摘要暂不可用；标题与时间来自热点榜。')}</p>
        <div className={css.focusBottom}><span>{focus.sourceName} · 官方公开数据</span><button type="button" onClick={() => { onOpenSignal(focus) }}>阅读事件详情 <span>↗</span></button></div>
      </div>
      <aside className={css.evidence} aria-label="焦点报道证据">
        <div className={css.evidenceHead}><strong>报道证据</strong><span>来源覆盖，不代表重要性</span></div>
        <div className={css.evidenceMetrics}><div><strong>{focusDetail?.sourceCount ?? focus.sourceCount ?? '—'}</strong><span>{focusDetail === null ? '热榜来源数' : 'Story 来源数'}</span></div><div><strong>{focusDetail?.reportCount ?? '—'}</strong><span>Story 报道数</span></div></div>
        <p className={css.evidenceLabel}>{focusDetail === null ? '读取 Story 统计与报道' : '下方为 Story.reports 最新 2 条'}</p>
        {focusDetail === null && focusFailure === null && <p className={css.evidenceEmpty}>正在读取官方 Story 详情…</p>}
        {focusFailure !== null && <p className={css.evidenceEmpty}>报道明细暂不可用（{focusFailure.kind}）；不会以样本替代。</p>}
        {focusDetail !== null && evidence.length === 0 && <p className={css.evidenceEmpty}>AIHOT 当前未返回报道明细。</p>}
        {evidence.map((report, index) => <div className={css.evidenceRow} key={report.evidenceId}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{report.title}</strong><small>{report.sourceName} · {formatTime(report.publishedAt)}</small></div></div>)}
        <div className={css.evidenceFoot}><span>API 字段：sourceCount / reportCount</span><span>{focus.ranking === null ? '官方热点' : `热榜 #${focus.ranking}`}</span></div>
      </aside>
    </section>}
    <section className={css.hotSection} aria-labelledby="aihot-hotspots-heading">
      <div className={css.homeSectionTitle}><div><span>01 / LIVE RADAR</span><h2 id="aihot-hotspots-heading">热点速览</h2></div><button type="button" onClick={() => { onNavigate('hotspots') }}>全部热点 <b>→</b></button></div>
      {isLoading && signals.length === 0 && <StatusLine status="loading" />}
      {isUnavailable && signals.length === 0 && <StatusLine status="error" failure={failure} />}
      {!isLoading && !isUnavailable && hot.length === 0 && <p className={css.homeEmpty}>当前没有其他可展示的官方热点。</p>}
      {hot.length > 0 && <div className={css.hotGrid}>{hot.map((signal, index) => <button key={signal.signalKey} type="button" className={css.hotCard} onClick={() => { onOpenSignal(signal) }}>
        <span className={css.hotRank}>{String(signal.ranking ?? index + 2).padStart(2, '0')}</span><span className={css.hotBody}><small>{signal.kind === 'story' ? '事件聚合' : '热点资讯'} · {signal.sourceName}</small><strong>{signal.title}</strong><span><em>{signal.sourceCount === null ? '来源数未提供' : `${signal.sourceCount} 个来源`}</em><time>{formatTime(signal.publishedAt)}</time></span></span><span className={css.hotArrow}>↗</span>
      </button>)}</div>}
      <p className={css.homeCaveat}>AIHOT 官方热点榜；来源数仅表示报道覆盖，不代表创作价值、重要性或评分。</p>
    </section>
    <section className={css.explore} aria-labelledby="aihot-explore-heading">
      <div className={css.homeSectionTitle}><div><span>02 / RADAR ROUTES</span><h2 id="aihot-explore-heading">继续探索</h2></div><span className={css.exploreNote}>回到情报中心已有页面</span></div>
      <div className={css.exploreGrid}>
        <ExploreButton index="A" title="完整资讯库" detail="搜索 · 分类 · 时间筛选" onClick={() => { onNavigate('library') }} />
        <ExploreButton index="B" title="热点事件" detail="事件详情与来源报道" onClick={() => { onNavigate('hotspots') }} />
        <ExploreButton index="C" title="情报报告" detail="日报 · 周报 · 月报" onClick={() => { onNavigate('reports') }} />
        <ExploreButton index="D" title="我的情报" detail="独立的本地情报记录" onClick={() => { onNavigate('mine') }} />
      </div>
    </section>
  </div>
}

function ExploreButton({ index, title, detail, onClick }: { readonly index: string; readonly title: string; readonly detail: string; readonly onClick: () => void }) {
  return <button className={css.exploreButton} type="button" onClick={onClick}><span>{index}</span><strong>{title}</strong><small>{detail}</small><b>→</b></button>
}

function Library() {
  const [mode, setMode] = useState<AihotItemsQuery['mode']>('selected')
  const [window, setWindow] = useState<AihotItemsQuery['window']>('7d')
  const [category, setCategory] = useState<AihotCategory | ''>('')
  const [sort, setSort] = useState<SortMode>('timeline')
  const [draft, setDraft] = useState('')
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<readonly AihotPublicItem[]>([])
  const [status, setStatus] = useState<ReadStatus>('loading')
  const [failure, setFailure] = useState<Failure | null>(null)
  const [cursor, setCursor] = useState<AihotItemsCursor | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState<AihotPublicItem | null>(null)
  const requestId = useRef(0)
  const seenCursors = useRef(new Set<string>())
  const queryRef = useRef<AihotItemsQuery>({ mode, window, by: sort, limit: 20 })

  const readFirstPage = useCallback(async (nextQuery: AihotItemsQuery, force = false): Promise<void> => {
    const id = ++requestId.current
    queryRef.current = nextQuery
    if (force) clearRadarApiCache()
    setStatus('loading'); setFailure(null); setCursor(null); setSelectedItem(null)
    try {
      const page = await loadAihotItems(nextQuery)
      if (id !== requestId.current) return
      setItems(page.items); setCursor(page.nextCursor); setUpdatedAt(new Date().toISOString())
      seenCursors.current = new Set(page.nextCursor === null ? [] : [page.nextCursor.value])
      setStatus(page.items.length === 0 ? 'empty' : 'ready')
    } catch (error) {
      if (id !== requestId.current) return
      setFailure(failureFor(error)); setStatus(statusFor(error))
    }
  }, [])

  useEffect(() => { void readFirstPage(queryRef.current); return () => { requestId.current += 1 } }, [readFirstPage])

  const applyFilters = (next: Partial<AihotItemsQuery> = {}): void => {
    const nextQuery: AihotItemsQuery = {
      mode: next.mode ?? mode, window: next.window ?? window, by: next.by ?? sort,
      ...(category === '' ? {} : { category }), ...(query.trim().length < 2 ? {} : { q: query.trim() }),
      ...next,
      limit: 20,
    }
    void readFirstPage(nextQuery)
  }

  const submitSearch = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const trimmed = draft.trim()
    if (trimmed.length === 1) { setFailure({ kind: 'query', message: '关键词至少需要 2 个字符。' }); setStatus('error'); return }
    setQuery(trimmed)
    void readFirstPage({ mode, window, by: sort, ...(category === '' ? {} : { category }), ...(trimmed.length === 0 ? {} : { q: trimmed }), limit: 20 })
  }

  const loadMore = async (): Promise<void> => {
    if (cursor === null || loadingMore) return
    const id = requestId.current
    setLoadingMore(true)
    try {
      const page = await loadAihotItems(queryRef.current, cursor)
      if (id !== requestId.current) return
      setItems(current => {
        const ids = new Set(current.map(item => item.id))
        const appended = page.items.filter(item => { if (ids.has(item.id)) return false; ids.add(item.id); return true })
        return [...current, ...appended]
      })
      if (page.nextCursor !== null && seenCursors.current.has(page.nextCursor.value)) {
        setCursor(null); setFailure({ kind: 'pagination', message: '官方返回了重复 Cursor，已停止分页以避免重复请求。' })
      } else {
        if (page.nextCursor !== null) seenCursors.current.add(page.nextCursor.value)
        setCursor(page.nextCursor)
      }
      setUpdatedAt(new Date().toISOString())
      if (page.items.length === 0 && page.nextCursor !== null) setFailure({ kind: 'pagination', message: '下一页没有新增条目；可继续请求官方返回的下一页 Cursor。' })
    } catch (error) {
      if (id === requestId.current) setFailure(failureFor(error))
    } finally { if (id === requestId.current) setLoadingMore(false) }
  }

  return <div className={css.content}>
    <div className={css.pageHeading}><div><h2>完整资讯库</h2><p>官方公共发布数据 · 不与本地 Article / Analysis 混合</p></div><span>{updatedAt === null ? '尚未读取' : `最近读取 ${formatTime(updatedAt)}`}</span></div>
    <div className={css.filters}>
      <div className={css.pills} role="group" aria-label="资讯范围">{(['selected', 'all'] as const).map(value => <button key={value} type="button" aria-pressed={mode === value} onClick={() => { setMode(value); applyFilters({ mode: value }) }}>{value === 'selected' ? '官方精选' : '全部动态'}</button>)}</div>
      <form className={css.search} onSubmit={submitSearch}><input aria-label="搜索 AI 资讯" value={draft} onChange={event => { setDraft(event.target.value) }} placeholder="搜索 AI 资讯（至少 2 个字符）"/><button type="submit">搜索</button></form>
      <label>时间窗<select value={window} onChange={event => { const value = event.target.value as AihotItemsQuery['window']; setWindow(value); applyFilters({ window: value }) }}><option value="24h">24 小时</option><option value="7d">7 天</option></select></label>
      <label>排序<select value={sort} onChange={event => { const value = event.target.value as SortMode; setSort(value); applyFilters({ by: value }) }}><option value="timeline">站内时间线</option><option value="published">原始发布时间</option></select></label>
      <label>分类<select value={category} onChange={event => { const value = event.target.value as AihotCategory | ''; setCategory(value); void readFirstPage({ mode, window, by: sort, ...(value === '' ? {} : { category: value }), ...(query.length < 2 ? {} : { q: query }), limit: 20 }) }}><option value="">全部分类</option>{CATEGORIES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
    </div>
    <p className={css.queryMeta}>{query.length >= 2 ? `搜索：${query}` : '结果由官方 API 返回；客户端不按关键词二次过滤。'}{items.length > 0 ? ` · ${items.length} 条已加载` : ''}</p>
    {status === 'loading' && items.length === 0 && <StatusLine status="loading" />}
    {status === 'empty' && <p className={css.empty}>该官方查询当前没有可展示资讯。</p>}
    {(status === 'offline' || status === 'error' || status === 'rate_limited') && <StatusLine status={status} failure={failure} hasData={items.length > 0} />}
    {items.length > 0 && <div className={css.libraryLayout}>
      <div className={css.itemGrid}>{items.map(item => <ItemCard key={item.id} item={item} onOpen={() => { setSelectedItem(item) }} />)}</div>
      {selectedItem !== null && <ItemDetail item={selectedItem} onClose={() => { setSelectedItem(null) }} />}
    </div>}
    {failure !== null && status === 'ready' && <p className={css.inlineNotice} role="status">{failure.message}</p>}
    {cursor !== null && <button className={css.loadMore} type="button" onClick={() => { void loadMore() }} disabled={loadingMore}>{loadingMore ? '正在加载下一页…' : '加载更多'}</button>}
    {cursor === null && items.length > 0 && <p className={css.endOfList}>已到官方返回的最后一页。</p>}
  </div>
}

function Hotspots({ signals, status, failure, onOpen }: { readonly signals: readonly RadarSignal[]; readonly status: 'loading' | 'ready' | 'unavailable'; readonly failure: string | null; readonly onOpen: (signal: RadarSignal) => void }) {
  return <div className={css.content}><div className={css.pageHeading}><div><h2>热点事件</h2><p>官方热点榜与事件聚合，详情展示来源报道与时间线。</p></div><span>AIHOT Public API</span></div>
    {status === 'loading' && <StatusLine status="loading"/>}
    {status === 'unavailable' && <StatusLine status="error" failure={{ kind: failure ?? 'unknown', message: '热点列表读取失败。' }} />}
    {status === 'ready' && signals.length === 0 && <p className={css.empty}>官方当前没有可展示的热点事件。</p>}
    {signals.length > 0 && <div className={css.hotList}>{signals.map(signal => <SignalCard key={signal.signalKey} signal={signal} onOpen={onOpen} />)}</div>}
  </div>
}

function Reports() {
  const [kind, setKind] = useState<ReportKind>('daily')
  const [entries, setEntries] = useState<readonly AihotReportEntry[]>([])
  const [status, setStatus] = useState<ReadStatus>('loading')
  const [failure, setFailure] = useState<Failure | null>(null)
  const [detail, setDetail] = useState<AihotReport | null>(null)
  const [detailState, setDetailState] = useState<ReadStatus>('empty')
  const [detailFailure, setDetailFailure] = useState<Failure | null>(null)
  const [indexCheckedAt, setIndexCheckedAt] = useState<string | null>(null)
  const requestId = useRef(0)

  const loadIndex = useCallback(async (selectedKind: ReportKind, force = false): Promise<void> => {
    const id = ++requestId.current
    if (force) clearRadarApiCache()
    setStatus('loading'); setFailure(null); setEntries([]); setDetail(null); setDetailState('empty'); setDetailFailure(null)
    try {
      const result = await loadAihotReportIndex(selectedKind, selectedKind === 'daily' ? 30 : 12)
      if (id !== requestId.current) return
      setEntries(result); setIndexCheckedAt(new Date().toISOString())
      if (result.length > 0) { setStatus('ready'); return }
      try {
        const latest = await loadAihotReport(selectedKind, 'latest')
        if (id !== requestId.current) return
        setDetail(latest); setDetailState('ready'); setStatus('empty')
        setFailure({ kind: 'index_detail_mismatch', message: '官方索引返回空列表，但 latest 详情可读取；该报告不会伪装成索引条目。' })
      } catch (latestError) {
        if (id !== requestId.current) return
        if (latestError instanceof RadarApiFailure && latestError.status === 404) setStatus('empty')
        else { setStatus(statusFor(latestError)); setFailure(failureFor(latestError)) }
      }
    } catch (error) {
      if (id !== requestId.current) return
      setStatus(statusFor(error)); setFailure(failureFor(error))
    }
  }, [])

  useEffect(() => { void loadIndex(kind); return () => { requestId.current += 1 } }, [kind, loadIndex])

  const openReport = async (key: string): Promise<void> => {
    const id = ++requestId.current
    setDetail(null); setDetailState('loading'); setDetailFailure(null)
    try {
      const result = await loadAihotReport(kind, key)
      if (id !== requestId.current) return
      setDetail(result); setDetailState('ready')
    } catch (error) {
      if (id !== requestId.current) return
      setDetailState(statusFor(error)); setDetailFailure(failureFor(error))
    }
  }

  return <div className={css.content}>
    <div className={css.pageHeading}><div><h2>情报报告</h2><p>官方周期报告索引和对应详情；索引空与请求失败分开显示。</p></div><button type="button" onClick={() => { void loadIndex(kind, true) }} disabled={status === 'loading'}>更新索引</button></div>
    <div className={css.pills} role="tablist" aria-label="报告周期">{REPORTS.map(report => <button key={report.id} type="button" role="tab" aria-selected={kind === report.id} onClick={() => { setKind(report.id) }}>{report.label}</button>)}</div>
    <p className={css.queryMeta}>{indexCheckedAt === null ? '正在读取官方索引' : `索引最近读取 ${formatTime(indexCheckedAt)}`}</p>
    {status === 'loading' && <StatusLine status="loading" />}
    {status === 'empty' && entries.length === 0 && <p className={css.empty}>官方索引当前没有可展示的{reportLabel(kind)}期号。</p>}
    {(status === 'offline' || status === 'error' || status === 'rate_limited') && <StatusLine status={status} failure={failure} />}
    {failure?.kind === 'index_detail_mismatch' && <p className={css.inlineNotice} role="status">{failure.message}</p>}
    {entries.length > 0 && <div className={css.reportList}>{entries.map(entry => <button key={entry.key} type="button" className={css.reportEntry} onClick={() => { void openReport(entry.key) }}><span><strong>{entry.headline ?? `${reportLabel(kind)} ${entry.key}`}</strong><small>{entry.key} · 发布 {formatTime(entry.generatedAt)}</small></span><span>查看详情 →</span></button>)}</div>}
    {detailState === 'loading' && <StatusLine status="loading" />}
    {detailState === 'offline' || detailState === 'error' || detailState === 'rate_limited' ? <StatusLine status={detailState} failure={detailFailure} /> : null}
    {detailState === 'ready' && detail !== null && <ReportDetail report={detail} />}
  </div>
}

function ReportDetail({ report }: { readonly report: AihotReport }) {
  return <article className={css.reportDetail}>
    <header><span>{reportLabel(report.kind).toUpperCase()} · {report.key}</span><h3>{report.headline ?? `${reportLabel(report.kind)} ${report.key}`}</h3><p>AIHOT 官方报告 · {formatTime(report.generatedAt)} · 覆盖 {formatTime(report.windowStart)} — {formatTime(report.windowEnd)}</p>{report.overview !== null && <p>{report.overview}</p>}<a href={report.aihotUrl} target="_blank" rel="noopener noreferrer">打开 AIHOT 原文 ↗</a></header>
    {report.sections.map((section, index) => <section key={`${section.label}-${index}`}><h4>{section.label}</h4>{section.summary !== null && <p>{section.summary}</p>}<div>{section.items.map((item, itemIndex) => <article key={`${item.title}-${itemIndex}`}><h5>{item.title}</h5><p>{item.summary}</p><small>{item.sourceName}{item.publishedAt === null ? '' : ` · ${formatTime(item.publishedAt)}`}</small><div>{item.aihotUrl !== null && <a href={item.aihotUrl} target="_blank" rel="noopener noreferrer">AIHOT ↗</a>}<a href={item.originalUrl} target="_blank" rel="noopener noreferrer">原始来源 ↗</a></div></article>)}</div></section>)}
    {report.flashes.length > 0 && <section><h4>快讯</h4>{report.flashes.map((flash, index) => <p key={`${flash.title}-${index}`}>{flash.title} · {flash.sourceName} · {formatTime(flash.publishedAt)} · <a href={flash.originalUrl} target="_blank" rel="noopener noreferrer">来源 ↗</a></p>)}</section>}
  </article>
}

function ItemDetail({ item, onClose }: { readonly item: AihotPublicItem; readonly onClose: () => void }) {
  return <aside className={css.itemDetail} aria-label="AIHOT 资讯详情"><button type="button" onClick={onClose}>关闭详情</button><span>AIHOT 官方公开记录</span><h3>{item.title}</h3>{item.originalTitle !== null && <p>原始标题：{item.originalTitle}</p>}{item.summary !== null && <p>{item.summary}</p>}<dl><div><dt>来源</dt><dd>{item.sourceName}</dd></div><div><dt>发布时间</dt><dd>{item.publishedAt === null ? '来源未提供' : formatTime(item.publishedAt)}</dd></div><div><dt>分类</dt><dd>{categoryLabel(item.category)}</dd></div><div><dt>官方精选</dt><dd>{item.selected ? '是' : '否'}</dd></div></dl><div>{item.reason !== null && <p>官方精选说明：{item.reason}</p>}{item.attribution !== null && <p>署名：{item.attribution.name}</p>}<a href={item.aihotUrl} target="_blank" rel="noopener noreferrer">AIHOT 记录 ↗</a>{item.originalUrl !== null && <a href={item.originalUrl} target="_blank" rel="noopener noreferrer">原始文章 ↗</a>}</div><p className={css.note}>官方 API 未提供独立 Item 详情路由；此处展示列表记录实际返回字段，不补造正文。</p></aside>
}

function ItemCard({ item, onOpen }: { readonly item: AihotPublicItem; readonly onOpen: () => void }) {
  return <article className={css.itemCard}><div><span>{item.selected ? '官方精选' : categoryLabel(item.category)}</span><time>{formatTime(item.publishedAt ?? item.discoveredAt)}</time></div><button type="button" onClick={onOpen}><strong>{item.title}</strong></button>{item.summary !== null && <p>{item.summary}</p>}<footer><span>{item.sourceName}</span><button type="button" onClick={() => { window.open(item.originalUrl ?? item.aihotUrl, '_blank', 'noopener,noreferrer') }}>原文 ↗</button></footer></article>
}

function SignalCard({ signal, onOpen }: { readonly signal: RadarSignal; readonly onOpen: (signal: RadarSignal) => void }) {
  return <button type="button" className={css.signalCard} aria-label={`打开信号：${signal.title}`} onClick={() => { onOpen(signal) }}><span>{signal.kind === 'story' ? '热点事件' : '公共资讯'}{signal.ranking === null ? '' : ` · 热榜 #${signal.ranking}`}</span><strong>{signal.title}</strong><small>{signal.sourceNames.join('、') || signal.sourceName} · {formatTime(signal.publishedAt)}</small></button>
}

function StatusLine({ status, failure, hasData = false }: { readonly status: ReadStatus; readonly failure?: Failure | null; readonly hasData?: boolean }) {
  if (status === 'loading') return <p className={css.status} role="status">正在读取官方 AIHOT 数据…</p>
  const label = status === 'offline' ? '网络不可用' : status === 'rate_limited' ? '请求受限' : '官方数据读取失败'
  return <p className={css.error} role="alert">{hasData ? `刷新失败，仍显示上次成功结果。` : `${label}。`}{failure === null || failure === undefined ? '' : ` ${failure.kind} · ${failure.message}`}</p>
}

function statusFor(error: unknown): ReadStatus {
  if (error instanceof RadarApiFailure && error.kind === 'offline') return 'offline'
  if (error instanceof RadarApiFailure && error.kind === 'rate_limit') return 'rate_limited'
  return 'error'
}

function failureFor(error: unknown): Failure {
  if (error instanceof RadarApiFailure) return { kind: error.kind === 'http' && error.status !== null ? `HTTP_${error.status}` : error.kind, message: error.message }
  return { kind: 'unexpected', message: '请求未完成。' }
}

function formatTime(value: string | null): string {
  if (value === null) return '时间未提供'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '时间未提供'
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
}

function timeValue(value: string | null): number {
  if (value === null) return 0
  const parsed = new Date(value).valueOf()
  return Number.isFinite(parsed) ? parsed : 0
}

function shanghaiDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).replaceAll('-', '.')
}

function categoryLabel(category: string | null): string {
  return CATEGORIES.find(item => item.id === category)?.label ?? (category === null ? '分类未提供' : category)
}

function reportLabel(kind: ReportKind): string { return REPORTS.find(item => item.id === kind)?.label ?? '报告' }
