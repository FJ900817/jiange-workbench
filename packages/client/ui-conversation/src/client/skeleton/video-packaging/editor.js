import { applyPackagingPlan, createFixturePlan, parseSubtitles, validatePackagingPlan } from '/modules/packaging-plan.mjs'
import { applyAssetRecommendation, createAssetRecommendations, hasClearReusePermission } from '/modules/visual-asset-retrieval.mjs'
import { AIKOU_CSS, renderAikouComponent, renderAikouOverlayPng } from '/modules/aikou-components.mjs'

const $ = selector => document.querySelector(selector)
const video = $('#source-video')
const stage = $('#stage')
const overlayLayer = $('#overlay-layer')
const projectName = $('#project-name')
const saveState = $('#save-state')
const toastElement = $('#toast')
const fields = $('#inspector-fields')
const emptyInspector = $('#inspector-empty')
let project = null
let projectPath = null
let selectedId = null
let playing = false
let saveTimer = 0
let toastTimer = 0
let zoom = 1
let seekGuard = false
let transcript = null
let packagingPlan = null
let aiModels = []
let aiModelCatalogUnavailable = false
let libraryAssets = []
let testOnlyMode = false
let assetRecommendations = []
const hostAssetUrls = new Map()
const recommendationSelections = new Map()
const recommendationPlacements = new Map()
const recommendationDecisions = new Map()
const previewAssetNodes = new Map()

const fmt = seconds => {
  const value = Math.max(0, Number(seconds) || 0)
  const minutes = Math.floor(value / 60)
  const whole = Math.floor(value % 60)
  const hundredths = Math.floor((value - Math.floor(value)) * 100)
  return `${String(minutes).padStart(2, '0')}:${String(whole).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`
}
const active = (item, time) => !item.hidden && time >= item.start && time <= item.start + item.duration
const selected = () => project?.components.find(item => item.id === selectedId) ?? null

function notify(message) {
  toastElement.textContent = message
  toastElement.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toastElement.classList.remove('show'), 2200)
}

function defaultProject(metadata) {
  return {
    schemaVersion: 1,
    projectId: metadata.projectId ?? crypto.randomUUID(),
    name: metadata.name ?? 'P5-07 · Video Packaging 工程',
    fps: metadata.fps ?? 30,
    width: metadata.width,
    height: metadata.height,
    video: { asset: 'source.mp4', width: metadata.width, height: metadata.height, duration: metadata.duration, fps: metadata.fps ?? 30, codec: metadata.videoCodec ?? null, hasAudio: metadata.hasAudio, audio: metadata.audio ?? null, importedAt: new Date().toISOString() },
    components: [],
    mediaAssets: [],
    // 面板「深色视频场景」开关（默认浅色）：talkcraft 深色字卡自动用浅色版。
    darkScene: false,
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Render one AI口播包装库 component to a full-canvas PNG and register it as
 * the Host overlay asset. The FFmpeg chain loops a still PNG per component,
 * so the still is taken mid-component (enter animation done, exit not begun).
 * The PNG covers the whole canvas because aikou positions are authored in the
 * component params; the item box is normalized to the canvas accordingly.
 */
async function syncAikouOverlayAsset(item) {
  item.x = 0; item.y = 0; item.width = project.width; item.height = project.height
  const signature = JSON.stringify(['aikou', item.libraryRef.componentId, item.libraryRef.params, item.libraryRef.state ?? null, project.width, project.height])
  if (item.overlayAssetId && item.overlaySignature === signature && project.mediaAssets.some(asset => asset.id === item.overlayAssetId)) return
  const ref = { ...item.libraryRef, params: { ...(item.libraryRef.params ?? {}), t0: 0, t1: item.duration } }
  const still = Math.min(Math.max(1, item.duration * 0.5), Math.max(0.6, item.duration - 0.35))
  const blob = await renderAikouOverlayPng(ref, project.width, project.height, still)
  const response = await fetch(`/api/overlay/${encodeURIComponent(item.id)}`, { method: 'POST', headers: { 'content-type': 'image/png' }, body: blob })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error ?? '包装 PNG 未能写入 Host')
  item.overlayAssetId = result.asset.id
  item.overlaySignature = signature
  project.mediaAssets ??= []
  if (!project.mediaAssets.some(asset => asset.id === result.asset.id)) project.mediaAssets.push(projectAssetSnapshot(result.asset))
}

async function syncTextOverlayAssets() {
  for (const item of project.components.filter(component => component.type !== 'asset')) {
    // talkcraft 卡片由 Host 隔离渲染器渲染（经 talkcraft-dispatch 选透明版），编辑器不上传 PNG。
    if (item.libraryRef && item.libraryRef.lib === 'talkcraft') continue
    if (item.libraryRef && item.libraryRef.lib === 'aikou') { await syncAikouOverlayAsset(item); continue }
    const signature = JSON.stringify([item.type, item.text, item.title, item.body, item.x, item.y, item.width, item.height, item.fontSize, item.color, item.accent, item.background, item.visualStyle, item.emphasisText])
    if (item.overlayAssetId && item.overlaySignature === signature && project.mediaAssets.some(asset => asset.id === item.overlayAssetId)) continue
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.ceil(item.width)); canvas.height = Math.max(1, Math.ceil(item.height))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('包装图层画布不可用')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.font = `800 ${item.fontSize}px sans-serif`; ctx.textBaseline = 'middle'; ctx.fillStyle = item.color
    ctx.shadowColor = 'rgba(0,0,0,.75)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2
    if (item.type === 'title') {
      const rows = String(item.text).split('\n')
      rows.forEach((row, index) => ctx.fillText(row, 0, canvas.height / 2 + (index - (rows.length - 1) / 2) * item.fontSize * 1.15, canvas.width - 8))
      if (item.emphasisText) { ctx.shadowColor = 'transparent'; ctx.strokeStyle = item.accent; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, canvas.height - 8); ctx.lineTo(Math.min(canvas.width, ctx.measureText(item.emphasisText).width), canvas.height - 8); ctx.stroke() }
    } else if (item.type === 'highlight') {
      if (item.visualStyle !== 'underline') { ctx.shadowColor = 'transparent'; ctx.strokeStyle = item.accent; ctx.lineWidth = 5; ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6) }
      ctx.textAlign = item.visualStyle === 'underline' ? 'left' : 'center'
      const rows = String(item.text).split('\n')
      rows.forEach((row, index) => ctx.fillText(row, item.visualStyle === 'underline' ? 0 : canvas.width / 2, canvas.height / 2 + (index - (rows.length - 1) / 2) * item.fontSize * 1.15, canvas.width - 12))
    } else {
      ctx.shadowColor = 'transparent'; ctx.fillStyle = `${item.background}d9`; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = item.accent; ctx.fillRect(0, 0, 5, canvas.height)
      ctx.fillStyle = item.accent; ctx.fillText(String(item.title), 24, Math.max(24, item.fontSize))
      ctx.font = `500 ${Math.max(16, item.fontSize * .56)}px sans-serif`; ctx.fillStyle = item.color
      String(item.body).split('\n').forEach((row, index) => ctx.fillText(row, 24, Math.min(canvas.height - 16, 64 + index * item.fontSize * .85), canvas.width - 48))
    }
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('包装 PNG 生成失败')
    const response = await fetch(`/api/overlay/${encodeURIComponent(item.id)}`, { method: 'POST', headers: { 'content-type': 'image/png' }, body: blob })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error ?? '包装 PNG 未能写入 Host')
    item.overlayAssetId = result.asset.id
    item.overlaySignature = signature
    project.mediaAssets ??= []
    if (!project.mediaAssets.some(asset => asset.id === result.asset.id)) project.mediaAssets.push(projectAssetSnapshot(result.asset))
  }
}

async function sourceVideoUrl() {
  const response = await fetch('/media/source.mp4')
  if (!response.ok) throw new Error('Host 原视频资源不可读取')
  const url = URL.createObjectURL(await response.blob())
  video.dataset.hostSourceUrl = url
  return url
}

async function hostAssetUrl(assetId) {
  if (!hostAssetUrls.has(assetId)) {
    hostAssetUrls.set(assetId, fetch(`/library/media/${encodeURIComponent(assetId)}`).then(async response => {
      if (!response.ok) throw new Error('Host 透明 PNG 素材不可读取')
      return URL.createObjectURL(await response.blob())
    }))
  }
  return hostAssetUrls.get(assetId)
}

function timestampForSrt(seconds) {
  const millis = Math.round(seconds * 1000)
  const hours = Math.floor(millis / 3_600_000)
  const minutes = Math.floor((millis % 3_600_000) / 60_000)
  const secs = Math.floor((millis % 60_000) / 1000)
  const rest = millis % 1000
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(rest).padStart(3, '0')}`
}

function transcriptAsSrt(value) {
  return value.segments.map((segment, index) => `${index + 1}\n${timestampForSrt(segment.start)} --> ${timestampForSrt(segment.end)}\n${segment.text}`).join('\n\n') + '\n'
}

function renderTranscriptEditor() {
  const editor = $('#transcript-editor')
  editor.value = transcript?.srtText ?? (transcript ? transcriptAsSrt(transcript) : '')
  $('#save-transcript').disabled = !transcript
  renderAiTranscriptStatus()
}

async function loadProject() {
  const [response, libraryResponse, configResponse] = await Promise.all([fetch('/api/project'), fetch('/api/library'), fetch('/api/config')])
  if (!response.ok) throw new Error('读取工程失败')
  if (!libraryResponse.ok) throw new Error('读取共享素材库失败')
  if (!configResponse.ok) throw new Error('读取 P5 运行配置失败')
  const config = await configResponse.json()
  try {
    const modelResponse = await fetch('/api/ai/models')
    aiModels = modelResponse.ok ? (await modelResponse.json()).models : []
    aiModelCatalogUnavailable = !modelResponse.ok
  } catch (error) {
    aiModels = []
    aiModelCatalogUnavailable = true
  }
  renderAiModels()
  testOnlyMode = config.testOnlyMode === true
  if (testOnlyMode) $('#runtime-badge').classList.remove('hidden')
  libraryAssets = (await libraryResponse.json()).assets
  const payload = await response.json()
  projectPath = payload.path
  if (payload.project) {
    project = payload.project
    project.mediaAssets ??= []
    $('#dark-scene-toggle').checked = project.darkScene === true
    for (const reference of project.mediaAssets) {
      const libraryAsset = libraryAssets.find(asset => asset.id === reference.id)
      if (libraryAsset) Object.assign(libraryAsset, Object.fromEntries(['category', 'purposeTags', 'styleTags', 'recommendedScenes', 'defaultDisplay'].filter(key => reference[key] !== undefined).map(key => [key, reference[key]])))
    }
    if (project.video?.asset === 'source.mp4') {
      video.src = await sourceVideoUrl()
      $('#empty-stage').classList.remove('visible')
      $('#video-meta').textContent = `${project.width} × ${project.height} · ${Number(project.fps).toFixed(2)}fps · ${project.video.duration.toFixed(2)}s · ${project.video.hasAudio ? `含 ${project.video.audio?.codec ?? '原音轨'}` : '无音轨'}`
      $('#asset-status').textContent = '已导入'
      $('#asset-card').classList.remove('empty')
      $('#asset-card').innerHTML = `<b>${escapeHtml(project.video.originalName ?? 'source.mp4')}</b><span>${project.width}×${project.height} · ${project.video.duration.toFixed(2)} 秒 · ${project.video.hasAudio ? '含原音轨' : '无音轨'}</span>`
    }
    projectName.textContent = project.name
    saveState.textContent = '已从磁盘恢复'
    if (project.transcript ?? project.packagingPlanRecord?.transcript) {
      transcript = project.transcript ?? project.packagingPlanRecord.transcript
      const srtResponse = await fetch('/media/transcript.srt')
      if (srtResponse.ok) transcript.srtText = await srtResponse.text()
      $('#transcript-status').textContent = `${transcript.fileName} · ${transcript.segments.length} 段 · ${transcript.sourceKind === 'local-asr-faster-whisper-small' ? '复用此前本地 ASR 结果；本轮未重跑识别' : '工程内字幕'}`
      $('#plan-button').disabled = false
      $('#retrieve-assets').disabled = false
      renderTranscriptEditor()
    }
    if (project.aiPackagingDraft?.plan) {
      try {
        validatePackagingPlan(project.aiPackagingDraft.plan)
        packagingPlan = project.aiPackagingDraft.plan
        renderPackagingPlan(packagingPlan)
      } catch (error) {
        $('#ai-transcript-status').className = 'ai-status warning'
        $('#ai-transcript-status').textContent = `已保存的包装草案无法通过校验，未应用到时间轴：${error.message}`
      }
    }
    renderAll()
    if (project.video?.asset) video.currentTime = Math.min(2.7, Math.max(0, project.video.duration - 0.3))
  } else {
    renderAll()
  }
}

function renderAiModels() {
  const select = $('#ai-model-select')
  const current = select.value
  select.innerHTML = aiModels.length
    ? aiModels.map(item => `<option value="${escapeHtml(`${item.provider}::${item.model}`)}" ${item.invocationReady ? '' : 'disabled'}>${escapeHtml(item.providerName)} · ${escapeHtml(item.modelName)} (${escapeHtml(item.model)}) · ${item.invocationReady ? '可调用' : '不可调用'}</option>`).join('')
    : '<option value="">没有已注册的 Harness 语言模型</option>'
  if (aiModels.some(item => `${item.provider}::${item.model}` === current)) select.value = current
  const chosen = aiModels.find(item => `${item.provider}::${item.model}` === select.value)
  const status = $('#ai-model-status')
  if (!chosen) {
    status.className = 'ai-status warning'
    status.textContent = aiModelCatalogUnavailable ? '无法从当前 Harness Host 读取语言模型目录；请检查 Remote 连接。' : '当前 Host 没有返回已注册语言模型；未配置的模型不会显示为可用。'
    return
  }
  status.className = 'ai-status warning'
  status.textContent = '模型已在 Harness 目录注册；专用执行路由未配置，认证状态未核实。真实模型调用关闭。' + chosen.unavailableReason
}

function renderAiTranscriptStatus() {
  const element = $('#ai-transcript-status')
  if (!transcript?.segments?.length) {
    element.className = 'ai-status warning'
    element.textContent = '尚无经过校验的时间字幕。请导入 SRT/VTT；没有字幕时不会生成语义方案。'
    return
  }
  const source = transcript.sourceKind === 'local-asr-faster-whisper-small'
    ? '本地 faster-whisper 转写'
    : transcript.sourceKind === 'fixture-script-aligned' ? '合成脚本时间码 Fixture' : '导入字幕（来源按文件记录）'
  element.className = 'ai-status ready'
  element.textContent = `${source} · ${transcript.segments.length} 段 · 时间码已校验`
}

async function importTranscript(file) {
  if (!project?.video?.duration) return notify('请先导入口播视频')
  const extension = file.name.toLowerCase().endsWith('.vtt') ? 'vtt' : file.name.toLowerCase().endsWith('.srt') ? 'srt' : ''
  if (!extension) return notify('请选择 SRT 或 VTT 字幕文件')
  const srtText = await file.text()
  const segments = parseSubtitles(extension, srtText, project.video.duration)
  const isPriorAsr = file.name.includes('ASR-reference-short-clip')
  transcript = {
    id: `transcript-${crypto.randomUUID()}`,
    fileName: file.name,
    sourceKind: isPriorAsr ? 'local-asr-faster-whisper-small' : file.name.toLowerCase().endsWith('fixture.srt') ? 'fixture-script-aligned' : `imported-${extension}`,
    model: isPriorAsr ? 'faster-whisper small' : null,
    srtText,
    segments,
  }
  project.transcript = transcript
  const transcriptResponse = await fetch('/api/transcript', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fileName: `transcript.${extension}`, text: srtText }) })
  const transcriptResult = await transcriptResponse.json()
  if (!transcriptResponse.ok) throw new Error(transcriptResult.error ?? '字幕文件保存失败')
  transcript.relativePath = transcriptResult.relativePath
  transcript.sha256 = transcriptResult.sha256
  packagingPlan = null
  $('#transcript-status').textContent = `${file.name} · ${segments.length} 段 · ${transcript.sourceKind === 'fixture-script-aligned' ? '合成口播脚本时间码 Fixture，非 ASR' : '已导入时间码；本轮未执行 ASR'}`
  $('#plan-button').disabled = false
  $('#plan-preview').classList.add('hidden')
  $('#apply-plan').classList.add('hidden')
  $('#retrieve-assets').disabled = false
  renderTranscriptEditor()
  await saveProject(true)
  notify('字幕已解析并保存到当前工程')
}

async function saveTranscriptEdits() {
  if (!transcript || !project?.video?.duration) return notify('当前工程没有可编辑字幕')
  const format = transcript.fileName.toLowerCase().endsWith('.vtt') ? 'vtt' : 'srt'
  const text = $('#transcript-editor').value
  const parsed = parseSubtitles(format, text, project.video.duration)
  const segments = parsed.map((segment, index) => ({ ...segment, id: transcript.segments[index]?.id ?? segment.id }))
  const response = await fetch('/api/transcript', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fileName: `transcript.${format}`, text }) })
  const saved = await response.json()
  if (!response.ok) throw new Error(saved.error ?? '字幕文件保存失败')
  transcript = { ...transcript, segments, srtText: text, relativePath: saved.relativePath, sha256: saved.sha256, updatedAt: new Date().toISOString() }
  project.transcript = transcript
  packagingPlan = null
  renderAiTranscriptStatus()
  $('#transcript-status').textContent = `${transcript.fileName} · ${segments.length} 段 · 已校验并保存；${transcript.sourceKind === 'local-asr-faster-whisper-small' ? '原始 ASR 来源保留，人工校订未冒充重新识别' : '人工校订字幕'}`
  $('#plan-preview').classList.add('hidden')
  $('#apply-plan').classList.add('hidden')
  $('#plan-button').disabled = false
  $('#retrieve-assets').disabled = false
  await saveProject(true)
  notify('字幕时间码已校验；字幕与工程均已写入磁盘')
}

function recommendationPlacement(recommendation, candidate = recommendation) {
  return recommendationPlacements.get(recommendation.recommendationId) ?? {
    start: Number(candidate.suggestedStart.toFixed(2)),
    duration: Number(candidate.suggestedDuration.toFixed(2)),
    x: candidate.suggestedPosition.x,
    y: candidate.suggestedPosition.y,
    width: candidate.suggestedSize.width,
    height: candidate.suggestedSize.height,
  }
}

function renderAssetRecommendations() {
  const container = $('#asset-recommendations')
  $('#recommendation-count').textContent = String(assetRecommendations.length)
  if (!assetRecommendations.length) {
    const confirmed = libraryAssets.filter(asset => asset.status === 'user-confirmed' && asset.userConfirmed === true && asset.confirmedAt)
    container.innerHTML = `<div class="asset-recommendation-empty">${transcript ? `本次字幕未匹配到可用素材。正式确认素材：${confirmed.length} 份；未确认素材不参与正式推荐。${testOnlyMode ? ' 隔离测试素材只在本测试库使用。' : ''}` : '导入字幕后检索。未确认素材不会出现在推荐中。'}</div>`
    return
  }
  container.innerHTML = assetRecommendations.map(recommendation => {
    const chosenId = recommendationSelections.get(recommendation.recommendationId) ?? recommendation.assetId
    const asset = libraryAssets.find(item => item.id === chosenId)
    if (!asset) return ''
    const candidate = recommendation.candidates.find(item => item.assetId === chosenId) ?? recommendation
    const dynamic = asset.mimeType === 'video/quicktime'
    const preview = dynamic ? `/library/preview/${encodeURIComponent(asset.id)}?time=0` : `/library/media/${encodeURIComponent(asset.id)}`
    const placement = recommendationPlacement(recommendation, candidate)
    const decision = recommendationDecisions.get(recommendation.recommendationId)
    const reason = `本地标签规则：字幕识别为“${recommendation.intent}”，素材登记标签“${candidate.matchedTags.join('、')}”与口播线索匹配。`
    return `<article class="asset-recommendation-card" data-recommendation="${escapeHtml(recommendation.recommendationId)}"><div class="asset-recommendation-main"><img class="recommendation-thumb" src="${preview}" alt="素材预览：${escapeHtml(asset.name)}"/><div class="asset-recommendation-copy"><b>${escapeHtml(asset.name)} · ${asset.type === 'static' ? 'PNG' : 'ProRes MOV'}${recommendation.testOnly ? ' · 隔离测试候选' : ''}</b><small>来源：${escapeHtml(asset.source)} · 授权：${escapeHtml(asset.licenseStatus)}</small><small>标签：${escapeHtml(candidate.matchedTags.join('、'))} · 比例：${candidate.aspectFit === 'close' ? '接近画布' : '需人工确认缩放'}</small><small class="evidence">口播依据 ${fmt(recommendation.evidenceStart)}–${fmt(recommendation.evidenceEnd)}：${escapeHtml(recommendation.evidenceText)}</small><small>${escapeHtml(reason)}</small></div></div><label class="field recommendation-choice"><span class="field-label">推荐素材 / 更换候选</span><select data-recommendation-choice="${escapeHtml(recommendation.recommendationId)}">${recommendation.candidates.map(option => `<option value="${escapeHtml(option.assetId)}" ${option.assetId === chosenId ? 'selected' : ''}>${escapeHtml(option.name)} · ${escapeHtml(option.matchedTags.join('、'))}</option>`).join('')}</select></label><div class="recommendation-placement"><label>开始秒<input type="number" step="0.1" min="0" max="${project.video.duration}" data-rec-field="start" value="${placement.start}"/></label><label>时长秒<input type="number" step="0.1" min="0.3" max="${project.video.duration}" data-rec-field="duration" value="${placement.duration}"/></label><label>X<input type="number" step="1" min="0" max="${project.width}" data-rec-field="x" value="${placement.x}"/></label><label>Y<input type="number" step="1" min="0" max="${project.height}" data-rec-field="y" value="${placement.y}"/></label><label>宽<input type="number" step="1" min="1" max="${project.width}" data-rec-field="width" value="${placement.width}"/></label><label>高<input type="number" step="1" min="1" max="${project.height}" data-rec-field="height" value="${placement.height}"/></label></div><small class="recommendation-review">人工检查：${escapeHtml(recommendation.manualChecks.join('；'))}</small><div class="recommendation-actions"><button type="button" class="button secondary" data-reject-recommendation="${escapeHtml(recommendation.recommendationId)}">拒绝</button><button type="button" class="button primary" data-accept-recommendation="${escapeHtml(recommendation.recommendationId)}" ${decision === 'accepted' ? 'disabled' : ''}>${decision === 'accepted' ? '已加入时间轴' : recommendation.testOnly ? '确认加入测试工程' : '确认并加入时间轴'}</button>${decision === 'rejected' ? '<span>已拒绝，工程未更改</span>' : ''}</div></article>`
  }).join('')
  container.querySelectorAll('[data-recommendation-choice]').forEach(select => select.addEventListener('change', () => {
    recommendationSelections.set(select.dataset.recommendationChoice, select.value)
    recommendationPlacements.delete(select.dataset.recommendationChoice)
    renderAssetRecommendations()
  }))
  container.querySelectorAll('[data-rec-field]').forEach(input => input.addEventListener('change', () => {
    const recId = input.closest('[data-recommendation]')?.dataset.recommendation
    const recommendation = assetRecommendations.find(item => item.recommendationId === recId)
    const chosenId = recommendationSelections.get(recId) ?? recommendation.assetId
    const candidate = recommendation.candidates.find(item => item.assetId === chosenId) ?? recommendation
    const placement = recommendationPlacement(recommendation, candidate)
    placement[input.dataset.recField] = Number(input.value)
    recommendationPlacements.set(recId, placement)
  }))
  container.querySelectorAll('[data-reject-recommendation]').forEach(button => button.addEventListener('click', () => {
    recommendationDecisions.set(button.dataset.rejectRecommendation, 'rejected')
    renderAssetRecommendations()
  }))
  container.querySelectorAll('[data-accept-recommendation]').forEach(button => button.addEventListener('click', () => acceptAssetRecommendation(button.dataset.acceptRecommendation).catch(error => notify(error.message))))
}

function retrieveAssetRecommendations({ includeTestAssets = testOnlyMode } = {}) {
  if (!transcript || !project?.video) return notify('请先导入视频和带时间码字幕')
  assetRecommendations = createAssetRecommendations({ transcript, assets: libraryAssets, video: { ...project.video, width: project.width, height: project.height }, testOnlyMode: includeTestAssets })
  recommendationSelections.clear()
  recommendationPlacements.clear()
  recommendationDecisions.clear()
  renderAssetRecommendations()
  if (!assetRecommendations.length) notify('没有匹配到已确认且授权信息完整的素材；工程未更改')
  else notify(`找到 ${assetRecommendations.length} 条本地标签匹配，待人工审核`)
}

async function acceptAssetRecommendation(recommendationId) {
  const recommendation = assetRecommendations.find(item => item.recommendationId === recommendationId)
  const assetId = recommendationSelections.get(recommendationId) ?? recommendation?.assetId
  const asset = libraryAssets.find(item => item.id === assetId)
  if (!recommendation || !asset) throw new Error('推荐或素材已不存在，请重新检索')
  const candidate = recommendation.candidates.find(item => item.assetId === assetId)
  const approvedRecommendation = { ...recommendation, assetId, matchedTags: candidate?.matchedTags ?? recommendation.matchedTags }
  const message = recommendation.testOnly
    ? `此素材只存在于 P5-07 隔离测试库：${asset.name}\n这不是用户正式批准，也不代表正式授权。是否仅为本次研发验证加入测试工程？`
    : `请确认你已审核素材来源和许可，并明确同意在工程中复用：${asset.name}`
  if (!window.confirm(message)) {
    recommendationDecisions.set(recommendationId, 'rejected')
    renderAssetRecommendations()
    return
  }
  const result = applyAssetRecommendation(project, approvedRecommendation, asset, recommendationPlacement(recommendation, candidate), true, testOnlyMode)
  project = result.project
  project.transcript = transcript
  project.assetRecommendationApplications ??= []
  if (result.added) {
    project.assetRecommendationApplications.push({ recommendationId, assetId, generatedBy: 'local-tag-rules', model: null, testOnly: recommendation.testOnly === true, approvalKind: recommendation.testOnly ? 'test-only' : 'user-confirmed', evidenceText: recommendation.evidenceText, evidenceStart: recommendation.evidenceStart, evidenceEnd: recommendation.evidenceEnd, source: asset.source, licenseStatus: asset.licenseStatus, acceptedAt: new Date().toISOString() })
    selectedId = result.componentId
    recommendationDecisions.set(recommendationId, 'accepted')
    renderAll()
    renderAssetRecommendations()
    await saveProject(true)
    notify('已新增素材实例；原有包装组件保持不变')
  } else {
    recommendationDecisions.set(recommendationId, 'accepted')
    renderAssetRecommendations()
    notify('该建议已应用过，未重复添加')
  }
}

function renderPackagingPlan(plan) {
  const preview = $('#plan-preview')
  const applyButton = $('#apply-plan')
  const rejectButton = $('#reject-plan')
  const existing = new Set(project.components.map(item => item.proposalId).filter(Boolean))
  const fresh = plan.proposals.filter(item => !existing.has(item.proposalId))
  const additions = fresh.filter(item => item._selected !== false)
  const source = plan.generatedBy === 'fixture-keyword-rules' ? '规则 Fixture · 非 AI 输出' : '外部方案'
  preview.innerHTML = `<div class="plan-empty">${source} · ${plan.proposals.length} 条建议；${additions.length} 条将加入。规则 Fixture 不会语义理解创作要求，也未进行人物避让。每项均须人工复核。</div>${plan.proposals.map(item => {
    const info = item.componentType === 'info'
    const body = info
      ? `<label>卡片标题<input data-ai-proposal="${escapeHtml(item.proposalId)}" data-ai-field="title" value="${escapeHtml(item.content.title)}" /></label><label>卡片正文<input data-ai-proposal="${escapeHtml(item.proposalId)}" data-ai-field="body" value="${escapeHtml(item.content.body)}" /></label>`
      : `<label>显示文案<input data-ai-proposal="${escapeHtml(item.proposalId)}" data-ai-field="text" value="${escapeHtml(item.content.text)}" /></label>`
    return `<article class="ai-proposal-card"><label><input type="checkbox" data-ai-proposal="${escapeHtml(item.proposalId)}" data-ai-field="selected" ${item._selected === false || existing.has(item.proposalId) ? '' : 'checked'} ${existing.has(item.proposalId) ? 'disabled' : ''}/><strong>${({ title: '标题文字', highlight: '重点强调框', info: '信息卡片' })[item.componentType]} · ${fmt(item.start)}–${fmt(item.start + item.duration)}</strong></label><small>${escapeHtml(item.semanticReason)}</small><small class="evidence">字幕依据：${escapeHtml(item.evidenceText)}</small><div class="ai-proposal-fields">${body}<label>开始秒<input type="number" step="0.1" data-ai-proposal="${escapeHtml(item.proposalId)}" data-ai-field="start" value="${item.start}" /></label><label>持续秒<input type="number" step="0.1" data-ai-proposal="${escapeHtml(item.proposalId)}" data-ai-field="duration" value="${item.duration}" /></label><label>X<input type="number" step="1" data-ai-proposal="${escapeHtml(item.proposalId)}" data-ai-field="x" value="${item.position.x}" /></label><label>Y<input type="number" step="1" data-ai-proposal="${escapeHtml(item.proposalId)}" data-ai-field="y" value="${item.position.y}" /></label><label>宽<input type="number" step="1" data-ai-proposal="${escapeHtml(item.proposalId)}" data-ai-field="width" value="${item.position.width}" /></label><label>高<input type="number" step="1" data-ai-proposal="${escapeHtml(item.proposalId)}" data-ai-field="height" value="${item.position.height}" /></label></div></article>`
  }).join('')}`
  preview.classList.remove('hidden')
  const alreadyApplied = project.aiPackagingDraft?.status === 'applied'
  applyButton.classList.toggle('hidden', additions.length === 0 || alreadyApplied)
  rejectButton.classList.toggle('hidden', alreadyApplied)
  applyButton.textContent = `确认所选组件 · ${additions.length}`
  preview.querySelectorAll('[data-ai-proposal]').forEach(control => control.addEventListener('change', onProposalEdit))
}

function onProposalEdit(event) {
  const proposal = packagingPlan?.proposals.find(item => item.proposalId === event.target.dataset.aiProposal)
  if (!proposal) return
  const key = event.target.dataset.aiField
  if (key === 'selected') proposal._selected = event.target.checked
  else if (['start', 'duration'].includes(key)) proposal[key] = Number(event.target.value)
  else if (['x', 'y', 'width', 'height'].includes(key)) proposal.position[key] = Number(event.target.value)
  else if (key === 'text' && proposal.content) proposal.content.text = event.target.value
  else if (key === 'title' && proposal.content) proposal.content.title = event.target.value
  else if (key === 'body' && proposal.content) proposal.content.body = event.target.value
  try {
    validatePackagingPlan(packagingPlan)
    project.aiPackagingDraft = { ...project.aiPackagingDraft, plan: packagingPlan, updatedAt: new Date().toISOString() }
    void saveProject(true)
    if (key === 'selected') renderPackagingPlan(packagingPlan)
  } catch (error) {
    notify(error.message)
  }
}

async function suggestPackaging() {
  if (!transcript || !project?.video) return notify('请先导入视频和带时间码字幕')
  if ($('#ai-mode-select').value === 'library') {
    retrieveAssetRecommendations({ includeTestAssets: false })
    const confirmed = libraryAssets.filter(asset => asset.status === 'user-confirmed' && asset.userConfirmed === true && hasClearReusePermission(asset)).length
    const status = $('#asset-mode-status')
    status.classList.remove('hidden')
    status.textContent = confirmed ? `本地标签检索已完成；只从 ${confirmed} 份正式确认素材中推荐。请在素材库区域逐项审核。` : '当前没有已确认且授权信息完整的可推荐素材；不会使用待确认或测试素材。工程未更改。'
    return
  }
  packagingPlan = createFixturePlan({
    duration: project.video.duration,
    width: project.width,
    height: project.height,
    transcript,
  })
  validatePackagingPlan(packagingPlan)
  const selected = aiModels.find(item => `${item.provider}::${item.model}` === $('#ai-model-select').value && item.invocationReady)
  project.aiPackagingDraft = {
    plan: packagingPlan,
    status: 'pending-review',
    source: 'fixture-keyword-rules',
    selectedModel: selected ? { provider: selected.provider, model: selected.model } : null,
    requirements: $('#ai-requirements').value.trim(),
    requirementsApplied: false,
    createdAt: new Date().toISOString(),
  }
  renderPackagingPlan(packagingPlan)
  await saveProject(true)
}

async function applyPackagingSuggestions() {
  if (!packagingPlan || !project) return
  try { validatePackagingPlan(packagingPlan) } catch (error) { return notify(`方案校验失败：${error.message}`) }
  const selectedIds = packagingPlan.proposals.filter(item => item._selected !== false).map(item => item.proposalId)
  const result = applyPackagingPlan(project, packagingPlan, selectedIds)
  project = result.project
  project.aiPackagingDraft = { ...project.aiPackagingDraft, status: 'applied', appliedProposalIds: result.addedIds, appliedAt: new Date().toISOString() }
  selectedId = result.addedIds[0] ?? selectedId
  renderAll()
  renderPackagingPlan(packagingPlan)
  await saveProject(true)
  notify(result.addedIds.length ? `已新增 ${result.addedIds.length} 个可编辑组件` : '相同建议已存在，未重复添加')
}

async function rejectPackagingPlan() {
  if (!packagingPlan || !project) return
  project.aiPackagingDraft = { ...project.aiPackagingDraft, status: 'rejected', rejectedAt: new Date().toISOString() }
  packagingPlan = null
  $('#plan-preview').classList.add('hidden')
  $('#apply-plan').classList.add('hidden')
  $('#reject-plan').classList.add('hidden')
  await saveProject(true)
  notify('方案已拒绝；时间轴组件未更改')
}

function setDirty() {
  if (!project) return
  project.updatedAt = new Date().toISOString()
  saveState.textContent = '有未保存修改'
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => saveProject(true), 600)
}

async function saveProject(silent = false) {
  if (!project) return false
  try {
    const invalid = project.components.find(item => !Number.isFinite(item.x) || !Number.isFinite(item.y)
      || !Number.isFinite(item.width) || !Number.isFinite(item.height)
      || item.x < 0 || item.y < 0 || item.width <= 0 || item.height <= 0
      || item.x + item.width > project.width + 0.01 || item.y + item.height > project.height + 0.01)
    if (invalid) throw new Error('组件超出视频画面；请调整位置或尺寸后重试保存。当前修改仍保留在页面，请勿刷新。')
    await syncTextOverlayAssets()
    const response = await fetch('/api/project', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(project) })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error ?? '工程保存失败')
    projectPath = result.path
    saveState.textContent = '已保存到磁盘'
    if (!silent) notify(`工程已保存到 ${projectPath}`)
    return true
  } catch (error) {
    saveState.textContent = '保存失败'
    notify(error.message)
    return false
  }
}

async function importFile(file) {
  if (!file || !file.name.toLowerCase().endsWith('.mp4')) return notify('请选择 MP4 文件')
  if (file.size > 200 * 1024 * 1024) return notify('单个导入文件上限为 200 MB')
  $('#asset-status').textContent = '正在读取'
  const response = await fetch('/api/import', { method: 'POST', headers: { 'content-type': 'video/mp4', 'x-file-name': encodeURIComponent(file.name) }, body: file })
  const result = await response.json()
  if (!response.ok) {
    $('#asset-status').textContent = '导入失败'
    return notify(result.error ?? 'MP4 导入失败')
  }
  project = defaultProject(result)
  project.projectId = result.projectId
  project.name = result.name
  video.src = await sourceVideoUrl()
  video.load()
  $('#empty-stage').classList.remove('visible')
  projectName.textContent = project.name
  $('#asset-status').textContent = '已导入'
  $('#video-meta').textContent = `${result.width} × ${result.height} · ${result.duration.toFixed(2)}s · ${result.hasAudio ? '含原音轨' : '无音轨'}`
  $('#asset-card').classList.remove('empty')
  $('#asset-card').innerHTML = `<b>${escapeHtml(file.name)}</b><span>${result.width}×${result.height} · ${result.duration.toFixed(2)} 秒 · ${(result.bytes / 1024 / 1024).toFixed(2)} MB</span>`
  renderAll()
  await saveProject(true)
  video.currentTime = Math.min(2.7, Math.max(0, result.duration - 0.3))
  notify('MP4 已导入并写入工程资产目录')
}

async function importVisualAsset(file) {
  if (!project?.video?.duration) return notify('请先导入真人视频')
  if (file.size > 80 * 1024 * 1024) return notify('视觉素材单文件上限为 80 MB')
  const mimeType = file.type || (file.name.toLowerCase().endsWith('.png') ? 'image/png' : '')
  if (mimeType !== 'image/png') throw new Error('S2 Host 当前仅支持透明 PNG；ProRes MOV 尚未接入')
  const splitTags = id => $(`#${id}`).value.split(',').map(value => value.trim()).filter(Boolean)
  const metadata = {
    name: $('#register-name').value.trim() || file.name,
    category: $('#register-category').value.trim() || '未分类',
    purposeTags: splitTags('register-purpose-tags'),
    styleTags: splitTags('register-style-tags'),
    recommendedScenes: splitTags('register-scenes'),
    defaultWidth: Number($('#register-width').value),
    defaultHeight: Number($('#register-height').value),
    defaultDuration: Number($('#register-duration').value),
    source: $('#register-source').value.trim() || '用户导入；来源待补充',
    licenseStatus: $('#register-license').value.trim() || '待核实',
  }
  const metadataHeader = btoa(unescape(encodeURIComponent(JSON.stringify(metadata))))
  const response = await fetch('/api/assets', { method: 'POST', headers: { 'content-type': mimeType, 'x-asset-name': encodeURIComponent(file.name), 'x-asset-metadata': metadataHeader }, body: file })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error ?? '素材验证失败')
  libraryAssets.push(result.asset)
  project.mediaAssets ??= []
  project.mediaAssets.push(projectAssetSnapshot(result.asset))
  setDirty()
  renderVisualAssets()
  renderAll()
  $('#register-name').value = ''
  notify(`${file.name} 已登记到共享素材库；状态为待用户确认`)
}

function renderVisualAssets() {
  const confirmed = libraryAssets.filter(asset => asset.status === 'user-confirmed' && asset.userConfirmed === true)
  const development = libraryAssets.filter(asset => !confirmed.includes(asset))
  $('#visual-asset-count').textContent = String(libraryAssets.length)
  const card = asset => {
    const preview = ''
    const statusText = asset.status === 'test-only-approved' ? 'P5-07 隔离测试可用（非用户批准）' : asset.status === 'technical-test' ? '技术测试' : asset.status === 'pending-confirmation' ? '待用户确认' : '用户已确认'
    const defaults = asset.defaultDisplay ?? { width: asset.width, height: asset.height, duration: asset.duration ?? 4 }
    const statusControl = '<small class="test-only-note">隔离测试素材；不可晋升为正式确认资产。</small>'
    return `<article class="visual-asset-entry"><img class="library-thumb" data-host-asset="${asset.id}" src="${preview}" alt=""/><div class="library-asset-copy"><b>${escapeHtml(asset.name)}</b><small>静态 PNG Alpha · ${asset.width}×${asset.height}</small><small>来源：Host 隔离测试上传 · ${statusText}</small></div>${statusControl}</article>`
  }
  $('#formal-library-list').innerHTML = confirmed.length ? confirmed.map(card).join('') : '<div class="asset-card empty">暂无用户明确确认的正式可复用素材</div>'
  $('#development-library-list').innerHTML = development.length ? development.map(card).join('') : '<div class="asset-card empty">暂无待确认或测试素材</div>'
  $('#development-library-list').querySelectorAll('img[data-host-asset]').forEach(image => {
    void hostAssetUrl(image.dataset.hostAsset).then(url => { if (image.isConnected) image.src = url })
  })
  document.querySelectorAll('[data-place-asset]').forEach(button => button.addEventListener('click', () => addVisualAsset(button.dataset.placeAsset)))
  document.querySelectorAll('[data-library-status]').forEach(select => select.addEventListener('change', () => updateLibraryStatus(select.dataset.libraryStatus, select.value, select)))
}

function projectAssetSnapshot(asset) {
  const extension = asset.mimeType === 'image/png' ? 'png' : 'mov'
  return { id: asset.id, storage: 'library', originalName: asset.name, mimeType: asset.mimeType, relativePath: `media/${asset.id}.${extension}`, width: asset.width, height: asset.height, duration: asset.duration, hasAlpha: asset.hasAlpha, codec: asset.codec, bytes: asset.bytes, sha256: asset.sha256, category: asset.category, purposeTags: asset.purposeTags, styleTags: asset.styleTags, recommendedScenes: asset.recommendedScenes, defaultDisplay: asset.defaultDisplay }
}

async function updateLibraryStatus(assetId, status, select) {
  const asset = libraryAssets.find(item => item.id === assetId)
  if (status === 'user-confirmed' && !hasClearReusePermission(asset)) {
    select.value = asset?.status ?? 'pending-confirmation'
    notify('来源或授权字段未明确允许复用；请先核实使用权，测试素材不能晋升')
    return
  }
  const review = asset ? `请审核素材名称、预览、来源及授权：\n名称：${asset.name}\n来源：${asset.source || '未填写'}\n授权：${asset.licenseStatus || '未填写'}\n\n仅在你确认拥有相应使用权限并允许跨工程复用时继续。` : '请审核素材来源与授权状态。'
  if (status === 'user-confirmed' && !window.confirm(review)) {
    select.value = libraryAssets.find(asset => asset.id === assetId)?.status ?? 'pending-confirmation'
    return
  }
  const response = await fetch(`/api/library/${encodeURIComponent(assetId)}/status`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status, userConfirmed: status === 'user-confirmed' }) })
  const result = await response.json()
  if (!response.ok) {
    notify(result.error ?? '素材状态更新失败')
    select.value = libraryAssets.find(asset => asset.id === assetId)?.status ?? 'pending-confirmation'
    return
  }
  libraryAssets = libraryAssets.map(asset => asset.id === assetId ? result.asset : asset)
  renderVisualAssets()
  if (assetRecommendations.length) retrieveAssetRecommendations()
  notify(status === 'user-confirmed' ? '素材已确认并进入正式可复用集合' : `素材状态已更新：${status === 'technical-test' ? '技术测试' : '待用户确认'}`)
}

function addVisualAsset(assetId) {
  const asset = libraryAssets.find(value => value.id === assetId)
  if (!asset || !project.video) return notify('素材或视频工程不存在')
  project.mediaAssets ??= []
  if (!project.mediaAssets.some(value => value.id === asset.id)) project.mediaAssets.push(projectAssetSnapshot(asset))
  const ratio = asset.width / asset.height
  const defaults = asset.defaultDisplay ?? { width: project.width * 0.34, height: project.height * 0.25, duration: asset.duration ?? 4 }
  const fit = Math.min(1, project.width / defaults.width, project.height / defaults.height)
  const width = Math.round(defaults.width * fit)
  const height = Math.round(Math.min(defaults.height * fit, width / ratio))
  const id = crypto.randomUUID()
  const start = Math.min(Number(video.currentTime) || 1.2, Math.max(0, project.video.duration - 0.5))
  const duration = Math.min(defaults.duration, project.video.duration - start, asset.duration ?? Infinity)
  const layer = Math.max(0, ...project.components.map(item => item.layer)) + 1
  project.components.push({ id, type: 'asset', assetId, x: Math.max(0, project.width - width - 48), y: 120, width, height, start, duration, layer, opacity: 1, lockAspectRatio: true, hidden: false, animation: 'none' })
  selectedId = id
  renderAll(); setDirty()
  video.currentTime = start + 0.05
  notify('外部素材已加入时间轴，可拖动、缩放和调整时长')
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
}

function addComponent(type) {
  if (!project?.video?.asset) return notify('请先导入 MP4')
  const index = project.components.length
  const id = crypto.randomUUID()
  const scale = Math.min(1, project.width / 1280, project.height / 720)
  const scaled = value => Math.max(1, Math.round(value * scale))
  const common = { id, type, start: Math.min(index * 0.7, Math.max(0, project.video.duration - 1)), duration: Math.min(3, project.video.duration), layer: index + 1, fontSize: scaled(type === 'title' ? 56 : 38), color: '#ffffff', accent: '#e6b94e', background: '#1f2728', animation: 'fadeUp', hidden: false }
  let item
  if (type === 'title') item = { ...common, text: '清晰表达，让复杂信息一目了然', x: scaled(72), y: scaled(72), width: scaled(860), height: scaled(112) }
  else if (type === 'highlight') item = { ...common, text: '关键数据\n+42%', x: scaled(820), y: scaled(385), width: scaled(350), height: scaled(150) }
  else item = { ...common, title: '视频包装', body: '组件与真实视频时间轴同步', text: '', x: scaled(72), y: scaled(500), width: scaled(460), height: scaled(150), fontSize: scaled(30) }
  project.components.push(item)
  selectedId = id
  renderAll()
  setDirty()
}

function componentMarkup(item, time, scale) {
  if (!active(item, time)) return ''
  // Library components (aikou/talkcraft/shotcraft) render through persistent
  // preview nodes fed by Host still PNGs (see library preview section below);
  // a failed preview falls back to the text placeholder via the same path.
  if (isLibraryPreviewItem(item) && !libraryPreviewFailed(item)) return ''
  return textComponentMarkup(item, time, scale)
}

function textComponentMarkup(item, time, scale) {
  const elapsed = Math.max(0, time - item.start)
  const fade = item.animation !== 'none' ? Math.min(1, elapsed / 0.28, (item.start + item.duration - time) / 0.2) : 1
  const yOffset = item.animation === 'fadeUp' ? 14 * (1 - Math.min(1, elapsed / 0.35)) : 0
  const style = `left:${item.x / project.width * 100}%;top:${item.y / project.height * 100}%;width:${item.width / project.width * 100}%;height:${item.height / project.height * 100}%;font-size:${item.fontSize * scale}px;opacity:${Math.max(0, fade)};z-index:${item.layer};transform:translateY(${yOffset * scale}px);color:${item.color};`
  const selectedClass = item.id === selectedId ? ' selected' : ''
  if (item.type === 'title') {
    const emphasis = item.emphasisText && item.text.includes(item.emphasisText)
      ? `${escapeHtml(item.text.slice(0, item.text.indexOf(item.emphasisText)))}<span class="title-emphasis">${escapeHtml(item.emphasisText)}</span>${escapeHtml(item.text.slice(item.text.indexOf(item.emphasisText) + item.emphasisText.length))}`
      : escapeHtml(item.text)
    return `<div class="overlay-item title${selectedClass}" data-overlay="${item.id}" style="${style}">${emphasis}<i class="resize-handle"></i></div>`
  }
  if (item.type === 'highlight') return `<div class="overlay-item highlight${item.visualStyle === 'underline' ? ' underline' : ''}${selectedClass}" data-overlay="${item.id}" style="${style};border-color:${item.accent};">${escapeHtml(item.text).replaceAll('\n', '<br>')}<i class="resize-handle"></i></div>`
  return `<div class="overlay-item info${selectedClass}" data-overlay="${item.id}" style="${style};border-left-color:${item.accent};background:${item.background}d9;"><b>${escapeHtml(item.title)}</b><span>${escapeHtml(item.body)}</span><i class="resize-handle"></i></div>`
}

/* ---- Library component still previews (Host PNG) ----
 * Items carrying libraryRef (aikou/talkcraft/shotcraft) show a real still PNG
 * rendered by the Host instead of the inline/text placeholder. The wrapper
 * mounts first with a quiet placeholder (first paint never blocks); the PNG
 * swaps in when it arrives. Any failure — bad ref, timeout, missing renderer —
 * degrades silently to the text placeholder; the panel never errors or blanks.
 *
 * Guards: 300ms debounce on param edits, max 2 concurrent fetches, 15s fetch
 * timeout, 60s fail cooldown per key, client-side object-URL cache (200).
 */
const LIBRARY_PREVIEW_LIBS = new Set(['aikou', 'talkcraft', 'shotcraft'])
const LIBRARY_PREVIEW_MAX_CONCURRENT = 2
const LIBRARY_PREVIEW_TIMEOUT_MS = 15000
const LIBRARY_PREVIEW_DEBOUNCE_MS = 300
const LIBRARY_PREVIEW_COOLDOWN_MS = 60000
const LIBRARY_PREVIEW_URL_CACHE_MAX = 200

const libraryPreviewNodes = new Map()
const libraryPreviewQueue = []
let libraryPreviewActive = 0
const libraryPreviewFailedAt = new Map()
const libraryPreviewUrls = new Map()

function isLibraryPreviewItem(item) {
  return Boolean(item && item.libraryRef && LIBRARY_PREVIEW_LIBS.has(item.libraryRef.lib))
}

function libraryPreviewKey(item) {
  return JSON.stringify([
    item.libraryRef.lib,
    item.libraryRef.componentId ?? null,
    item.libraryRef.params ?? null,
    project.width,
    project.height,
    project.darkScene === true,
  ])
}

function libraryPreviewFailed(item) {
  const failedAt = libraryPreviewFailedAt.get(libraryPreviewKey(item))
  return Boolean(failedAt && Date.now() - failedAt < LIBRARY_PREVIEW_COOLDOWN_MS)
}

function getLibraryPreviewEntry(item) {
  let entry = libraryPreviewNodes.get(item.id)
  if (!entry) {
    const wrapper = document.createElement('div')
    wrapper.className = 'overlay-item library-preview'
    wrapper.dataset.overlay = item.id
    const slot = document.createElement('div')
    slot.className = 'library-preview-slot'
    wrapper.append(slot)
    const img = document.createElement('img')
    img.className = 'library-preview-img'
    img.alt = ''
    img.hidden = true
    wrapper.append(img)
    entry = { wrapper, slot, img, key: null, loadTimer: null, controller: null }
    libraryPreviewNodes.set(item.id, entry)
    overlayLayer.append(wrapper)
  }
  return entry
}

function scheduleLibraryPreviewLoad(entry, item, key) {
  if (entry.loadTimer) clearTimeout(entry.loadTimer)
  if (entry.controller) { try { entry.controller.abort() } catch (ignored) { /* superseded */ } entry.controller = null }
  entry.loadTimer = setTimeout(() => {
    entry.loadTimer = null
    libraryPreviewQueue.push({ itemId: item.id, key })
    pumpLibraryPreviewQueue()
  }, LIBRARY_PREVIEW_DEBOUNCE_MS)
}

function pumpLibraryPreviewQueue() {
  while (libraryPreviewActive < LIBRARY_PREVIEW_MAX_CONCURRENT && libraryPreviewQueue.length > 0) {
    const job = libraryPreviewQueue.shift()
    void runLibraryPreviewLoad(job)
  }
}

async function runLibraryPreviewLoad(job) {
  libraryPreviewActive++
  try {
    await loadLibraryPreview(job)
  } finally {
    libraryPreviewActive--
    pumpLibraryPreviewQueue()
  }
}

function cacheLibraryPreviewUrl(key, base64) {
  const hit = libraryPreviewUrls.get(key)
  if (hit) {
    libraryPreviewUrls.delete(key)
    libraryPreviewUrls.set(key, hit)
    return hit
  }
  const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }))
  libraryPreviewUrls.set(key, url)
  while (libraryPreviewUrls.size > LIBRARY_PREVIEW_URL_CACHE_MAX) {
    const oldest = libraryPreviewUrls.keys().next()
    if (oldest.done) break
    URL.revokeObjectURL(libraryPreviewUrls.get(oldest.value))
    libraryPreviewUrls.delete(oldest.value)
  }
  return url
}

function failLibraryPreview(entry, item, key) {
  libraryPreviewFailedAt.set(key, Date.now())
  if (entry.loadTimer) clearTimeout(entry.loadTimer)
  entry.wrapper.remove()
  libraryPreviewNodes.delete(item.id)
  renderPreview()
}

async function loadLibraryPreview({ itemId, key }) {
  const item = project?.components.find(value => value.id === itemId)
  const entry = libraryPreviewNodes.get(itemId)
  if (!item || !entry || entry.key !== key || !isLibraryPreviewItem(item)) return
  const failedAt = libraryPreviewFailedAt.get(key)
  if (failedAt && Date.now() - failedAt < LIBRARY_PREVIEW_COOLDOWN_MS) {
    failLibraryPreview(entry, item, key)
    return
  }
  const cachedUrl = libraryPreviewUrls.get(key)
  if (cachedUrl) {
    entry.img.src = cachedUrl
    entry.img.hidden = false
    entry.slot.hidden = true
    return
  }
  const controller = new AbortController()
  entry.controller = controller
  const timer = setTimeout(() => controller.abort(), LIBRARY_PREVIEW_TIMEOUT_MS)
  try {
    const res = await fetch('/api/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        libraryRef: item.libraryRef,
        width: project.width,
        height: project.height,
        darkScene: project.darkScene === true,
      }),
      signal: controller.signal,
    })
    if (!res.ok) {
      failLibraryPreview(entry, item, key)
      return
    }
    const payload = await res.json()
    if (!payload || typeof payload.data !== 'string' || payload.data.length === 0) {
      failLibraryPreview(entry, item, key)
      return
    }
    const url = cacheLibraryPreviewUrl(key, payload.data)
    if (entry.key !== key || !entry.wrapper.isConnected) return
    entry.img.src = url
    entry.img.hidden = false
    entry.slot.hidden = true
  } catch (error) {
    failLibraryPreview(entry, item, key)
  } finally {
    clearTimeout(timer)
    if (entry.controller === controller) entry.controller = null
  }
}

function syncLibraryPreviewEntry(entry, item, time) {
  const fullStage = item.libraryRef.lib !== 'talkcraft'
  const visible = active(item, time)
  entry.wrapper.classList.toggle('selected', item.id === selectedId)
  if (fullStage) {
    Object.assign(entry.wrapper.style, { left: '0', top: '0', width: '100%', height: '100%', zIndex: String(item.layer), display: visible ? 'block' : 'none' })
  } else {
    Object.assign(entry.wrapper.style, {
      left: `${item.x / project.width * 100}%`,
      top: `${item.y / project.height * 100}%`,
      width: `${item.width / project.width * 100}%`,
      height: `${item.height / project.height * 100}%`,
      zIndex: String(item.layer),
      display: visible ? 'block' : 'none',
    })
  }
  const key = libraryPreviewKey(item)
  if (entry.key === key) return
  entry.key = key
  entry.img.hidden = true
  entry.img.removeAttribute('src')
  entry.slot.hidden = false
  entry.slot.innerHTML = `<span>${escapeHtml(item.libraryRef.componentId || item.libraryRef.lib)} · 预览生成中…</span>`
  scheduleLibraryPreviewLoad(entry, item, key)
}

function syncLibraryPreviews(time) {
  if (!project) return
  const keep = new Set()
  for (const item of project.components) {
    if (item.type === 'asset' || !isLibraryPreviewItem(item) || libraryPreviewFailed(item)) continue
    keep.add(item.id)
    syncLibraryPreviewEntry(getLibraryPreviewEntry(item), item, time)
  }
  for (const [id, entry] of libraryPreviewNodes) {
    if (keep.has(id)) continue
    if (entry.loadTimer) clearTimeout(entry.loadTimer)
    if (entry.controller) { try { entry.controller.abort() } catch (ignored) { /* teardown */ } }
    entry.wrapper.remove()
    libraryPreviewNodes.delete(id)
  }
}

function renderPreview() {
  const hasVideo = Boolean(project?.video?.asset && video.readyState >= 1)
  $('#empty-stage').classList.toggle('visible', !project?.video?.asset)
  if (hasVideo && !video.dataset.hostSourceUrl) void sourceVideoUrl().then(url => { video.src = url; video.load() })
  const scale = stage.clientWidth / (project?.width || 1280)
  const time = Number(video.currentTime) || 0
  const components = project?.components ?? []
  overlayLayer.innerHTML = components.filter(item => item.type !== 'asset').map(item => componentMarkup(item, time, scale)).join('')
  const keepAssets = new Set()
  for (const item of components.filter(value => value.type === 'asset')) {
    keepAssets.add(item.id)
    const asset = project.mediaAssets.find(value => value.id === item.assetId)
    if (!asset) continue
    let wrapper = previewAssetNodes.get(item.id)
    if (!wrapper) {
      wrapper = document.createElement('div')
      wrapper.className = 'overlay-item asset asset-overlay'
      wrapper.dataset.overlay = item.id
      const media = document.createElement('img')
      media.className = 'asset-media'
      if (asset.mimeType === 'image/png') void hostAssetUrl(asset.id).then(url => { if (media.isConnected) media.src = url })
      else media.dataset.frameBucket = '-1'
      wrapper.append(media)
      const handle = document.createElement('i')
      handle.className = 'resize-handle'
      wrapper.append(handle)
      previewAssetNodes.set(item.id, wrapper)
    }
    const media = wrapper.querySelector('.asset-media')
    const visible = active(item, time)
    wrapper.classList.toggle('selected', item.id === selectedId)
    Object.assign(wrapper.style, { left: `${item.x / project.width * 100}%`, top: `${item.y / project.height * 100}%`, width: `${item.width / project.width * 100}%`, height: `${item.height / project.height * 100}%`, opacity: String(item.opacity), zIndex: String(item.layer), display: visible ? 'block' : 'none' })
    if (asset.mimeType !== 'image/png' && visible) {
      const bucket = Math.floor(((time - item.start) % asset.duration) * 8)
      if (media.dataset.frameBucket !== String(bucket)) {
        media.dataset.frameBucket = String(bucket)
        media.src = `/library/preview/${encodeURIComponent(asset.id)}?time=${(bucket / 8).toFixed(3)}`
      }
    }
    overlayLayer.append(wrapper)
  }
  for (const [id, node] of previewAssetNodes) if (!keepAssets.has(id)) { node.remove(); previewAssetNodes.delete(id) }
  syncLibraryPreviews(time)
  $('#time-readout').textContent = fmt(time)
  $('#playhead-label').textContent = `播放头 ${fmt(time)}`
  renderPlayhead()
}

function syncDynamicAssetPreview() {
  if (!project?.video) return
  const time = Number(video.currentTime) || 0
  for (const item of project.components.filter(value => value.type === 'asset' && !value.hidden)) {
    const asset = project.mediaAssets.find(value => value.id === item.assetId)
    if (!asset || asset.mimeType === 'image/png' || time < item.start || time > item.start + item.duration) continue
    const media = previewAssetNodes.get(item.id)?.querySelector('.asset-media')
    if (!media) continue
    const bucket = Math.floor(((time - item.start) % asset.duration) * 8)
    if (media.dataset.frameBucket !== String(bucket)) {
      media.dataset.frameBucket = String(bucket)
      media.src = `/library/preview/${encodeURIComponent(asset.id)}?time=${(bucket / 8).toFixed(3)}`
    }
  }
  if (!video.paused) requestAnimationFrame(syncDynamicAssetPreview)
}

function renderTimeline() {
  const duration = project?.video?.duration ?? 8
  const timelineDuration = Math.max(1, duration * zoom)
  $('#timeline-duration').textContent = `时长 ${duration.toFixed(2)}s`
  const ruler = $('#ruler')
  ruler.innerHTML = ''
  ruler.style.backgroundSize = `${100 / timelineDuration}% 100%`
  const pixelsPerSecond = ruler.clientWidth / timelineDuration
  const labelInterval = [1, 2, 5, 10, 30, 60].find(interval => interval * pixelsPerSecond >= 60) ?? 60
  const lastWholeSecond = Math.floor(duration)
  const lastRegularLabel = Math.floor(lastWholeSecond / labelInterval) * labelInterval
  for (let sec = 0; sec <= duration; sec += 1) {
    const tick = document.createElement('span')
    tick.className = 'tick'
    const regularLabel = sec % labelInterval === 0
    const spacedEndLabel = sec === lastWholeSecond && (sec - lastRegularLabel) * pixelsPerSecond >= 60
    tick.textContent = regularLabel || spacedEndLabel ? `${sec}s` : ''
    tick.style.left = `${sec / timelineDuration * 100}%`
    ruler.append(tick)
  }
  const tracks = $('#track-list')
  const lanes = [{ id: 'video', name: '视频主轨', type: 'video' }, ...(project?.components ?? []).map(item => ({ id: item.id, name: item.type === 'asset' ? '视觉素材' : ({ title: '标题文字', highlight: '重点强调框', info: '信息卡片' })[item.type], type: item.type, item }))]
  tracks.innerHTML = lanes.map(lane => {
    if (lane.id === 'video') return `<div class="track-row"><div class="track-label track-name">视频主轨</div><div class="track-lane video-lane"><div class="clip video-clip" style="left:0;width:${Math.min(100, duration / timelineDuration * 100)}%">${escapeHtml(project?.video ? `${project.width}×${project.height} · 主视频 + 原音轨` : '等待视频导入')}</div></div></div>`
    const item = lane.item
    const selected = item.id === selectedId ? ' selected' : ''
    const left = item.start / timelineDuration * 100
    const width = item.duration / timelineDuration * 100
    const asset = item.type === 'asset' ? project.mediaAssets.find(value => value.id === item.assetId) : null
    const label = asset ? asset.originalName : item.libraryRef && item.libraryRef.lib === 'aikou' ? `AI口播 ${item.libraryRef.componentId}` : item.type === 'info' ? item.title : item.text.split('\n')[0]
    return `<div class="track-row"><div class="track-label track-name" data-kind="${item.type}">${lane.name}</div><div class="track-lane component-lane"><div class="clip${selected}" data-clip="${item.id}" data-kind="${item.type}" style="left:${left}%;width:${width}%"><i class="clip-handle left"></i><span>${escapeHtml(label)}</span><i class="clip-handle right"></i></div></div></div>`
  }).join('')
  $('#component-count').textContent = `${project?.components.length ?? 0} 个包装组件`
  renderPlayhead()
  bindTimelineEvents(timelineDuration)
}

function renderPlayhead() {
  const duration = Math.max(1, (project?.video?.duration ?? 8) * zoom)
  const x = 92 + (Number(video.currentTime) || 0) / duration * Math.max(1, $('#timeline-content').clientWidth - 92)
  $('#playhead').style.left = `${x}px`
}

function bindTimelineEvents(timelineDuration) {
  const content = $('#timeline-content')
  const laneWidth = Math.max(1, content.clientWidth - 92)
  content.querySelectorAll('.component-lane').forEach(lane => lane.addEventListener('pointerdown', event => {
    if (event.target.closest('.clip')) return
    const rect = lane.getBoundingClientRect()
    video.currentTime = Math.max(0, Math.min(project.video.duration, (event.clientX - rect.left) / rect.width * timelineDuration))
  }))
  content.querySelectorAll('[data-clip]').forEach(block => {
    block.addEventListener('click', () => { selectedId = block.dataset.clip; renderAll() })
    block.addEventListener('pointerdown', event => {
      event.preventDefault()
      event.stopPropagation()
      const item = project.components.find(value => value.id === block.dataset.clip)
      selectedId = item.id
      const startX = event.clientX
      const initialStart = item.start
      const initialDuration = item.duration
      const mode = event.target.classList.contains('right') ? 'resize' : event.target.classList.contains('left') ? 'left-resize' : 'move'
      const move = moveEvent => {
        const delta = (moveEvent.clientX - startX) / laneWidth * timelineDuration
        if (mode === 'move') item.start = Math.max(0, Math.min(project.video.duration - item.duration, initialStart + delta))
        if (mode === 'resize') item.duration = Math.max(0.25, Math.min(project.video.duration - item.start, initialDuration + delta))
        if (mode === 'left-resize') {
          const nextStart = Math.max(0, Math.min(initialStart + initialDuration - 0.25, initialStart + delta))
          item.duration = initialDuration + initialStart - nextStart
          item.start = nextStart
        }
        renderTimeline(); renderPreview(); renderInspector(); setDirty()
      }
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up, { once: true })
    })
  })
}

function field(label, key, value, type = 'text', options = {}) {
  const full = options.full ? ' style="grid-column:1/-1"' : ''
  if (type === 'textarea') return `<label class="field"${full}><span class="field-label">${label}</span><textarea data-prop="${key}" maxlength="${options.maxlength ?? 400}">${escapeHtml(value)}</textarea></label>`
  if (type === 'select') return `<label class="field"${full}><span class="field-label">${label}</span><select data-prop="${key}">${options.values.map(([v, text]) => `<option value="${v}" ${v === value ? 'selected' : ''}>${text}</option>`).join('')}</select></label>`
  return `<label class="field"${full}><span class="field-label">${label}</span><input data-prop="${key}" type="${type}" value="${escapeHtml(value)}" ${type === 'number' ? `step="${options.step ?? 1}" min="${options.min ?? 0}" max="${options.max ?? 9999}"` : ''} /></label>`
}

function renderInspector() {
  const item = selected()
  emptyInspector.classList.toggle('hidden', Boolean(item))
  fields.classList.toggle('hidden', !item)
  $('#delete-component').disabled = !item
  if (!item) { fields.innerHTML = ''; return }
  if (item.type === 'asset') {
    const asset = project.mediaAssets.find(value => value.id === item.assetId)
    fields.innerHTML = `<div class="field-group"><span class="eyebrow">VISUAL ASSET · ${escapeHtml(item.id)}</span><p class="asset-inspector-note">${escapeHtml(asset?.originalName ?? '素材缺失')}<br>${asset?.width} × ${asset?.height} · ${asset?.mimeType === 'image/png' ? '透明 PNG' : 'ProRes 4444 Alpha MOV'} · Alpha 已验证</p></div><div class="field-group"><span class="field-label">时间与画面</span><div class="field-row">${field('开始 (秒)', 'start', item.start, 'number', { step: 0.1, max: project.video.duration })}${field('持续 (秒)', 'duration', item.duration, 'number', { step: 0.1, min: 0.1, max: project.video.duration })}</div><div class="field-row">${field('X', 'x', Math.round(item.x), 'number', { max: project.width })}${field('Y', 'y', Math.round(item.y), 'number', { max: project.height })}</div><div class="field-row">${field('宽度', 'width', Math.round(item.width), 'number', { min: 1, max: project.width })}${field('高度', 'height', Math.round(item.height), 'number', { min: 1, max: project.height })}</div><label class="aspect-lock"><input type="checkbox" data-prop="lockAspectRatio" ${item.lockAspectRatio ? 'checked' : ''}/>保持原始比例</label><div class="field-row">${field('图层顺序', 'layer', item.layer, 'number', { min: 0, max: 100 })}</div><label class="field"><span class="field-label">整体透明度 <output>${Math.round(item.opacity * 100)}%</output></span><div class="opacity-row"><input data-prop="opacity" type="range" min="0" max="1" step="0.01" value="${item.opacity}"/><output>${Math.round(item.opacity * 100)}%</output></div></label><label class="field"><span class="field-label">显示素材</span><input type="checkbox" data-prop="hidden" ${item.hidden ? '' : 'checked'} /></label></div>`
    bindInspectorFields(item)
    return
  }
  const textContent = item.type === 'info'
    ? `${field('卡片标题', 'title', item.title, 'text', { full: true, maxlength: 120 })}${field('说明文字', 'body', item.body, 'textarea', { full: true })}`
    : field(item.type === 'title' ? '标题内容' : '强调内容', 'text', item.text, 'textarea', { full: true })
  fields.innerHTML = `<div class="field-group"><span class="eyebrow">${item.type.toUpperCase()} · ${escapeHtml(item.id)}</span>${textContent}</div><div class="field-group"><span class="field-label">时间与尺寸</span><div class="field-row">${field('开始 (秒)', 'start', item.start, 'number', { step: 0.1, max: project.video.duration })}${field('持续 (秒)', 'duration', item.duration, 'number', { step: 0.1, min: 0.25, max: project.video.duration })}</div><div class="field-row triple">${field('X', 'x', item.x, 'number', { max: project.width })}${field('Y', 'y', item.y, 'number', { max: project.height })}${field('字号', 'fontSize', item.fontSize, 'number', { min: 12, max: 120 })}</div><div class="field-row">${field('宽度', 'width', item.width, 'number', { min: 20, max: project.width })}${field('高度', 'height', item.height, 'number', { min: 20, max: project.height })}</div></div><div class="field-group"><span class="field-label">外观与动画</span><div class="field-row">${field('文字颜色', 'color', item.color, 'color')}${field('强调色', 'accent', item.accent, 'color')}</div>${field('入场效果', 'animation', item.animation, 'select', { full: true, values: [['fadeUp', '淡入上移'], ['fade', '柔和淡入'], ['none', '无动画']] })}<label class="field"><span class="field-label">显示组件</span><input type="checkbox" data-prop="hidden" ${item.hidden ? '' : 'checked'} /></label></div>`
  bindInspectorFields(item)
}

function bindInspectorFields(item) {
  fields.querySelectorAll('[data-prop]').forEach(input => {
    const key = input.dataset.prop
    const eventName = input.tagName === 'TEXTAREA' || input.tagName === 'INPUT' ? 'input' : 'change'
    input.addEventListener(eventName, () => {
      if (input.type === 'checkbox') item[key] = key === 'hidden' ? !input.checked : input.checked
      else item[key] = ['start', 'duration', 'x', 'y', 'width', 'height', 'fontSize', 'layer', 'opacity'].includes(key) ? Number(input.value) : input.value
      if (item.type === 'asset' && item.lockAspectRatio && ['width', 'height'].includes(key)) {
        const asset = project.mediaAssets.find(value => value.id === item.assetId)
        if (asset) {
          if (key === 'width') item.height = item.width * asset.height / asset.width
          else item.width = item.height * asset.width / asset.height
          const paired = fields.querySelector(`[data-prop="${key === 'width' ? 'height' : 'width'}"]`)
          if (paired) paired.value = String(Math.round(item[key === 'width' ? 'height' : 'width']))
        }
      }
      if (key === 'opacity') {
        const outputs = input.closest('.field')?.querySelectorAll('output') ?? []
        outputs.forEach(output => { output.textContent = `${Math.round(item.opacity * 100)}%` })
      }
      renderPreview(); renderTimeline(); setDirty()
    })
  })
}

function renderAll() {
  $('#stage').style.aspectRatio = project?.width && project?.height ? `${project.width}/${project.height}` : '9/16'
  if (!project) {
    $('#empty-stage').classList.add('visible')
    $('#video-meta').textContent = '导入视频后开始'
    renderVisualAssets(); renderAssetRecommendations(); renderTimeline(); renderInspector(); renderPreview()
    return
  }
  projectName.textContent = project.name
  $('#asset-status').textContent = project.video?.asset ? '已导入' : '未导入'
  $('#video-meta').textContent = project.video?.asset ? `${project.width} × ${project.height} · ${Number(project.fps).toFixed(2)}fps · ${project.video.duration.toFixed(2)}s · ${project.video.hasAudio ? `含 ${project.video.audio?.codec ?? '原音轨'}` : '无音轨'}` : '导入视频后开始'
  if (project.video?.asset) {
    $('#asset-card').classList.remove('empty')
    $('#asset-card').innerHTML = `<b>source.mp4</b><span>${project.width}×${project.height} · ${project.video.duration.toFixed(2)} 秒 · ${project.video.hasAudio ? '含音轨' : '无音轨'}</span>`
  }
  renderVisualAssets(); renderAssetRecommendations(); renderPreview(); renderTimeline(); renderInspector()
}

function pointerOnOverlay(event) {
  const overlay = event.target.closest('[data-overlay]')
  if (!overlay || !project) return
  const item = project.components.find(value => value.id === overlay.dataset.overlay)
  if (!item) return
  selectedId = item.id
  renderInspector(); renderTimeline(); renderPreview()
  const rect = stage.getBoundingClientRect()
  const scaleX = project.width / rect.width
  const scaleY = project.height / rect.height
  const resizing = event.target.classList.contains('resize-handle')
  const origin = { x: event.clientX, y: event.clientY, width: item.width, height: item.height, itemX: item.x, itemY: item.y }
  const move = moveEvent => {
    if (resizing) {
      item.width = Math.max(30, Math.min(project.width - item.x, origin.width + (moveEvent.clientX - origin.x) * scaleX))
      item.height = Math.max(30, Math.min(project.height - item.y, origin.height + (moveEvent.clientY - origin.y) * scaleY))
      if (item.type === 'asset' && item.lockAspectRatio) {
        const asset = project.mediaAssets.find(value => value.id === item.assetId)
        if (asset) {
          if (Math.abs(item.width - origin.width) >= Math.abs(item.height - origin.height)) item.height = item.width * asset.height / asset.width
          else item.width = item.height * asset.width / asset.height
        }
      }
    } else {
      item.x = Math.max(0, Math.min(project.width - item.width, origin.itemX + (moveEvent.clientX - origin.x) * scaleX))
      item.y = Math.max(0, Math.min(project.height - item.height, origin.itemY + (moveEvent.clientY - origin.y) * scaleY))
    }
    renderPreview(); renderInspector(); renderTimeline(); setDirty()
  }
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up, { once: true })
}

async function renderVideo() {
  if (!project?.video?.asset) return notify('请先导入视频素材')
  if (!await saveProject(true)) return notify('工程保存失败，未提交 Host 渲染任务')
  $('#render-button').disabled = true
  const status = $('#render-status')
  status.classList.remove('hidden', 'error')
  status.textContent = '渲染任务提交中…'
  const response = await fetch('/api/render', { method: 'POST' })
  const start = await response.json()
  if (!response.ok) { status.classList.add('error'); status.textContent = start.error; $('#render-button').disabled = false; return }
  const poll = async () => {
    const result = await (await fetch(`/api/render/${start.renderId}`)).json()
    if (result.status === 'running') { status.textContent = '正在使用 FFmpeg 合成视频画面并保留源音轨…'; setTimeout(poll, 700); return }
    $('#render-button').disabled = false
    if (result.status === 'completed') {
      const outputResponse = await fetch('/rendered/output.mp4')
      if (!outputResponse.ok) throw new Error('Host 渲染结果不可读取')
      await outputResponse.blob()
      status.innerHTML = `<b>渲染完成 · Harness Host FFmpeg</b><br><small>成片已返回工作台；使用页面顶部“下载 Host 渲染 MP4”。工程文件：${escapeHtml(projectPath ?? 'Host 工程')} · 日志：${escapeHtml(result.log)}</small>`
      notify('MP4 渲染完成，源音轨已保留')
    } else { status.classList.add('error'); status.textContent = `渲染失败：${result.error ?? '未知错误'} · ${result.log ?? ''}` }
  }
  poll()
}

$('#video-file').addEventListener('change', event => importFile(event.target.files?.[0]).catch(error => notify(error.message)))
$('#visual-file').addEventListener('change', async event => {
  const files = [...(event.target.files ?? [])]
  for (const file of files) {
    try { await importVisualAsset(file) } catch (error) { notify(`${file.name}：${error.message}`) }
  }
  event.target.value = ''
})
$('#subtitle-file').addEventListener('change', event => importTranscript(event.target.files?.[0]).catch(error => { $('#transcript-status').textContent = `字幕未导入：${error.message}`; notify(error.message) }))
$('#save-transcript').addEventListener('click', () => saveTranscriptEdits().catch(error => { $('#transcript-status').textContent = `字幕未保存：${error.message}`; notify(error.message) }))
$('#plan-button').addEventListener('click', () => { suggestPackaging().catch(error => notify(error.message)) })
$('#apply-plan').addEventListener('click', applyPackagingSuggestions)
$('#reject-plan').addEventListener('click', () => rejectPackagingPlan().catch(error => notify(error.message)))
$('#ai-model-select').addEventListener('change', renderAiModels)
$('#ai-packaging-toggle').addEventListener('click', event => {
  const panel = $('#ai-packaging-panel')
  const open = panel.classList.contains('hidden')
  panel.classList.toggle('hidden', !open)
  event.currentTarget.setAttribute('aria-expanded', String(open))
  $('#inspector-empty').classList.toggle('hidden', open)
  $('#inspector-fields').classList.toggle('hidden', open || !selected())
  $('#delete-component').classList.toggle('hidden', open)
  if (!open) renderInspector()
})
$('#retrieve-assets').addEventListener('click', () => { try { retrieveAssetRecommendations() } catch (error) { notify(error.message) } })
document.querySelectorAll('[data-add]').forEach(button => button.addEventListener('click', () => addComponent(button.dataset.add)))
$('#save-button').addEventListener('click', () => saveProject())
$('#dark-scene-toggle').addEventListener('change', event => {
  if (!project) return
  project.darkScene = event.currentTarget.checked === true
  setDirty()
})
$('#render-button').addEventListener('click', () => renderVideo().catch(error => { $('#render-button').disabled = false; notify(error.message) }))
$('#delete-component').addEventListener('click', () => {
  if (!selectedId) return
  project.components = project.components.filter(item => item.id !== selectedId)
  selectedId = null
  renderAll(); setDirty()
})
$('#play-button').addEventListener('click', async () => {
  if (!project?.video?.asset) return notify('请先导入 MP4')
  if (video.paused) { await video.play(); playing = true; $('#play-button').textContent = 'Ⅱ' }
  else { video.pause(); playing = false; $('#play-button').textContent = '▶' }
})
video.addEventListener('timeupdate', renderPreview)
video.addEventListener('play', () => { renderPreview(); requestAnimationFrame(syncDynamicAssetPreview) })
video.addEventListener('pause', () => { playing = false; $('#play-button').textContent = '▶'; renderPreview() })
video.addEventListener('ended', () => { playing = false; $('#play-button').textContent = '▶' })
video.addEventListener('loadedmetadata', () => { if (project?.video) renderAll() })
overlayLayer.addEventListener('pointerdown', pointerOnOverlay)
$('#zoom-in').addEventListener('click', () => { zoom = Math.min(2, zoom + 0.2); renderTimeline() })
$('#zoom-out').addEventListener('click', () => { zoom = Math.max(0.6, zoom - 0.2); renderTimeline() })
$('#fit-button').addEventListener('click', () => { zoom = 1; renderTimeline(); notify('预览已适配画布') })
window.addEventListener('resize', renderPreview)
window.addEventListener('resize', renderTimeline)
loadProject().catch(error => notify(error.message))
