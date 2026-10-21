import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ConversationInjected } from '../contract/slots.ts'
import { editorHtml, editorCss, editorJs, packagingPlanJs, assetRetrievalJs } from './video-packaging/embedded-editor.ts'
import { videoPackagingTheme } from './video-packaging/video-packaging-theme.ts'
import css from './MediaCreationStudio.module.css'

type VideoPackagingBridge = NonNullable<ConversationInjected['videoPackaging']>
type RequestMessage = { readonly kind: 'dsh-video-packaging-request'; readonly id: string; readonly url: string; readonly method: string; readonly headers: Record<string, string>; readonly body: unknown }
type Result = { readonly status: number; readonly body: unknown; readonly contentType?: string }

/** Embed the P5-07 editor in the formal Client and route all data through Host Remotes. */
export function VideoPackagingEditor({ bridge, onBack }: { readonly bridge: VideoPackagingBridge; readonly onBack: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [projectId, setProjectId] = useState(() => new URLSearchParams(location.search).get('videoPackagingProject') ?? '')
  const [renderedOutputUrl, setRenderedOutputUrl] = useState<string | null>(null)
  const [libraryCollapsed, setLibraryCollapsed] = useState(() => window.innerWidth <= 980)
  const [inspectorCollapsed, setInspectorCollapsed] = useState(() => window.innerWidth <= 980)
  const previousNarrow = useRef(window.innerWidth <= 980)
  const projectIdRef = useRef(projectId)
  const outputAssetId = useRef<string | null>(null)
  const renderedOutputUrlRef = useRef<string | null>(null)
  projectIdRef.current = projectId
  const [notice, setNotice] = useState('工程与媒体均由隔离 Harness Host 管理；只接受 MP4 和透明 PNG。')

  const source = useMemo(() => buildDocument(), [])
  const openProject = useCallback((id: string) => {
    const next = new URL(location.href)
    if (id) next.searchParams.set('videoPackagingProject', id)
    else next.searchParams.delete('videoPackagingProject')
    history.replaceState(history.state, '', next)
    projectIdRef.current = id
    setProjectId(id)
  }, [])

  const handleRequest = useCallback(async (event: MessageEvent<RequestMessage>) => {
    if (event.source !== frame.current?.contentWindow || event.data?.kind !== 'dsh-video-packaging-request') return
    const request = event.data
    try {
      const result = await dispatch(request, bridge, projectIdRef.current, openProject, outputAssetId)
      if (request.url === '/rendered/output.mp4' && result.status === 200 && result.body instanceof Blob) {
        if (renderedOutputUrlRef.current) URL.revokeObjectURL(renderedOutputUrlRef.current)
        renderedOutputUrlRef.current = URL.createObjectURL(result.body)
        setRenderedOutputUrl(renderedOutputUrlRef.current)
      }
      frame.current?.contentWindow?.postMessage({ kind: 'dsh-video-packaging-response', id: request.id, ...result }, '*')
      if (request.url === '/api/project' && request.method === 'POST') setNotice('工程修改已通过 Host Remote 持久化。')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Host 操作失败'
      frame.current?.contentWindow?.postMessage({ kind: 'dsh-video-packaging-response', id: request.id, status: 500, body: { error: message } }, '*')
      setNotice(`Host 操作失败：${message}`)
    }
  }, [bridge, openProject])

  const reloadProject = () => {
    openProject(projectId.trim())
    frame.current?.contentWindow?.postMessage({ kind: 'dsh-video-packaging-open', projectId: projectId.trim() }, '*')
  }
  const togglePanel = (panel: 'library' | 'inspector') => {
    const nextLibrary = panel === 'library' ? !libraryCollapsed : libraryCollapsed
    const nextInspector = panel === 'inspector' ? !inspectorCollapsed : inspectorCollapsed
    const library = window.innerWidth <= 980 && panel === 'inspector' && !nextInspector ? true : nextLibrary
    const inspector = window.innerWidth <= 980 && panel === 'library' && !nextLibrary ? true : nextInspector
    setLibraryCollapsed(library)
    setInspectorCollapsed(inspector)
    frame.current?.contentWindow?.postMessage({ kind: 'dsh-video-packaging-panels', library, inspector }, '*')
  }
  const syncPanels = () => frame.current?.contentWindow?.postMessage({ kind: 'dsh-video-packaging-panels', library: libraryCollapsed, inspector: inspectorCollapsed }, '*')

  useEffect(() => {
    window.addEventListener('message', handleRequest)
    return () => {
      window.removeEventListener('message', handleRequest)
      if (renderedOutputUrlRef.current) URL.revokeObjectURL(renderedOutputUrlRef.current)
    }
  }, [handleRequest])

  useEffect(() => {
    const resize = () => {
      const narrow = window.innerWidth <= 980
      if (narrow === previousNarrow.current) return
      previousNarrow.current = narrow
      setLibraryCollapsed(narrow)
      setInspectorCollapsed(narrow)
      frame.current?.contentWindow?.postMessage({ kind: 'dsh-video-packaging-panels', library: narrow, inspector: narrow }, '*')
    }
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  return <main className={css.packagingRoot} aria-label="Video Packaging 沉浸式编辑器">
    <header className={css.packagingHeader}>
      <div className={css.packagingMainRow}><div className={css.packagingIdentity}><button type="button" onClick={onBack}>← 返回 Video Studio</button><div><span className={css.eyebrow}>STUDIOS · VIDEO</span><strong>Video Packaging</strong></div></div>
        <div className={css.packagingControls}><button type="button" aria-pressed={libraryCollapsed} onClick={() => { togglePanel('library') }}>{libraryCollapsed ? '显示素材' : '收起素材'}</button><button type="button" aria-pressed={inspectorCollapsed} onClick={() => { togglePanel('inspector') }}>{inspectorCollapsed ? '显示属性' : '收起属性'}</button>{renderedOutputUrl && <a data-host-render-download href={renderedOutputUrl} download="video-packaging-output.mp4">下载 MP4</a>}</div></div>
      <div className={css.packagingSubRow}><label>工程 ID<input value={projectId} onChange={event => { setProjectId(event.target.value) }} aria-label="Host 工程 ID" /><button type="button" onClick={reloadProject}>打开工程</button></label><span className={css.packagingNotice} role="status">{notice}</span></div>
    </header>
    <iframe ref={frame} className={css.packagingFrame} title="Video Packaging 编辑器" sandbox="allow-scripts allow-downloads allow-modals" srcDoc={source} onLoad={syncPanels} />
  </main>
}

function buildDocument(): string {
  const app = editorJs.replace(/^import .*\n/gm, '')
  const helpers = `${packagingPlanJs}\n${assetRetrievalJs}`.replace(/^import .*\n/gm, '').replace(/^export /gm, '')
  const runtime = `<script>const __pending=new Map();let __seq=0;window.addEventListener('message',e=>{if(e.data?.kind==='dsh-video-packaging-response'){const p=__pending.get(e.data.id);if(p){__pending.delete(e.data.id);const body=e.data.body instanceof Blob?e.data.body:typeof e.data.body==='string'?e.data.body:JSON.stringify(e.data.body);p(new Response(body,{status:e.data.status,headers:{'content-type':e.data.contentType||(e.data.body instanceof Blob?'application/octet-stream':'application/json')}}))}}else if(e.data?.kind==='dsh-video-packaging-open'){window.__DSH_PROJECT_ID__=e.data.projectId;location.reload()}else if(e.data?.kind==='dsh-video-packaging-panels'){document.body.classList.toggle('dsh-hide-library',Boolean(e.data.library));document.body.classList.toggle('dsh-hide-inspector',Boolean(e.data.inspector))}});window.fetch=(url,init={})=>new Promise(resolve=>{const id=String(++__seq);__pending.set(id,resolve);parent.postMessage({kind:'dsh-video-packaging-request',id,url:String(url),method:init.method||'GET',headers:Object.fromEntries(new Headers(init.headers||{}).entries()),body:init.body??null},'*')});window.__DSH_PROJECT_ID__=${JSON.stringify(new URLSearchParams(location.search).get('videoPackagingProject') ?? '')};</script><script>${safeScript(helpers)}\n${safeScript(app)}</script>`
  const responsive = `
    body{min-width:0!important}
    .workspace{grid-template-columns:minmax(190px,240px) minmax(0,1fr) minmax(210px,270px);gap:10px;padding:10px}
    .center-column{grid-template-rows:minmax(0,1fr) minmax(220px,28vh);gap:10px}
    .library,.inspector{min-width:0}
    .library :is(small,span,label,p),.inspector :is(small,span,label,p),.preview-panel :is(small,span,label,p),.timeline-panel :is(small,span,label,p){font-size:max(12px,1em)!important}
    .stage:has(.empty-stage.visible){width:min(100%,560px);aspect-ratio:auto}
    .eyebrow,.count,.live-label,.import-drop small,.asset-card,.project-file small,.component-add small,.video-meta,.timeline-tools,.track-label,.track-name,.inspector-empty span,.field-help,.render-status,.fixture-note,.subtitle-drop small,.transcript-status,.plan-empty,.asset-recommendation-empty,.asset-recommendation-copy small,.recommendation-review,.recommendation-placement label,.recommendation-actions span,.visual-asset-entry small,.asset-inspector-note,.aspect-lock,.privacy-note,.preview-foot,.timeline-foot{font-size:12px}
    .panel h2,.timeline-header h2{font-size:18px}
    .section-title h3{font-size:14px}
    .import-drop strong,.asset-card b,.component-add b,.project-file b,.inspector-empty strong,.proposal-card b,.asset-recommendation-copy b,.library-group>strong,.visual-asset-entry b{font-size:14px}
    .asset-card span,.preview-toolbar strong,.ruler-label,.tick,.clip,.field-label,.field input,.field textarea,.field select,.recommendation-choice select,.recommendation-placement input,.recommendation-actions button,.library-registration input,.library-asset-actions button,.library-asset-actions select{font-size:13px}
    .button{height:40px;font-size:14px}
    .topbar{gap:16px;padding:0 16px}
    .brand{min-width:180px}
    .brand strong{font-size:16px}
    .brand small,.save-state{font-size:12px}
    .project-title{min-width:0;font-size:14px}
    .top-actions{flex:none}
    .icon-button{height:40px;min-width:40px;font-size:16px}
    .fit-button{font-size:13px}
    .stage-wrap{padding:12px 4px}
    .empty-stage strong{font-size:15px}
    .empty-stage span{font-size:12px}
    .timeline-header{margin-bottom:12px}
    .timeline-tools .icon-button{height:34px;min-width:34px}
    .track-label{flex-basis:104px}
    .playhead{left:104px}
    .field input,.field textarea,.field select,.recommendation-choice select{padding:10px}
    .field-help,.privacy-note,.fixture-note,.transcript-status,.asset-inspector-note{line-height:1.5}
    .dsh-hide-library .workspace{grid-template-columns:0 minmax(0,1fr) minmax(210px,270px)}
    .dsh-hide-library .library{display:none}
    .dsh-hide-inspector .workspace{grid-template-columns:minmax(190px,240px) minmax(0,1fr) 0}
    .dsh-hide-inspector .inspector{display:none}
    .dsh-hide-library.dsh-hide-inspector .workspace{grid-template-columns:minmax(0,1fr)}
    .dsh-hide-library.dsh-hide-inspector .library,.dsh-hide-library.dsh-hide-inspector .inspector{display:none}
    @media(max-width:1100px){
      .workspace{grid-template-columns:minmax(170px,205px) minmax(0,1fr) minmax(185px,220px);gap:8px;padding:8px}
      .library,.inspector{padding:13px 10px}
      .center-column{grid-template-rows:minmax(0,1fr) minmax(210px,30vh)}
    }
    @media(max-width:900px){
      .workspace{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr) minmax(210px,30vh);overflow:auto}
      .library,.inspector{display:none}
      .center-column{grid-template-rows:minmax(260px,1fr) minmax(210px,30vh)}
    }
  `
  return editorHtml.replace('<link rel="stylesheet" href="/styles.css" />', `<style>${editorCss}\n${responsive}\n${videoPackagingTheme}</style>`)
    .replace('<script type="module" src="/app.js"></script>', runtime)
    .replace('id="runtime-badge" class="runtime-badge hidden">P5-07 隔离测试', 'id="runtime-badge" class="runtime-badge">隔离 Host · TEST')
}

function safeScript(source: string): string { return source.replaceAll('</script', '<\\/script') }

async function dispatch(request: RequestMessage, bridge: VideoPackagingBridge, activeProjectId: string, openProject: (id: string) => void, outputAssetId: { current: string | null }): Promise<Result> {
  const { url, method } = request
  if (url === '/api/config') return json({ testOnlyMode: true })
  if (url === '/api/ai/models' && method === 'GET') return json({ models: await bridge.aiModels() })
  if (url === '/api/ai/plan' && method === 'POST') {
    const input = typeof request.body === 'string' ? JSON.parse(request.body) as Record<string, unknown> : null
    if (input === null) throw new Error('模型包装输入无效')
    return json(await bridge.runPlan(input as unknown as import('@deepseek-ai/dsh-business-workbench/types').RunVideoPackagingPlanRequest))
  }
  if (url === '/api/project' && method === 'GET') {
    if (!activeProjectId) return json({ project: null, path: 'Harness Host' })
    const project = await bridge.project(activeProjectId)
    return project === null ? json({ error: 'Host 工程不存在或已失效' }, 404) : json({ project: project.document, path: `Host · ${project.projectId}`, projectId: project.projectId })
  }
  if (url === '/api/project' && method === 'POST') {
    if (!activeProjectId) throw new Error('请先导入 MP4 创建 Host 工程')
    const document = JSON.parse(String(request.body)) as import('@deepseek-ai/dsh-session/types').JsonValue
    const current = await bridge.project(activeProjectId)
    if (current === null) throw new Error('Host 工程不存在')
    await bridge.saveProject(activeProjectId, current.revision, document)
    return json({ path: `Host · ${activeProjectId}` })
  }
  if (url === '/api/library' && method === 'GET') {
    if (!activeProjectId) return json({ assets: [] })
    return json({ assets: await mapAssets(await bridge.projectAssets(activeProjectId)) })
  }
  if (url === '/api/import' && method === 'POST') {
    if (!(request.body instanceof Blob)) throw new Error('视频上传数据无效')
    const file = new File([request.body], request.headers['x-file-name'] ?? 'video.mp4', { type: 'video/mp4' })
    const asset = await bridge.upload(file, 'video/mp4')
    const project = await bridge.createProject(file.name.replace(/\.mp4$/i, '') || 'Video Packaging', asset.assetId)
    openProject(project.projectId)
    return json({ asset: 'source.mp4', projectId: project.projectId, name: project.name, width: asset.width, height: asset.height, duration: asset.duration, fps: asset.fps ?? 30, videoCodec: asset.videoCodec, hasAudio: asset.hasAudio, audio: asset.audioCodec ? { codec: asset.audioCodec, sampleRate: asset.audioSampleRate, channels: asset.audioChannels } : null, bytes: asset.bytes, originalName: asset.name })
  }
  if (url === '/api/transcript' && method === 'POST') return json({ relativePath: 'Host project document', sha256: 'stored-in-project-document' })
  if (url === '/media/transcript.srt' && method === 'GET') {
    const project = activeProjectId ? await bridge.project(activeProjectId) : null
    const doc = project?.document as { transcript?: { srtText?: string } } | undefined
    return text(doc?.transcript?.srtText ?? '', doc?.transcript?.srtText ? 200 : 404)
  }
  if (url === '/media/source.mp4' && method === 'GET') {
    const project = activeProjectId ? await bridge.project(activeProjectId) : null
    if (!project) return text('工程无视频素材', 404)
    return binary(await readAsset(bridge, project.sourceVideoAssetId, 'video/mp4'))
  }
  if (url.startsWith('/library/media/') && method === 'GET') {
    const id = decodeURIComponent(url.split('/').at(-1) ?? '')
    return binary(await readAsset(bridge, id, 'image/png'))
  }
  if (url.startsWith('/api/assets') && method === 'POST') {
    if (!(request.body instanceof Blob)) throw new Error('PNG 上传数据无效')
    if (!request.body.type.includes('png')) throw new Error('S2 Host 当前仅支持透明 PNG；MOV 暂未接入')
    const file = new File([request.body], decodeURIComponent(request.headers['x-asset-name'] ?? 'visual.png'), { type: 'image/png' })
    const asset = await bridge.upload(file, 'image/png')
    return json({ asset: mapAsset(asset, readAssetMetadata(request.headers['x-asset-metadata'])) })
  }
  if (url.startsWith('/api/overlay/') && method === 'POST') {
    if (!(request.body instanceof Blob)) throw new Error('包装 PNG 数据无效')
    const componentId = decodeURIComponent(url.split('/').at(-1) ?? '')
    const file = new File([request.body], `overlay-${componentId}.png`, { type: 'image/png' })
    const asset = await bridge.upload(file, 'image/png')
    return json({ asset: mapAsset(asset) })
  }
  if (url.startsWith('/api/library/') && url.endsWith('/status') && method === 'PATCH') return json({ error: '隔离测试素材不可晋升或更改为正式确认状态。' }, 403)
  if (url === '/api/render' && method === 'POST') {
    if (!activeProjectId) throw new Error('当前没有 Host 工程')
    const task = await bridge.submitRender(activeProjectId)
    return json({ renderId: task.renderTaskId })
  }
  if (url.startsWith('/api/render/') && method === 'GET') {
    const task = await bridge.render(url.split('/').at(-1) ?? '')
    if (!task) return json({ error: '渲染任务不存在' }, 404)
    if (task.status === 'completed' && task.outputAssetId) { outputAssetId.current = task.outputAssetId; return json({ status: 'completed', log: task.logTail }) }
    return json({ status: task.status === 'queued' || task.status === 'running' ? 'running' : task.status, error: task.errorCode, log: task.logTail })
  }
  if (url === '/rendered/output.mp4' && method === 'GET') {
    if (!outputAssetId.current) return text('当前没有可下载的渲染结果', 404)
    return binary(await readAsset(bridge, outputAssetId.current, 'video/mp4'))
  }
  return json({ error: `S3 Host Remote 未提供此操作：${method} ${url}` }, 404)
}

async function readAsset(bridge: VideoPackagingBridge, assetId: string, type: string): Promise<Blob> {
  const parts: Uint8Array[] = []
  let offset = 0
  let eof = false
  while (!eof) {
    const result = await bridge.assetChunk(assetId, offset, 192 * 1024)
    const raw = atob(result.data)
    const bytes = new Uint8Array(raw.length)
    for (let index = 0; index < raw.length; index++) bytes[index] = raw.charCodeAt(index)
    parts.push(bytes); offset += bytes.length; eof = result.eof
  }
  return new Blob(parts.map(part => part.slice().buffer as ArrayBuffer), { type })
}

function mapAssets(assets: readonly import('@deepseek-ai/dsh-business-workbench/types').VideoPackagingAsset[]) { return assets.filter(asset => asset.kind === 'visual-png' && !asset.name.startsWith('overlay-')).map(asset => mapAsset(asset)) }
function mapAsset(asset: import('@deepseek-ai/dsh-business-workbench/types').VideoPackagingAsset, metadata: AssetMetadata = {}) {
  return { id: asset.assetId, name: asset.name, type: 'static', mimeType: 'image/png', width: asset.width, height: asset.height, duration: null, hasAlpha: asset.hasAlpha, bytes: asset.bytes, sha256: asset.sha256, status: 'test-only-approved', testOnly: true, userConfirmed: false, source: 'P5-07 隔离测试 Host 上传', licenseStatus: '不代表正式授权或用户批准', category: metadata.category ?? '技术测试', purposeTags: metadata.purposeTags ?? [], styleTags: metadata.styleTags ?? [], recommendedScenes: metadata.recommendedScenes ?? [], defaultDisplay: metadata.defaultDisplay ?? { width: Math.round(asset.width * 0.32), height: Math.round(asset.height * 0.32), duration: 4 } }
}
type AssetMetadata = { readonly category?: string; readonly purposeTags?: readonly string[]; readonly styleTags?: readonly string[]; readonly recommendedScenes?: readonly string[]; readonly defaultDisplay?: { readonly width: number; readonly height: number; readonly duration: number } }
function readAssetMetadata(value?: string): AssetMetadata {
  if (!value) return {}
  try {
    const bytes = Uint8Array.from(atob(value), character => character.charCodeAt(0))
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>
    const strings = (entry: unknown): readonly string[] => Array.isArray(entry) ? entry.filter((item): item is string => typeof item === 'string').slice(0, 20) : []
    const display = parsed.defaultDisplay
    const defaultDisplay = typeof display === 'object' && display !== null
      ? display as { readonly width: number; readonly height: number; readonly duration: number }
      : undefined
    return {
      ...(typeof parsed.category === 'string' ? { category: parsed.category.slice(0, 80) } : {}),
      purposeTags: strings(parsed.purposeTags),
      styleTags: strings(parsed.styleTags),
      recommendedScenes: strings(parsed.recommendedScenes),
      ...(defaultDisplay === undefined ? {} : { defaultDisplay }),
    }
  } catch {
    return {}
  }
}
function json(body: unknown, status = 200): Result { return { status, body, contentType: 'application/json' } }
function text(body: string, status = 200): Result { return { status, body, contentType: 'text/plain; charset=utf-8' } }
function binary(body: Blob): Result { return { status: 200, body, contentType: body.type } }
