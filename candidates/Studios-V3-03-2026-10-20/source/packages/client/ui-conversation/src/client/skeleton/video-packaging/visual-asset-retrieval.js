const INTENT_RULES = [
  { id: 'emphasis', label: '观点强调', pattern: /关键|重点|核心|结论|本质|最重要|意味着|不要|不能|避免/u },
  { id: 'process', label: '步骤说明', pattern: /步骤|流程|第一|第二|然后|先把|拆开|写下来|方法|标准/u },
  { id: 'data', label: '数据说明', pattern: /\d+(?:\.\d+)?\s*(?:%|％|元|万|亿|倍)?|数字|数据|比例|增长|收入|成本|人数/u },
]

const TAG_ALIASES = [
  { tag: /强调|重点|观点|标题|核心|结论/u, cues: ['重点', '关键', '核心', '结论', '本质', '意味着'] },
  { tag: /解释|说明|信息卡|步骤|流程|方法/u, cues: ['原因', '因为', '例如', '比如', '方法', '步骤', '流程', '然后', '拆开', '写下来', '标准'] },
  { tag: /数据|数字|统计|指标|比例/u, cues: ['数字', '数据', '比例', '增长', '收入', '成本', '元', '万', '亿', '%', '％'] },
  { tag: /品牌|产品|名称/u, cues: ['品牌', '产品', '名称', '工具'] },
  { tag: /转折|节奏|停顿/u, cues: ['但是', '不过', '然而', '然后', '先', '最后'] },
]

const MAX_RECOMMENDATIONS = 24
const MAX_CANDIDATES_PER_RECOMMENDATION = 3
const REJECTED_LICENSE_TEXT = /待核实|未知|未确认|不明|未授权|无权|禁止|不允许|仅供测试|仅限[^。；;\n]*测试|仅用于测试|技术测试/u
const REUSABLE_LICENSE_TEXT = /已授权|已获许可|已取得许可|允许(?:跨工程)?复用|允许商用|自有版权|自有素材|用户原创|公共领域|CC0|已购买|拥有使用权|有使用权|licensed|authorized|public domain|owned by user/iu

function tagsOf(asset) {
  return [asset.category, ...(asset.purposeTags ?? []), ...(asset.styleTags ?? []), ...(asset.recommendedScenes ?? [])]
    .filter(value => typeof value === 'string' && value.trim())
}

/** Require an explicit permission statement; a user-confirmed flag alone is not a license. */
export function hasClearReusePermission(asset) {
  const license = typeof asset?.licenseStatus === 'string' ? asset.licenseStatus.trim() : ''
  return Boolean(asset?.source?.trim() && license && !REJECTED_LICENSE_TEXT.test(license) && REUSABLE_LICENSE_TEXT.test(license))
}

function matchTag(text, tag) {
  if (tag.length >= 2 && text.includes(tag)) return tag
  const alias = TAG_ALIASES.find(item => item.tag.test(tag))
  return alias?.cues.find(cue => text.includes(cue)) ?? null
}

/** Identify deterministic packaging cues from one exact subtitle segment. */
export function identifyPackagingIntents(text) {
  if (typeof text !== 'string' || !text.trim()) return []
  return INTENT_RULES.filter(rule => rule.pattern.test(text)).map(rule => ({ id: rule.id, label: rule.label }))
}

/** Return only explicitly approved, permission-described assets whose registered tags match the cue. */
export function findConfirmedAssetMatches({ segment, assets }) {
  const intents = identifyPackagingIntents(segment.text)
  if (!intents.length) return []
  const text = segment.text.toLowerCase()
  return assets
    .filter(asset => asset.status === 'user-confirmed' && asset.userConfirmed === true && Boolean(asset.confirmedAt)
      && hasClearReusePermission(asset))
    .map(asset => {
      const matched = [...new Set(tagsOf(asset).map(tag => matchTag(text, tag)).filter(Boolean))]
      if (!matched.length) return null
      return { asset, matchedTags: matched, intents }
    })
    .filter(Boolean)
    .sort((a, b) => b.matchedTags.length - a.matchedTags.length || a.asset.name.localeCompare(b.asset.name, 'zh-CN'))
}

function suggestedPosition(intentIds, width, height, displayWidth, displayHeight) {
  const x = Math.round(width * 0.055)
  const y = intentIds.includes('emphasis') ? Math.round(height * 0.68) : Math.round(height * 0.08)
  return { x: Math.min(x, Math.max(0, width - displayWidth)), y: Math.min(y, Math.max(0, height - displayHeight)) }
}

function suggestedLayout(asset, segment, intents, video) {
  const defaults = asset.defaultDisplay ?? { width: video.width * 0.32, height: video.height * 0.2, duration: asset.duration ?? 4 }
  const ratio = asset.width / asset.height
  const width = Math.min(Math.round(defaults.width), video.width)
  const height = Math.min(Math.round(Math.min(defaults.height, width / ratio)), video.height)
  const start = Math.max(segment.start, 0)
  const duration = Math.min(Number(defaults.duration) || 4, asset.duration ?? Infinity, Math.min(segment.end, video.duration) - start)
  const ratioDelta = Math.abs((asset.width / asset.height) / (video.width / video.height) - 1)
  return {
    aspectFit: ratioDelta <= 0.15 ? 'close' : 'resizable',
    suggestedPosition: suggestedPosition(intents.map(item => item.id), video.width, video.height, width, height),
    suggestedStart: start,
    suggestedDuration: duration,
    suggestedSize: { width, height },
  }
}

/** Build reviewable, local-rule recommendations without changing the project or asset library. */
function isTestOnlyCandidate(asset) {
  return asset?.status === 'test-only-approved'
    && asset.testOnly === true
    && asset.userConfirmed === false
    && typeof asset.source === 'string'
    && asset.source.includes('P5-07 隔离测试')
    && typeof asset.licenseStatus === 'string'
    && asset.licenseStatus.includes('不代表正式授权或用户批准')
}

/** Build local-rule recommendations from the confirmed library, or from the separate P5-07 test profile. */
export function createAssetRecommendations({ transcript, assets, video, testOnlyMode = false }) {
  if (!transcript || !Array.isArray(transcript.segments) || !video) throw new Error('字幕和视频信息缺失')
  const recommendations = []
  for (const segment of transcript.segments) {
    const matches = findConfirmedAssetMatches({ segment, assets: assets.filter(asset => asset.status === 'user-confirmed' && asset.userConfirmed === true && asset.confirmedAt && hasClearReusePermission(asset)) })
    const testMatches = testOnlyMode
      ? assets.filter(isTestOnlyCandidate).map(asset => {
        const intents = identifyPackagingIntents(segment.text)
        const matchedTags = [...new Set(tagsOf(asset).filter(tag => segment.text.includes(tag)))]
        return intents.length && matchedTags.length ? { asset, matchedTags, intents } : null
      }).filter(Boolean)
      : []
    matches.push(...testMatches)
    const match = matches[0]
    if (!match) continue
    const asset = match.asset
    const layout = suggestedLayout(asset, segment, match.intents, video)
    if (layout.suggestedDuration <= 0.2) continue
    const intent = match.intents.map(item => item.label).join('、')
    recommendations.push({
      recommendationId: `asset-rec-${segment.id}-${asset.id}`,
      generatedBy: 'local-tag-rules',
      model: null,
      testOnly: isTestOnlyCandidate(asset),
      segmentId: segment.id,
      evidenceText: segment.text,
      evidenceStart: segment.start,
      evidenceEnd: segment.end,
      intent,
      assetId: asset.id,
      matchedTags: match.matchedTags,
      reason: `本地规则识别为“${intent}”；字幕包含“${match.matchedTags.join('、')}”对应线索，与素材登记标签匹配。`,
      ...layout,
      requiresManualReview: true,
      manualChecks: ['核对画面主体、脸部、手势和已有字幕是否被遮挡', '核对素材授权与实际使用范围', '确认比例调整没有裁切或变形'],
      candidates: matches.slice(0, MAX_CANDIDATES_PER_RECOMMENDATION).map(item => ({
        assetId: item.asset.id,
        name: item.asset.name,
        matchedTags: item.matchedTags,
        ...suggestedLayout(item.asset, segment, item.intents, video),
      })),
    })
    if (recommendations.length >= MAX_RECOMMENDATIONS) return recommendations
  }
  return recommendations
}

function validatePlacement(placement, video) {
  const { start, duration, x, y, width, height } = placement
  if (![start, duration, x, y, width, height].every(Number.isFinite)) throw new Error('素材位置或时间不是有效数字')
  if (start < 0 || duration <= 0.2 || start + duration > video.duration + 0.001) throw new Error('素材时间超出视频范围')
  if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > video.width || y + height > video.height) throw new Error('素材位置或尺寸超出画布')
}

/** Append a user-confirmed recommendation as a new component; existing edits are never replaced. */
export function applyAssetRecommendation(project, recommendation, asset, placement, userConfirmed, testOnlyMode = false) {
  if (userConfirmed !== true) throw new Error('加入时间轴前必须由用户明确确认')
  if (!recommendation || recommendation.generatedBy !== 'local-tag-rules' || recommendation.assetId !== asset?.id) throw new Error('推荐与素材不匹配')
  const testOnly = recommendation.testOnly === true && testOnlyMode && isTestOnlyCandidate(asset)
  const officiallyApproved = asset.status === 'user-confirmed' && asset.userConfirmed === true && Boolean(asset.confirmedAt) && hasClearReusePermission(asset)
  if (!officiallyApproved && !testOnly) throw new Error('素材尚未通过正式授权确认，不能应用')
  validatePlacement(placement, project.video)
  const next = structuredClone(project)
  const existing = next.components.find(item => item.recommendationId === recommendation.recommendationId)
  if (existing) return { project: next, componentId: existing.id, added: false }
  next.mediaAssets ??= []
  if (!next.mediaAssets.some(item => item.id === asset.id)) {
    const extension = asset.mimeType === 'image/png' ? 'png' : 'mov'
    next.mediaAssets.push({ id: asset.id, storage: 'library', originalName: asset.name, mimeType: asset.mimeType, relativePath: `media/${asset.id}.${extension}`, width: asset.width, height: asset.height, duration: asset.duration, hasAlpha: asset.hasAlpha, codec: asset.codec, bytes: asset.bytes, sha256: asset.sha256 })
  }
  const componentId = crypto.randomUUID()
  next.components.push({ id: componentId, recommendationId: recommendation.recommendationId, type: 'asset', assetId: asset.id, ...placement, layer: Math.max(0, ...next.components.map(item => item.layer)) + 1, opacity: 1, lockAspectRatio: true, hidden: false, animation: 'none', approvalKind: testOnly ? 'test-only' : 'user-confirmed' })
  next.updatedAt = new Date().toISOString()
  return { project: next, componentId, added: true }
}
