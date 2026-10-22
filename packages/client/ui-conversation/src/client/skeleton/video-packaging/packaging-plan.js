/** Parse timestamped subtitle fixtures and convert validated plans to P5 project components. */

import { validateAikouLibraryRefs } from './aikou-lint.js'
import { validateTalkcraftLibraryRefs } from './talkcraft-lint.js'
import { validateShotcraftLibraryRefs } from './shotcraft-cards/shotcraft-lint.js'
import { validateHuashuStyle } from './huashu-style-lint.js'
import { HUASHU_ANIMATIONS, HUASHU_STYLE_PRESETS } from './huashu-style.js'

const COMPONENT_TYPES = new Set(['title', 'highlight', 'info'])
const MAX_SEGMENTS = 500
const MAX_PROPOSALS = 8
/** Libraries a proposal may reference. P1/P2 open talkcraft + shotcraft; huashu stays design-asset (style guide only). */
const LIBRARY_LIBS = new Set(['aikou', 'talkcraft', 'shotcraft', 'huashu'])
const LIBRARY_ALLOWLIST = new Set(['aikou', 'talkcraft', 'shotcraft'])
/**
 * Locked styles per preset and component bucket. The AI may only change
 * text/timing/position; any invented color or size is rejected ("换文字保样式").
 * huashu presets (talking-head / kinetic) are merged in from the style guide.
 */
const STYLE_PRESETS = {
  'neutral-editorial': {
    title: { fontSize: 52, color: '#ffffff', accent: '#e6b94e', background: '#1f2728' },
    highlight: { fontSize: 36, color: '#ffffff', accent: '#e6b94e', background: '#1f2728' },
    info: { fontSize: 30, color: '#ffffff', accent: '#e6b94e', background: '#1f2728' },
  },
  // huashu-motion style guide presets ("借设计不借引擎"): same color discipline.
  ...HUASHU_STYLE_PRESETS,
}

function parseTimestamp(value) {
  const match = /^(?:(\d{2,}):)?(\d{2}):(\d{2})[,.](\d{3})$/.exec(value.trim())
  if (!match) throw new Error(`无效字幕时间码：${value}`)
  const hours = Number(match[1] ?? 0)
  const minutes = Number(match[2])
  const seconds = Number(match[3])
  if (minutes > 59 || seconds > 59) throw new Error(`字幕时间码超出范围：${value}`)
  return hours * 3600 + minutes * 60 + seconds + Number(match[4]) / 1000
}

/** Parse a bounded SRT or WebVTT transcript into normalized timed segments. */
export function parseSubtitles(source, text, mediaDuration) {
  if (!['srt', 'vtt'].includes(source)) throw new Error('只支持 SRT 和 VTT 字幕')
  if (typeof text !== 'string' || text.length > 1_000_000) throw new Error('字幕文件为空或超过 1 MB')
  if (!Number.isFinite(mediaDuration) || mediaDuration <= 0) throw new Error('请先导入有效视频')

  const normalized = text.replace(/^\uFEFF/, '').replace(/\r/g, '').trim()
  const blocks = normalized.replace(/^WEBVTT[^\n]*\n/, '').split(/\n\s*\n/)
  const segments = []
  for (const [index, rawBlock] of blocks.entries()) {
    const lines = rawBlock.split('\n').map(line => line.trim()).filter(Boolean)
    if (!lines.length) continue
    const timingIndex = lines.findIndex(line => line.includes('-->'))
    if (timingIndex < 0) throw new Error(`第 ${index + 1} 段缺少时间区间`)
    const match = /^(\S+)\s+-->\s+(\S+)/.exec(lines[timingIndex])
    if (!match) throw new Error(`第 ${index + 1} 段时间区间格式错误`)
    const start = parseTimestamp(match[1])
    const end = parseTimestamp(match[2])
    const content = lines.slice(timingIndex + 1).join('\n')
    if (!content || end <= start) throw new Error(`第 ${index + 1} 段内容或时长无效`)
    if (end > mediaDuration + 0.05) throw new Error(`字幕第 ${index + 1} 段超出视频时长`)
    segments.push({ id: `cue-${String(segments.length + 1).padStart(3, '0')}`, start, end: Math.min(end, mediaDuration), text: content })
    if (segments.length > MAX_SEGMENTS) throw new Error(`字幕段数不能超过 ${MAX_SEGMENTS}`)
  }
  if (!segments.length) throw new Error('字幕文件没有可读取的时间段')
  return segments
}

/** Create deterministic rule-based fixture suggestions; this does not call an AI model. */
export function createFixturePlan({ duration, width, height, transcript, stylePreset = 'neutral-editorial' }) {
  const proposals = []
  for (const segment of transcript.segments) {
    const phrase = segment.text.replace(/[。！？!?]+$/u, '').trim()
    if (!phrase) continue
    if (proposals.length < MAX_PROPOSALS && /差那么点意思/u.test(phrase)) {
      proposals.push({
        proposalId: `fixture-title-${segment.id}`,
        componentType: 'title',
        segmentId: segment.id,
        evidenceText: segment.text,
        semanticReason: '口播明确描述 AI 产出“不够到位”的问题；标题只摘录字幕原句，不补写结论。',
        start: segment.start,
        duration: Math.min(segment.end - segment.start, 3.6),
        position: { x: 72, y: 64, width: Math.min(900, width - 144), height: 112 },
        content: { text: phrase },
        style: { fontSize: 52, color: '#ffffff', accent: '#e6b94e', background: '#1f2728' },
        animation: 'fadeUp',
        libraryRef: { lib: 'aikou', componentId: 'tag', params: { label: phrase, en: 'NOT QUITE THERE', icon: 'warn', x: 40, y: 300 } },
      })
    } else if (proposals.length < MAX_PROPOSALS && /不要急着改指令|不要急着换工具/u.test(phrase)) {
      proposals.push({
        proposalId: `fixture-highlight-${segment.id}`,
        componentType: 'highlight',
        segmentId: segment.id,
        evidenceText: segment.text,
        semanticReason: '口播在建议解决路径前明确提出“不急于更改”的行动提醒；重点框引用完整原句。',
        start: segment.start,
        duration: Math.min(segment.end - segment.start, 3.6),
        position: { x: Math.max(0, width - 440), y: Math.max(40, Math.round(height * 0.48)), width: 360, height: 148 },
        content: { text: phrase },
        style: { fontSize: 36, color: '#ffffff', accent: '#e6b94e', background: '#1f2728' },
        animation: 'fadeUp',
        libraryRef: { lib: 'aikou', componentId: 'qa', params: { q: '改指令？换工具？', a: '先别急', dir: -1, x: 50, y: 320 } },
      })
    } else if (proposals.length < MAX_PROPOSALS && /标准里面/u.test(phrase)) {
      proposals.push({
        proposalId: `fixture-info-${segment.id}`,
        componentType: 'info',
        segmentId: segment.id,
        evidenceText: segment.text,
        semanticReason: '口播说明让 AI 在创作者自己的标准内工作；标题取自原句，正文保留完整字幕，不扩写。',
        start: segment.start,
        duration: Math.min(segment.end - segment.start, 3.6),
        position: { x: 72, y: Math.max(0, height - 210), width: Math.min(500, width - 144), height: 150 },
        content: { title: '你的标准', body: phrase },
        style: { fontSize: 30, color: '#ffffff', accent: '#e6b94e', background: '#1f2728' },
        animation: 'fadeUp',
        libraryRef: { lib: 'aikou', componentId: 'numlist', params: { label: '你的标准', items: [{ no: '01', lines: [{ text: phrase, at: segment.start }] }], x: 1330, y: 230, w: 540 } },
      })
    } else if (proposals.length < MAX_PROPOSALS && /还得你自己来做判断/u.test(phrase)) {
      proposals.push({
        proposalId: `fixture-title-${segment.id}`,
        componentType: 'title',
        segmentId: segment.id,
        evidenceText: segment.text,
        semanticReason: '口播以人工判断收束；标题仅引用字幕原句，强调最终决定仍由人完成。',
        start: segment.start,
        duration: Math.min(segment.end - segment.start, 3.6),
        position: { x: 72, y: 64, width: Math.min(900, width - 144), height: 112 },
        content: { text: phrase },
        style: { fontSize: 52, color: '#ffffff', accent: '#e6b94e', background: '#1f2728' },
        animation: 'fadeUp',
        libraryRef: { lib: 'aikou', componentId: 'tag', params: { label: '还得你自己判断', en: 'HUMAN JUDGMENT', icon: 'user', x: 40, y: 300 } },
      })
    }
  }
  return {
    schemaVersion: 1,
    planId: `fixture-plan-${Date.now()}`,
    generatedBy: 'fixture-keyword-rules',
    model: null,
    stylePreset,
    requiresVisualReview: true,
    video: { duration, width, height },
    transcript: { id: transcript.id, fileName: transcript.fileName, sourceKind: transcript.sourceKind, segments: transcript.segments },
    proposals,
  }
}

/** Reject invalid references, unsupported types, excessive overlap, or out-of-video timing. */
export function validatePackagingPlan(plan) {
  if (!plan || plan.schemaVersion !== 1 || plan.generatedBy !== 'fixture-keyword-rules' || plan.model !== null || plan.requiresVisualReview !== true) throw new Error('包装方案来源、人工复核要求或版本无效')
  const { duration, width, height } = plan.video ?? {}
  if (![duration, width, height].every(Number.isFinite) || duration <= 0 || width < 16 || height < 16) throw new Error('包装方案视频参数无效')
  const lockedStyles = STYLE_PRESETS[plan.stylePreset]
  if (!lockedStyles) throw new Error(`不支持的风格预设：${plan.stylePreset}`)
  const segments = new Map((plan.transcript?.segments ?? []).map(segment => [segment.id, segment]))
  if (!segments.size || !Array.isArray(plan.proposals) || plan.proposals.length > MAX_PROPOSALS) throw new Error('字幕证据或包装组件数量无效')
  const proposalIds = new Set()
  for (const item of plan.proposals) {
    if (typeof item.proposalId !== 'string' || !item.proposalId || proposalIds.has(item.proposalId)) throw new Error('包装方案包含空或重复的组件 ID')
    proposalIds.add(item.proposalId)
    if (!COMPONENT_TYPES.has(item.componentType)) throw new Error(`不支持包装组件：${item.componentType}`)
    const segment = segments.get(item.segmentId)
    if (!segment || item.evidenceText !== segment.text || !item.semanticReason) throw new Error(`组件 ${item.proposalId} 缺少可追溯字幕依据`)
    if (![item.start, item.duration, item.position?.x, item.position?.y, item.position?.width, item.position?.height].every(Number.isFinite)) throw new Error(`组件 ${item.proposalId} 的时间或坐标无效`)
    const end = item.start + item.duration
    if (item.start < segment.start || end > segment.end + 0.001 || end > duration + 0.001 || item.duration <= 0.2) throw new Error(`组件 ${item.proposalId} 超出对应口播区间或视频时长`)
    const { x, y, width: itemWidth, height: itemHeight } = item.position
    if (x < 0 || y < 0 || itemWidth <= 0 || itemHeight <= 0 || x + itemWidth > width || y + itemHeight > height) throw new Error(`组件 ${item.proposalId} 超出画布范围`)
    const text = item.componentType === 'info' ? item.content?.title + item.content?.body : item.content?.text
    if (typeof text !== 'string' || !text.trim() || text.length > 400) throw new Error(`组件 ${item.proposalId} 文案无效`)
    if (!HUASHU_ANIMATIONS.includes(item.animation)) throw new Error(`组件 ${item.proposalId} 动画无效：只能是 ${HUASHU_ANIMATIONS.join('、')}`)
    const locked = lockedStyles[item.componentType]
    const style = item.style ?? {}
    if (locked.fontSize !== style.fontSize || locked.color !== style.color || locked.accent !== style.accent || locked.background !== style.background) {
      throw new Error(`组件 ${item.proposalId} 的样式不在锁定预设内：只许换文字/时间/位置`)
    }
    if (item.libraryRef !== undefined) {
      const ref = item.libraryRef
      if (!ref || typeof ref !== 'object' || Array.isArray(ref)) throw new Error(`组件 ${item.proposalId} 的组件引用无效`)
      if (!LIBRARY_LIBS.has(ref.lib)) throw new Error(`组件 ${item.proposalId} 引用的组件库不受支持：${ref.lib}`)
      if (!LIBRARY_ALLOWLIST.has(ref.lib)) throw new Error(`组件 ${item.proposalId} 引用的组件库 ${ref.lib} 尚未开放`)
      if (typeof ref.componentId !== 'string' || !ref.componentId.trim()) throw new Error(`组件 ${item.proposalId} 的组件引用缺少组件 ID`)
      if (!ref.params || typeof ref.params !== 'object' || Array.isArray(ref.params)) throw new Error(`组件 ${item.proposalId} 的组件引用缺少参数包`)
      if (ref.state !== undefined && typeof ref.state !== 'string') throw new Error(`组件 ${item.proposalId} 的组件引用画面状态无效`)
    }
  }
  // 组件级门禁：已开放三库的 componentId 白名单 + 参数校验。
  // 每个校验器只看自己库的提案；无 libraryRef 的提案跳过；非法引用抛中文错。
  validateAikouLibraryRefs({ proposals: plan.proposals.filter(item => item.libraryRef?.lib === 'aikou') })
  validateTalkcraftLibraryRefs({ proposals: plan.proposals.filter(item => item.libraryRef?.lib === 'talkcraft') })
  validateShotcraftLibraryRefs({ proposals: plan.proposals.filter(item => item.libraryRef?.lib === 'shotcraft') })
  // 风格铁律（huashu 设计语言）：animation 只能取指南里的 8 个值，不许 AI 自创。
  validateHuashuStyle(plan)
  for (let time = 0; time < duration; time += 0.05) {
    const visible = plan.proposals.filter(item => time >= item.start && time < item.start + item.duration)
    if (visible.length > 2) throw new Error(`时间 ${time.toFixed(2)}s 同时出现的包装组件超过两类`)
    for (let first = 0; first < visible.length; first += 1) {
      for (let second = first + 1; second < visible.length; second += 1) {
        const a = visible[first].position
        const b = visible[second].position
        const overlaps = a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
        if (overlaps) throw new Error(`时间 ${time.toFixed(2)}s 包装组件互相遮挡`)
      }
    }
  }
  return plan
}

/** Append approved suggestions without replacing existing or previously edited components. */
export function applyPackagingPlan(project, plan, selectedProposalIds = plan.proposals.map(item => item.proposalId)) {
  validatePackagingPlan(plan)
  const selected = new Set(selectedProposalIds)
  const existing = new Set(project.components.map(item => item.proposalId).filter(Boolean))
  const additions = plan.proposals.filter(item => selected.has(item.proposalId) && !existing.has(item.proposalId))
  const nextLayer = Math.max(0, ...project.components.map(item => item.layer))
  const components = additions.map((proposal, index) => {
    const common = {
      id: crypto.randomUUID(),
      proposalId: proposal.proposalId,
      type: proposal.componentType,
      start: proposal.start,
      duration: proposal.duration,
      layer: nextLayer + index + 1,
      fontSize: proposal.style.fontSize,
      color: proposal.style.color,
      accent: proposal.style.accent,
      background: proposal.style.background,
      animation: proposal.animation,
      hidden: false,
      ...(proposal.libraryRef ? { libraryRef: proposal.libraryRef } : {}),
      x: proposal.position.x,
      y: proposal.position.y,
      width: proposal.position.width,
      height: proposal.position.height,
      semanticEvidence: proposal.evidenceText,
    }
    return proposal.componentType === 'info'
      ? { ...common, title: proposal.content.title, body: proposal.content.body, text: '' }
      : { ...common, text: proposal.content.text }
  })
  return {
    project: {
      ...project,
      components: [...project.components, ...components],
      packagingPlanRecord: {
        planId: plan.planId,
        generatedBy: plan.generatedBy,
        model: plan.model,
        stylePreset: plan.stylePreset,
        transcript: plan.transcript,
        proposals: plan.proposals,
        appliedAt: new Date().toISOString(),
      addedProposalIds: additions.map(item => item.proposalId),
      },
    },
    addedIds: components.map(item => item.id),
    skippedProposalIds: plan.proposals.filter(item => existing.has(item.proposalId)).map(item => item.proposalId),
  }
}
