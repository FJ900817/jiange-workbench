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

type MediaStudioBridge = NonNullable<ConversationInjected['mediaStudio']>
type ParamValues = Record<string, string | number | boolean>

/** Host-persisted Mock creation flow; it never fabricates media bytes or contacts providers. */
export function MediaCreationStudio({ modality, bridge, onBack }: {
  readonly modality: MediaStudioModality
  readonly bridge: MediaStudioBridge
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
  const model = models.find(item => item.modelId === modelId)
  const selectedArtifact = record?.artifacts.find(item => item.artifactId === selectedArtifactId) ?? null
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
      const latest = nextSessions[0]
      if (latest !== undefined) return bridge.read(latest.sessionId).then(next => { if (active) setRecord(next) })
      setNotice('新创作会话将在首次提交时保存。')
      return undefined
    }).catch(() => { if (active) setNotice('Host 媒体创作服务暂不可用。') })
    return () => { active = false }
  }, [bridge, modality])

  // A saved pending video task is resumed through the Host after the view remounts.
  const pendingTaskId = record?.tasks.find(task => task.modality === 'video' && (task.status === 'queued' || task.status === 'processing'))?.taskId
  useEffect(() => {
    if (pendingTaskId === undefined || record === null) return
    const timer = window.setTimeout(() => {
      void bridge.poll(pendingTaskId).then(() => bridge.read(record.session.sessionId)).then(next => { if (next !== null) setRecord(next) })
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
  return <main className={`${css.root} ${modality === 'video' ? css.video : ''}`} aria-label={title}>
    <header className={css.header}>
      <div><button type="button" className={css.back} onClick={onBack}>← 返回 Studios</button><span className={css.eyebrow}>HOST 持久化 · MOCK ONLY</span><h1>{title}</h1><p>创作记录保存在 Business Workbench；此阶段不会发送真实生成请求。</p></div>
      <label className={css.sessionPicker}>历史会话<select value={record?.session.sessionId ?? ''} onChange={event => { void openSession(event.target.value || null) }}><option value="">新建会话</option>{sessions.map(item => <option key={item.sessionId} value={item.sessionId}>{item.title} · {new Date(item.updatedAt).toLocaleString('zh-CN')}</option>)}</select></label>
    </header>
    <div className={css.layout}>
      <aside className={css.composer} aria-label="创作参数">
        <div className={css.composerTitle}><h2>新一轮创作</h2><span>不覆盖历史作品</span></div>
        <label>模型<select value={modelId} onChange={event => chooseModel(event.target.value)}>{models.map(item => <option key={item.modelId} value={item.modelId}>{item.displayName}</option>)}</select></label>
        <div className={css.parameterList}>{model?.parameterFields.map(field => <ParameterControl key={field.id} field={field} value={params[field.id]} onChange={value => { setParams(current => ({ ...current, [field.id]: value })) }} />)}</div>
        {selectedArtifact !== null && <div className={css.reference}><div><strong>当前参考作品</strong><small>{selectedArtifact.artifactId} · {statusLabel(selectedArtifact.status)}</small>{modality === 'video' && <small>此 Provider 不支持对原视频精确编辑；新任务为提示词驱动的重新生成。</small>}</div><button type="button" onClick={clearReference}>解除</button>{modality === 'image' && model?.supportsReferenceArtifact && <span>以此为图像参考</span>}</div>}
        <label className={css.promptLabel}>提示词<textarea value={prompt} onChange={event => setPrompt(event.target.value)} maxLength={20_000} placeholder={modality === 'image' ? '描述希望生成的图像…' : '描述希望生成的视频…'} /></label>
        {selectedArtifact !== null && <label>修改意图<input value={modificationIntent} onChange={event => setModificationIntent(event.target.value)} maxLength={2_000} placeholder="说明相对所选作品的修改意图" /></label>}
        <button type="button" className={css.submit} disabled={!canSubmit} onClick={() => { void submit() }}>{busy ? '保存 Mock 任务…' : selectedArtifact === null ? '创建 Mock 任务' : '创建 Mock 版本'}</button>
        {notice !== '' && <p className={css.notice} role="status">{notice}</p>}
        <p className={css.disclaimer}>结果以 Mock 作品记录显示，不包含伪造的图片或视频文件。每轮参数、任务和版本关系都会持久保存。</p>
      </aside>
      <section className={css.history} aria-label="连续创作历史">
        <div className={css.historyHeader}><strong>{record === null ? '新创作' : record.session.title}</strong><span>{record?.turns.length ?? 0} 轮 · {record?.artifacts.length ?? 0} 个作品记录</span></div>
        {record === null || record.turns.length === 0 ? <div className={css.empty}>提交第一轮 Mock 任务后，创作历史会保存在此处。</div> : <div className={css.turnList}>
          {record.turns.map(turn => {
            const turnArtifacts = record.artifacts.filter(item => item.turnId === turn.turnId)
            const turnTasks = record.tasks.filter(item => item.turnId === turn.turnId)
            return <article className={css.turn} key={turn.turnId}>
              <header><div><strong>{turn.prompt}</strong><small>{turn.provider} · {turn.modelId} · {new Date(turn.createdAt).toLocaleString('zh-CN')}</small></div><span className={css.status}>{statusLabel(turn.status)}</span></header>
              {turn.operation === 'prompted-regeneration-not-precise-edit' && <p className={css.caveat}>本模型未提供对旧视频的精确编辑能力；该操作仅记录修改意图并重新生成，不代表视频被定点编辑。</p>}
              <div className={css.artifactGrid}>{turnArtifacts.map(artifact => <button type="button" key={artifact.artifactId} className={`${css.artifact} ${selectedArtifactId === artifact.artifactId ? css.selected : ''}`} aria-pressed={selectedArtifactId === artifact.artifactId} onClick={() => { setSelectedArtifactId(artifact.artifactId) }}>
                <span className={css.artifactVisual}>{artifact.status === 'completed' ? <span className={css.mockIcon}>{modality === 'image' ? '▧' : '▶'}</span> : <span className={css.progress}>{statusLabel(artifact.status)}</span>}</span>
                <span className={css.artifactMeta}><strong>{modality === 'image' ? `Mock 图片作品 ${artifact.displayIndex + 1}` : 'Mock 视频作品'}</strong><small>{statusLabel(artifact.status)} · {artifact.artifactId.slice(0, 16)}</small><small>{artifact.parentArtifactId === null ? '原始作品' : `基于 ${artifact.parentArtifactId.slice(0, 10)}… 的版本 ${artifact.revisionDepth}`}</small></span>
              </button>)}</div>
              {turnTasks.map(task => <div className={css.task} key={task.taskId}><span>任务 {task.taskId.slice(0, 12)}…</span><span>{statusLabel(task.status)}{task.modality === 'video' ? ` · ${task.progress}%` : ''}</span><span>Provider 请求：{task.providerNetworkRequests}</span>{task.status === 'queued' || task.status === 'processing' ? <button type="button" onClick={() => { void bridge.cancel(task.taskId).then(() => bridge.read(record.session.sessionId)).then(next => { if (next !== null) setRecord(next) }) }}>取消 Mock 任务</button> : null}</div>)}
            </article>
          })}
        </div>}
      </section>
    </div>
  </main>
}

function ParameterControl({ field, value, onChange }: { readonly field: MediaStudioParameterField; readonly value: unknown; readonly onChange: (value: string | number | boolean) => void }) {
  if (field.type === 'select') return <label>{field.label}<select value={String(value ?? field.default)} onChange={event => {
    const numericOption = field.options?.find(option => typeof option === 'number')
    onChange(typeof numericOption === 'number' ? Number(event.target.value) : event.target.value)
  }}>{field.options?.map(option => <option key={String(option)} value={String(option)}>{String(option)}</option>)}</select></label>
  if (field.type === 'toggle') return <label className={css.toggle}>{field.label}<input type="checkbox" checked={value === true} onChange={event => { onChange(event.target.checked) }} /></label>
  if (field.type === 'range') return <label>{field.label} · {String(value ?? field.default)}<input type="range" min={field.min} max={field.max} step={field.step} value={Number(value ?? field.default)} onChange={event => { onChange(Number(event.target.value)) }} /></label>
  return <label>{field.label}<input value={String(value ?? field.default)} maxLength={5_000} onChange={event => { onChange(event.target.value) }} /></label>
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
