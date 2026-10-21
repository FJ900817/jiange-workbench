import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  CreateCreativeTurnRequest,
  CreativeSession,
  CreativeSessionRecord,
  MediaStudioModality,
  MediaStudioModel,
  MediaStudioParameterField,
} from '@deepseek-ai/dsh-business-workbench/types'
import type { ConversationInjected } from '../contract/slots.ts'
import css from './MediaCreationStudio.module.css'
import { VideoPackagingEditor } from './VideoPackagingEditor.tsx'
import { StudiosSelect } from './StudiosSelect.tsx'

type MediaStudioBridge = NonNullable<ConversationInjected['mediaStudio']>
type ParamValues = Record<string, string | number | boolean>

/** Host-persisted Mock creation flow; it never fabricates media bytes or contacts providers. */
export function MediaCreationStudio({ modality, bridge, videoPackaging, initialSessionId, initialPackagingOpen = false, onBack }: {
  readonly modality: MediaStudioModality
  readonly bridge: MediaStudioBridge
  readonly videoPackaging?: ConversationInjected['videoPackaging']
  readonly initialSessionId?: string
  readonly initialPackagingOpen?: boolean
  readonly onBack: () => void
}) {
  const [models, setModels] = useState<readonly MediaStudioModel[]>([])
  const [sessions, setSessions] = useState<readonly CreativeSession[]>([])
  const [record, setRecord] = useState<CreativeSessionRecord | null>(null)
  const [modelId, setModelId] = useState('')
  const [params, setParams] = useState<ParamValues>({})
  const [prompt, setPrompt] = useState('')
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null)
  const [modificationIntent, setModificationIntent] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [packagingOpen, setPackagingOpen] = useState(initialPackagingOpen)
  const model = models.find(item => item.modelId === modelId)
  const selectedArtifact = record?.artifacts.find(item => item.artifactId === selectedArtifactId) ?? null
  const presentedVideo = modality === 'video' ? selectedArtifact ?? record?.artifacts.at(-1) ?? null : null
  const presentedVideoTask = record?.tasks.find(task => task.turnId === presentedVideo?.turnId)
  const activePrompt = useMemo(() => prompt.trim(), [prompt])
  const canSubmit = busy === false && model !== undefined && activePrompt.length > 0
    && (selectedArtifact === null || modificationIntent.trim().length > 0)

  const refreshSessions = useCallback(async () => {
    const items = await bridge.sessions(modality)
    setSessions(items)
    return items
  }, [bridge, modality])

  const openSession = useCallback(async (sessionId: string | null) => {
    if (sessionId === null) {
      setRecord(null)
      setSelectedArtifactId(null)
      setNotice('新创作会话将在首次提交时保存。')
      return
    }
    const next = await bridge.read(sessionId)
    setRecord(next)
    setSelectedArtifactId(null)
    setNotice(next === null ? '该会话已不存在。' : '')
  }, [bridge])

  useEffect(() => {
    let active = true
    void Promise.all([bridge.models(modality), bridge.sessions(modality)]).then(([nextModels, nextSessions]) => {
      if (!active) return
      setModels(nextModels)
      setSessions(nextSessions)
      const initialModel = nextModels[0]
      if (initialModel !== undefined) {
        setModelId(initialModel.modelId)
        setParams(parameterDefaults(initialModel))
      }
      const latest = nextSessions.find(item => item.sessionId === initialSessionId) ?? nextSessions[0]
      if (latest !== undefined) return bridge.read(latest.sessionId).then((next) => { if (active) setRecord(next) })
      setNotice('新创作会话将在首次提交时保存。')
      return undefined
    }).catch(() => { if (active) setNotice('Host 媒体创作服务暂不可用。') })
    return () => { active = false }
  }, [bridge, modality, initialSessionId])

  // A saved pending video task is resumed through the Host after the view remounts.
  const pendingTaskId = record?.tasks.find(task => task.modality === 'video' && (task.status === 'queued' || task.status === 'processing'))?.taskId
  useEffect(() => {
    if (pendingTaskId === undefined || record === null) return
    const timer = window.setTimeout(() => {
      void bridge.poll(pendingTaskId).then(() => bridge.read(record.session.sessionId)).then((next) => { if (next !== null) setRecord(next) })
        .catch(() => setNotice('视频 Mock 任务状态暂时无法读取；刷新或重新打开会话后可恢复。'))
    }, 900)
    return () => window.clearTimeout(timer)
  }, [bridge, pendingTaskId, record])

  const chooseModel = (nextId: string) => {
    const next = models.find(item => item.modelId === nextId)
    if (next === undefined) return
    setModelId(next.modelId)
    setParams(parameterDefaults(next))
  }

  const submit = async () => {
    if (model === undefined || activePrompt.length === 0 || busy) return
    setBusy(true)
    setNotice('')
    const request: CreateCreativeTurnRequest = {
      modality, modelId: model.modelId, prompt: activePrompt,
      params: params as CreateCreativeTurnRequest['params'],
      ...(record === null ? {} : { sessionId: record.session.sessionId }),
      ...(selectedArtifact === null ? {} : { parentArtifactId: selectedArtifact.artifactId }),
      ...(selectedArtifact !== null && modificationIntent.trim() !== '' ? { modificationIntent: modificationIntent.trim() } : {}),
      ...(typeof params.outputCount === 'number' ? { requestedOutputCount: params.outputCount } : {}),
    }
    try {
      const next = await bridge.create(request)
      setRecord(next)
      setPrompt('')
      setModificationIntent('')
      setNotice('Mock 任务已保存到当前创作会话；没有调用媒体 Provider。')
      await refreshSessions()
    } catch {
      setNotice('任务未能保存。原有创作历史保持不变。')
    } finally {
      setBusy(false)
    }
  }

  const clearReference = () => {
    setSelectedArtifactId(null)
    setModificationIntent('')
  }

  const title = modality === 'image' ? 'Image Studio · 连续创作' : 'Video Studio · 连续创作'
  if (modality === 'video' && packagingOpen) {
    if (videoPackaging === undefined) return <main><button type="button" onClick={() => { setPackagingOpen(false) }}>← 返回 Video Studio</button><p>Host 视频包装 Remote 暂不可用。</p></main>
    return <VideoPackagingEditor bridge={videoPackaging} onBack={() => { setPackagingOpen(false) }} />
  }
  return <main className={`${css.root} ${modality === 'video' ? css.video : css.imageRoot}`} aria-label={title}>
    <header className={css.header}>
      <div><button type="button" className={css.back} onClick={onBack}>← 返回 Studios</button><span className={css.eyebrow}>HOST 持久化 · MOCK ONLY</span><h1>{title}</h1><p>创作记录保存在 Business Workbench；此阶段不会发送真实生成请求。</p>{modality === 'video' && <button type="button" className={css.packagingEntry} onClick={() => { setPackagingOpen(true) }}>进入 Video Packaging <span aria-hidden="true">↗</span></button>}</div>
      <label className={css.sessionPicker}>当前会话<StudiosSelect label="历史创作会话" value={record?.session.sessionId ?? ''} options={[{ value: '', label: '新建会话' }, ...sessions.map(item => ({ value: item.sessionId, label: `${item.title} · ${new Date(item.updatedAt).toLocaleString('zh-CN')}` }))]} onChange={(value) => { void openSession(value || null) }} /></label>
    </header>
    <div className={`${css.layout} ${modality === 'image' ? css.imageLayout : css.videoLayout}`}>
      <aside className={css.composer} aria-label="创作参数">
        <div className={css.composerTitle}><h2>新一轮创作</h2><span>不覆盖历史作品</span></div>
        <label>模型<StudiosSelect label="媒体生成模型" value={modelId} options={models.map(item => ({ value: item.modelId, label: item.displayName }))} onChange={chooseModel} /></label>
        <div className={css.parameterList}>{model?.parameterFields.map(field => <ParameterControl key={field.id} field={field} value={params[field.id]} onChange={(value) => { setParams(current => ({ ...current, [field.id]: value })) }} />)}</div>
        {selectedArtifact !== null && <div className={css.reference}><div><strong>当前参考作品</strong><small>{selectedArtifact.artifactId} · {statusLabel(selectedArtifact.status)}</small>{modality === 'video' && <small>此 Provider 不支持对原视频精确编辑；新任务为提示词驱动的重新生成。</small>}</div><button type="button" onClick={clearReference}>解除</button>{modality === 'image' && model?.supportsReferenceArtifact && <span>以此为图像参考</span>}</div>}
        <label className={css.promptLabel}>提示词<textarea value={prompt} onChange={event => setPrompt(event.target.value)} maxLength={20_000} placeholder={modality === 'image' ? '描述希望生成的图像…' : '描述希望生成的视频…'} /></label>
        {selectedArtifact !== null && <label>修改意图<input value={modificationIntent} onChange={event => setModificationIntent(event.target.value)} maxLength={2_000} placeholder="说明相对所选作品的修改意图" /></label>}
        <button type="button" className={css.submit} disabled={!canSubmit} onClick={() => { void submit() }}>{busy ? '保存 Mock 任务…' : selectedArtifact === null ? '创建 Mock 任务' : '创建 Mock 版本'}</button>
        {notice !== '' && <p className={css.notice} role="status">{notice}</p>}
        <p className={css.disclaimer}>结果以 Mock 作品记录显示，不包含伪造的图片或视频文件。每轮参数、任务和版本关系都会持久保存。</p>
      </aside>
      {modality === 'image' && <section className={css.imagePreview} aria-label="图像作品展示">
        <header className={css.previewHeader}><div><span>CANVAS · HOST RECORD</span><strong>{selectedArtifact === null ? '创作预览' : `作品 ${selectedArtifact.artifactId.slice(0, 12)}`}</strong></div><span className={css.previewBadge}>MOCK 记录</span></header>
        <div className={css.previewStage}>
          {selectedArtifact === null ? <div className={css.previewEmpty}><span aria-hidden="true">✳</span><strong>作品展示区</strong><p>当前 Host Mock Provider 只记录创作任务和作品元数据，不生成图像文件。选择右侧历史作品查看其真实记录。</p></div> : <div className={css.mockArtwork}>
            <span className={css.mockArtworkGlyph} aria-hidden="true">✳</span><span className={css.mockArtworkLabel}>MOCK ARTIFACT</span><strong>图片文件未生成</strong><p>此作品是 Host 保存的结构化记录，不含可预览的图像内容。</p><code>{selectedArtifact.artifactId}</code>
            <span className={css.mockArtworkRelation}>{selectedArtifact.parentArtifactId === null ? '原始作品' : `派生自 ${selectedArtifact.parentArtifactId.slice(0, 12)} · 第 ${selectedArtifact.revisionDepth} 版`}</span>
          </div>}
        </div>
        <footer className={css.previewFooter}><span>{model?.displayName ?? '尚未选择模型'}</span><span>{selectedArtifact === null ? `${record?.artifacts.length ?? 0} 个作品记录` : statusLabel(selectedArtifact.status)}</span></footer>
      </section>}
      {modality === 'video' && <section className={`${css.imagePreview} ${css.videoPreview}`} aria-label="视频作品展示">
        <header className={css.previewHeader}><div><span>VIDEO · HOST RECORD</span><strong>{presentedVideo === null ? '视频创作预览' : `作品 ${presentedVideo.artifactId.slice(0, 12)}`}</strong></div><span className={css.previewBadge}>MOCK · 无视频文件</span></header>
        <div className={css.previewStage}>
          <div className={css.videoMockStage}>
            <span className={css.videoMockMark} aria-hidden="true">▶</span>
            <strong>{presentedVideo === null ? '视频作品将在这里呈现' : presentedVideo.status === 'completed' ? '任务已完成，未生成视频文件' : statusLabel(presentedVideo.status)}</strong>
            <p>{presentedVideo === null ? '提交 Mock 任务或选择右侧历史作品，查看 Host 保存的创作记录。' : '当前隔离环境只验证任务和版本记录，不提供可播放的媒体预览。'}</p>
            {presentedVideoTask !== undefined && <div className={css.videoTaskState}><span>{statusLabel(presentedVideoTask.status)}</span><span>任务进度 {presentedVideoTask.progress}%</span><span>Provider 请求 {presentedVideoTask.providerNetworkRequests}</span></div>}
          </div>
        </div>
        <footer className={css.previewFooter}><span>{model?.displayName ?? '尚未选择模型'}</span><span>{presentedVideo === null ? `${record?.artifacts.length ?? 0} 个作品记录` : presentedVideo.parentArtifactId === null ? '原始作品' : `派生版本 · 第 ${presentedVideo.revisionDepth} 版`}</span></footer>
      </section>}
      <section className={css.history} aria-label="连续创作历史">
        <div className={css.historyHeader}><strong>{record === null ? '新创作' : record.session.title}</strong><span>{record?.turns.length ?? 0} 轮 · {record?.artifacts.length ?? 0} 个作品记录</span></div>
        {record === null || record.turns.length === 0 ? <div className={css.empty}>提交第一轮 Mock 任务后，创作历史会保存在此处。</div> : <div className={css.turnList}>
          {record.turns.map((turn) => {
            const turnArtifacts = record.artifacts.filter(item => item.turnId === turn.turnId)
            const turnTasks = record.tasks.filter(item => item.turnId === turn.turnId)
            return <article className={css.turn} key={turn.turnId}>
              <header><div><strong>{turn.prompt}</strong><small>{turn.provider} · {turn.modelId} · {new Date(turn.createdAt).toLocaleString('zh-CN')}</small></div><span className={css.status}>{statusLabel(turn.status)}</span></header>
              {turn.operation === 'prompted-regeneration-not-precise-edit' && <p className={css.caveat}>本模型未提供对旧视频的精确编辑能力；该操作仅记录修改意图并重新生成，不代表视频被定点编辑。</p>}
              <div className={css.artifactGrid}>{turnArtifacts.map(artifact => <button type="button" key={artifact.artifactId} className={`${css.artifact} ${selectedArtifactId === artifact.artifactId ? css.selected : ''}`} aria-pressed={selectedArtifactId === artifact.artifactId} onClick={() => { setSelectedArtifactId(artifact.artifactId) }}>
                <span className={css.artifactVisual}>{artifact.status === 'completed' ? <span className={css.mockIcon}>{modality === 'image' ? '▧' : '▶'}</span> : <span className={css.progress}>{statusLabel(artifact.status)}</span>}</span>
                <span className={css.artifactMeta}><strong>{modality === 'image' ? `Mock 图片作品 ${artifact.displayIndex + 1}` : 'Mock 视频作品'}</strong><small>{statusLabel(artifact.status)} · {artifact.artifactId.slice(0, 16)}</small><small>{artifact.parentArtifactId === null ? '原始作品' : `基于 ${artifact.parentArtifactId.slice(0, 10)}… 的版本 ${artifact.revisionDepth}`}</small></span>
              </button>)}</div>
              {turnTasks.map(task => <div className={css.task} key={task.taskId}><span>任务 {task.taskId.slice(0, 12)}…</span><span>{statusLabel(task.status)}{task.modality === 'video' ? ` · ${task.progress}%` : ''}</span><span>Provider 请求：{task.providerNetworkRequests}</span>{task.status === 'queued' || task.status === 'processing' ? <button type="button" onClick={() => { void bridge.cancel(task.taskId).then(() => bridge.read(record.session.sessionId)).then((next) => { if (next !== null) setRecord(next) }) }}>取消 Mock 任务</button> : null}</div>)}
            </article>
          })}
        </div>}
      </section>
    </div>
  </main>
}

function ParameterControl({ field, value, onChange }: { readonly field: MediaStudioParameterField; readonly value: unknown; readonly onChange: (value: string | number | boolean) => void }) {
  if (field.type === 'select') return <label>{field.label}<StudiosSelect label={field.label} value={String(value ?? field.default)} options={(field.options ?? []).map(option => ({ value: String(option), label: String(option) }))} onChange={(nextValue) => {
    const numericOption = field.options?.find(option => typeof option === 'number')
    onChange(typeof numericOption === 'number' ? Number(nextValue) : nextValue)
  }} /></label>
  if (field.type === 'toggle') return <label className={css.toggle}>{field.label}<input type="checkbox" checked={value === true} onChange={(event) => { onChange(event.target.checked) }} /></label>
  if (field.type === 'range') return <label>{field.label} · {String(value ?? field.default)}<input type="range" min={field.min} max={field.max} step={field.step} value={Number(value ?? field.default)} onChange={(event) => { onChange(Number(event.target.value)) }} /></label>
  return <label>{field.label}<input value={String(value ?? field.default)} maxLength={5_000} onChange={(event) => { onChange(event.target.value) }} /></label>
}

function statusLabel(status: string): string {
  return ({ queued: '排队中', processing: '处理中', completed: '已完成', failed: '失败', cancelled: '已取消', timeout: '超时' } as Record<string, string>)[status] ?? status
}

function parameterDefaults(model: MediaStudioModel): ParamValues {
  const values: ParamValues = {}
  for (const [key, value] of Object.entries(model.parameterDefaults)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') values[key] = value
  }
  return values
}
