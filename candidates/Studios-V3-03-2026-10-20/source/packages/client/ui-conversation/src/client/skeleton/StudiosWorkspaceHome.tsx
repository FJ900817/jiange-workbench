import { useEffect, useState } from 'react'
import type { CreativeSession } from '@deepseek-ai/dsh-business-workbench/types'
import type { ConversationInjected } from '../contract/slots.ts'
import css from './StudiosWorkspaceHomeV3.module.css'

type MediaBridge = NonNullable<ConversationInjected['mediaStudio']>

/** Show the three creation workflows and recent records returned by the active Host. */
export function StudiosWorkspaceHome({ mediaStudio, videoPackagingAvailable, onOpen, onOpenLegacy }: {
  readonly mediaStudio?: ConversationInjected['mediaStudio']
  readonly videoPackagingAvailable: boolean
  readonly onOpen: (view: 'image' | 'video' | 'packaging', sessionId?: string) => void
  readonly onOpenLegacy?: () => void
}) {
  const [recent, setRecent] = useState<readonly CreativeSession[]>([])
  const [recentFilter, setRecentFilter] = useState<'all' | 'image' | 'video' | 'packaging'>('all')
  const [loading, setLoading] = useState(mediaStudio !== undefined)
  const [unavailable, setUnavailable] = useState(false)
  useEffect(() => {
    if (mediaStudio === undefined) { setLoading(false); setUnavailable(true); return }
    let active = true
    const bridge: MediaBridge = mediaStudio
    void Promise.all([bridge.sessions('image'), bridge.sessions('video')]).then(([images, videos]) => {
      if (active) { setRecent([...images, ...videos].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6)); setUnavailable(false) }
    }).catch(() => { if (active) setUnavailable(true) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [mediaStudio])

  const cards: ReadonlyArray<{ id: 'image' | 'video' | 'packaging'; number: string; title: string; description: string; detail: string; action: string; tone: string; disabled: boolean }> = [
    { id: 'image', number: '01', title: 'Image Studio', description: '从提示词与参考图开始，持续生成并管理作品版本。', detail: '图像创作 · 连续会话', action: '进入 Image Studio', tone: 'image', disabled: mediaStudio === undefined },
    { id: 'video', number: '02', title: 'Video Studio', description: '配置视频模型，跟踪异步任务并延续历史创作。', detail: '视频生成 · 任务恢复', action: '进入 Video Studio', tone: 'video', disabled: mediaStudio === undefined },
    { id: 'packaging', number: '03', title: 'Video Packaging', description: '导入视频、编辑时间轴与素材，在 Host 中保存和渲染工程。', detail: '视频包装 · 工程编辑', action: '进入包装编辑器', tone: 'packaging', disabled: !videoPackagingAvailable },
  ]
  const visibleRecent = recentFilter === 'all' ? recent : recentFilter === 'packaging' ? [] : recent.filter(item => item.modality === recentFilter)

  return <main className={css.page} aria-label="Studios 创作工作台">
    <div className={css.content}>
      <header className={css.hero}>
        <div className={css.heroCopy}><span className={css.kicker}>简哥工作台 / 创作空间</span><h1>Studios</h1><p><strong>把灵感，变成作品。</strong> 从图像创作、视频生成到视频包装，让每一次创作都能继续生长。</p>
          <div className={css.heroFoot}><span className={css.mode}><i />{mediaStudio === undefined ? 'Host 服务不可用' : 'Mock 创作模式'}{mediaStudio !== undefined && <small>不请求收费 Provider</small>}</span><span className={css.heroMeta}>SESSION · VERSION · PROJECT</span></div>
        </div>
      </header>
      <section className={css.creation} aria-labelledby="studios-create-heading">
        <div className={css.sectionHead}><div><span className={css.sectionEyebrow}>YOUR CREATIVE SPACE</span><h2 id="studios-create-heading">开始创作</h2></div><span>选择一种工作方式 · 创作记录由 Host 持久保存</span></div>
        <div className={css.cards}>{cards.map(card => <button type="button" key={card.id} className={`${css.card} ${css[card.tone]}`} disabled={card.disabled} onClick={() => { onOpen(card.id) }}>
          <span className={css.cardTop}><span className={css.number}>{card.number}</span><span className={css.glyph} aria-hidden="true">{card.id === 'image' ? '✳' : card.id === 'video' ? '▶' : '▤'}</span></span>
          <span className={css.cardTitle}>{card.title}</span><span className={css.cardDescription}>{card.description}</span>
          <span className={css.cardFooter}><span>{card.detail}</span><strong>{card.action}<i aria-hidden="true">↗</i></strong></span>
        </button>)}</div>
      </section>
      <section className={css.recent} aria-labelledby="studios-recent-heading">
        <div className={css.recentHeading}><div className={css.sectionHead}><div><span className={css.sectionEyebrow}>CONTINUE WHERE YOU LEFT OFF</span><h2 id="studios-recent-heading">最近创作</h2></div><span>真实 Host 记录</span></div>
          <div className={css.filters} role="group" aria-label="最近创作分类">{([['all', '全部'], ['image', '图像'], ['video', '视频'], ['packaging', '包装工程']] as const).map(([id, label]) => <button key={id} type="button" className={recentFilter === id ? css.filterActive : ''} aria-pressed={recentFilter === id} onClick={() => { setRecentFilter(id) }}>{label}{id === 'image' ? ` · ${recent.filter(item => item.modality === 'image').length}` : id === 'video' ? ` · ${recent.filter(item => item.modality === 'video').length}` : ''}</button>)}</div>
        </div>
        {loading ? <div className={css.state}>正在读取 Host 创作记录…</div> : unavailable ? <div className={css.state}>最近创作暂不可读取。请检查当前 Host 连接；这里不会显示示例作品。</div> : visibleRecent.length === 0 ? <div className={css.state}><strong>{recentFilter === 'packaging' ? '暂无可展示的包装工程' : '从一次新创作开始'}</strong><span>{recentFilter === 'packaging' && videoPackagingAvailable ? '当前 Host 支持通过工程 ID 恢复包装项目，但没有工程索引接口；不会伪造最近记录。' : recentFilter === 'packaging' ? 'Host 视频包装服务暂不可用。' : recent.length === 0 ? '新建的会话和作品将保存到当前隔离 Host，并在这里显示。' : '这个分类目前没有 Host 记录。'}</span></div> : <div className={css.recentGrid}>{visibleRecent.map(session => <button type="button" key={session.sessionId} className={css.recentCard} onClick={() => { onOpen(session.modality, session.sessionId) }}>
          <span className={`${css.recentIcon} ${session.modality === 'image' ? css.imageIcon : css.videoIcon}`}>{session.modality === 'image' ? '✳' : '▶'}</span><span className={css.recentInfo}><small>{session.modality === 'image' ? 'IMAGE SESSION' : 'VIDEO SESSION'}</small><strong>{session.title}</strong><span>更新于 {new Date(session.updatedAt).toLocaleString('zh-CN')}</span></span><span className={css.recentArrow} aria-hidden="true">↗</span>
        </button>)}</div>}
        <div className={css.packagingNote}><span className={css.packagingGlyph}>▤</span><div><strong>Video Packaging</strong><p>{videoPackagingAvailable ? '最近工程索引尚不可用；你仍可从 Video Studio 打开或按工程 ID 恢复已有工程。' : 'Host 视频包装服务当前不可用。'}</p></div><button type="button" disabled={!videoPackagingAvailable} onClick={() => { onOpen('packaging') }}>打开包装 ↗</button></div>
        {onOpenLegacy !== undefined && <button type="button" className={css.legacyLink} onClick={onOpenLegacy}>打开原有业务素材审核 ↗</button>}
      </section>
    </div>
  </main>
}
