import type { XhsFeedSummary } from '@deepseek-ai/dsh-business-workbench/types'

/** One successful keyword result retained only for the mounted Radar workspace. */
export interface XhsKeywordBatch {
  readonly keyword: string
  readonly feeds: readonly XhsFeedSummary[]
}

/** A feed merged across monitored keywords with current-sample evidence. */
export interface XhsAggregatedFeed extends XhsFeedSummary {
  readonly matchedKeywords: readonly string[]
  readonly engagementScore: number
}

/** A curated feed card with one primary signal and all matching signal types. */
export interface XhsSignalCandidate {
  readonly type: XhsSignalType
  readonly matchedSignalTypes: readonly XhsSignalType[]
  readonly title: string
  readonly reason: string
  readonly keywords: readonly string[]
  readonly feedIndexes: readonly number[]
}

/** Current-sample signal categories ordered from strongest to weakest editorial priority. */
export type XhsSignalType = 'cross_keyword' | 'high_comment' | 'high_collect' | 'high_engagement'

/** Merged feeds and evidence-led candidates derived from successful keyword batches. */
export interface XhsIntelligenceProjection {
  readonly feeds: readonly XhsAggregatedFeed[]
  readonly signals: readonly XhsSignalCandidate[]
}

const SIGNAL_PRIORITY: readonly XhsSignalType[] = ['cross_keyword', 'high_comment', 'high_collect', 'high_engagement']
const SIGNAL_COPY: Readonly<Record<XhsSignalType, { readonly title: string; readonly reason: (feed: XhsAggregatedFeed) => string }>> = {
  cross_keyword: {
    title: '同一笔记跨关键词重复出现',
    reason: feed => `这条笔记出现在 ${feed.matchedKeywords.length} 个监控关键词结果中。`,
  },
  high_comment: {
    title: '当前样本中评论倾向较高',
    reason: () => '评论/点赞比高于当前可比较样本的中位数。',
  },
  high_collect: {
    title: '当前样本中收藏倾向较高',
    reason: () => '收藏/点赞比高于当前可比较样本的中位数。',
  },
  high_engagement: {
    title: '当前样本中互动表现较高',
    reason: feed => `互动评分 ${feed.engagementScore} 位于本轮监控结果的较高区间；评分仅用于样本内排序。`,
  },
}

/** Merge exact feed identities and curate at most eight unique current-sample cards. */
export function deriveXhsIntelligence(batches: readonly XhsKeywordBatch[]): XhsIntelligenceProjection {
  const byIdentity = new Map<string, { feed: XhsFeedSummary; keywords: Set<string> }>()
  for (const batch of batches) {
    for (const feed of batch.feeds) {
      const identity = feed.id ?? `${feed.title ?? ''}\u0000${feed.author ?? ''}`
      const current = byIdentity.get(identity)
      if (current === undefined) byIdentity.set(identity, { feed, keywords: new Set([batch.keyword]) })
      else current.keywords.add(batch.keyword)
    }
  }
  const feeds = [...byIdentity.values()].map(({ feed, keywords }) => Object.freeze({
    ...feed,
    matchedKeywords: Object.freeze([...keywords]),
    engagementScore: (feed.likeCount ?? 0) + (feed.collectCount ?? 0) * 2 + (feed.commentCount ?? 0) * 3,
  })).sort((left, right) => right.engagementScore - left.engagementScore)

  const typesByFeed = new Map<number, Set<XhsSignalType>>()
  const addType = (index: number, type: XhsSignalType): void => {
    const types = typesByFeed.get(index) ?? new Set<XhsSignalType>()
    types.add(type)
    typesByFeed.set(index, types)
  }

  feeds.forEach((feed, index) => {
    if (feed.matchedKeywords.length > 1) addType(index, 'cross_keyword')
  })

  const positiveScores = feeds.map(feed => feed.engagementScore).filter(score => score > 0)
  if (positiveScores.length > 0) {
    const threshold = quantile(positiveScores, 0.75)
    for (const [index, feed] of feeds.entries()) {
      if (feed.engagementScore >= threshold && feed.engagementScore > 0) addType(index, 'high_engagement')
    }
  }

  addRelativeType(feeds, typesByFeed, 'high_collect', feed => ratio(feed.collectCount, feed.likeCount))
  addRelativeType(feeds, typesByFeed, 'high_comment', feed => ratio(feed.commentCount, feed.likeCount))

  const candidates = [...typesByFeed.entries()].flatMap(([index, types]) => {
    const feed = feeds[index]
    if (feed === undefined) return []
    const matchedSignalTypes = SIGNAL_PRIORITY.filter(type => types.has(type))
    const primaryType = matchedSignalTypes[0]
    if (primaryType === undefined) return []
    const copy = SIGNAL_COPY[primaryType]
    return [Object.freeze({
      type: primaryType,
      matchedSignalTypes: Object.freeze(matchedSignalTypes),
      title: copy.title,
      reason: copy.reason(feed),
      keywords: feed.matchedKeywords,
      feedIndexes: Object.freeze([index]),
    })]
  })

  const curated = deduplicateSignalTitles(candidates, feeds).sort((left, right) => compareSignals(left, right, feeds))
  const selected = new Map<number, XhsSignalCandidate>()
  for (const type of SIGNAL_PRIORITY) {
    const covering = curated.find(signal => signal.matchedSignalTypes.includes(type))
    const feedIndex = covering?.feedIndexes[0]
    if (covering !== undefined && feedIndex !== undefined) selected.set(feedIndex, covering)
  }
  for (const signal of curated) {
    const feedIndex = signal.feedIndexes[0]
    if (feedIndex !== undefined && selected.size < 8) selected.set(feedIndex, signal)
  }

  const signals = [...selected.values()].sort((left, right) => compareSignals(left, right, feeds))
  return Object.freeze({ feeds: Object.freeze(feeds), signals: Object.freeze(signals) })
}

function addRelativeType(
  feeds: readonly XhsAggregatedFeed[],
  typesByFeed: Map<number, Set<XhsSignalType>>,
  type: 'high_collect' | 'high_comment',
  getRatio: (feed: XhsAggregatedFeed) => number | null,
): void {
  const ratios = feeds.map((feed, index) => ({ index, value: getRatio(feed) })).filter(
    (entry): entry is { index: number; value: number } => entry.value !== null,
  )
  if (ratios.length < 2) return
  const middle = median(ratios.map(entry => entry.value))
  for (const entry of ratios) {
    if (entry.value > middle) {
      const types = typesByFeed.get(entry.index) ?? new Set<XhsSignalType>()
      types.add(type)
      typesByFeed.set(entry.index, types)
    }
  }
}

function deduplicateSignalTitles(
  candidates: readonly XhsSignalCandidate[],
  feeds: readonly XhsAggregatedFeed[],
): XhsSignalCandidate[] {
  const byTitle = new Map<string, XhsSignalCandidate>()
  for (const candidate of candidates) {
    const index = candidate.feedIndexes[0]
    const feed = index === undefined ? undefined : feeds[index]
    const titleKey = feed?.title === null || feed?.title === undefined ? '' : normalizeTitle(feed.title)
    if (titleKey.length === 0) {
      byTitle.set(`feed:${index ?? byTitle.size}`, candidate)
      continue
    }
    const current = byTitle.get(titleKey)
    if (current === undefined || compareDuplicateQuality(candidate, current, feeds) < 0) byTitle.set(titleKey, candidate)
  }
  return [...byTitle.values()]
}

function compareDuplicateQuality(left: XhsSignalCandidate, right: XhsSignalCandidate, feeds: readonly XhsAggregatedFeed[]): number {
  const leftFeed = left.feedIndexes[0] === undefined ? undefined : feeds[left.feedIndexes[0]]
  const rightFeed = right.feedIndexes[0] === undefined ? undefined : feeds[right.feedIndexes[0]]
  return (right.keywords.length - left.keywords.length)
    || ((rightFeed?.engagementScore ?? 0) - (leftFeed?.engagementScore ?? 0))
    || (right.matchedSignalTypes.length - left.matchedSignalTypes.length)
}

function compareSignals(left: XhsSignalCandidate, right: XhsSignalCandidate, feeds: readonly XhsAggregatedFeed[]): number {
  const leftFeed = left.feedIndexes[0] === undefined ? undefined : feeds[left.feedIndexes[0]]
  const rightFeed = right.feedIndexes[0] === undefined ? undefined : feeds[right.feedIndexes[0]]
  return (SIGNAL_PRIORITY.indexOf(left.type) - SIGNAL_PRIORITY.indexOf(right.type))
    || (right.keywords.length - left.keywords.length)
    || ((rightFeed?.engagementScore ?? 0) - (leftFeed?.engagementScore ?? 0))
    || (right.matchedSignalTypes.length - left.matchedSignalTypes.length)
}

function normalizeTitle(title: string): string {
  return title.normalize('NFKC').toLocaleLowerCase().replace(/[\p{P}\p{S}\s]+/gu, '')
}

function ratio(numerator: number | null, denominator: number | null): number | null {
  return numerator === null || denominator === null || denominator <= 0 ? null : numerator / denominator
}

function quantile(values: readonly number[], percentile: number): number {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * percentile))] ?? 0
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  const lower = sorted[middle - 1]
  const upper = sorted[middle]
  return sorted.length % 2 === 0 && lower !== undefined && upper !== undefined
    ? (lower + upper) / 2
    : upper ?? 0
}
