import { describe, expect, it } from 'vitest'
import type { XhsFeedSummary } from '@deepseek-ai/dsh-business-workbench/types'
import { deriveXhsIntelligence } from '../src/client/skeleton/xhs-intelligence.ts'

function feed(id: string, values: Partial<XhsFeedSummary> = {}): XhsFeedSummary {
  return {
    id, xsecToken: `private-${id}`, title: `标题 ${id}`, author: '作者', coverAssetId: null, noteType: 'normal',
    likeCount: 10, collectCount: 2, commentCount: 1, ...values,
  }
}

describe('Xiaohongshu current-sample intelligence', () => {
  it('deduplicates feed identities and retains every matching keyword', () => {
    const projection = deriveXhsIntelligence([
      { keyword: '设计审美', feeds: [feed('same'), feed('one')] },
      { keyword: 'AI设计', feeds: [feed('same')] },
    ])
    expect(projection.feeds).toHaveLength(2)
    expect(projection.feeds[0]?.matchedKeywords).toEqual(['设计审美', 'AI设计'])
    expect(projection.signals.some(signal => signal.type === 'cross_keyword'
      && signal.keywords.join(',') === '设计审美,AI设计')).toBe(true)
  })

  it('uses the documented engagement weights and preserves null source values', () => {
    const projection = deriveXhsIntelligence([{ keyword: '设计', feeds: [feed('weighted', {
      likeCount: 10, collectCount: 4, commentCount: 3,
    }), feed('unknown', { likeCount: null, collectCount: null, commentCount: null })] }])
    expect(projection.feeds[0]?.engagementScore).toBe(27)
    expect(projection.feeds[1]?.engagementScore).toBe(0)
    expect(projection.feeds[1]?.likeCount).toBeNull()
    expect(JSON.stringify(projection.signals)).not.toContain('private-')
  })

  it('renders one cross-priority card when one feed matches three signal types', () => {
    const repeated = feed('same', { likeCount: 100, collectCount: 90, commentCount: 80 })
    const projection = deriveXhsIntelligence([
      { keyword: 'AI设计', feeds: [repeated, feed('baseline-a'), feed('baseline-b')] },
      { keyword: 'AI工作流', feeds: [repeated] },
    ])
    const cards = projection.signals.filter(signal => signal.feedIndexes.includes(0))
    expect(cards).toHaveLength(1)
    expect(cards[0]?.type).toBe('cross_keyword')
    expect(cards[0]?.matchedSignalTypes).toEqual(['cross_keyword', 'high_comment', 'high_collect', 'high_engagement'])
  })

  it('keeps a real cross-keyword candidate when higher-engagement candidates fill the sample', () => {
    const lowCross = feed('cross', { likeCount: 2, collectCount: 1, commentCount: 1 })
    const highFeeds = Array.from({ length: 16 }, (_, index) => feed(`high-${index}`, {
      likeCount: 100 + index, collectCount: 20 + index, commentCount: 10 + index,
    }))
    const projection = deriveXhsIntelligence([
      { keyword: 'AI设计', feeds: [lowCross, ...highFeeds] },
      { keyword: 'AI工作流', feeds: [lowCross] },
    ])
    expect(projection.signals.length).toBeLessThanOrEqual(8)
    expect(projection.signals.some(signal => signal.type === 'cross_keyword'
      && signal.keywords.join(',') === 'AI设计,AI工作流')).toBe(true)
  })

  it('does not create a cross-keyword signal when no feed repeats across keywords', () => {
    const projection = deriveXhsIntelligence([{ keyword: '设计', feeds: [feed('one'), feed('two')] }])
    expect(projection.signals.some(signal => signal.matchedSignalTypes.includes('cross_keyword'))).toBe(false)
  })

  it('covers each signal type with real candidates and keeps the total at eight or fewer', () => {
    const repeated = feed('repeated', { likeCount: 100, collectCount: 10, commentCount: 5 })
    const projection = deriveXhsIntelligence([
      { keyword: 'AI设计', feeds: [repeated, feed('base-a', { likeCount: 100, collectCount: 10, commentCount: 5 }),
        feed('base-b', { likeCount: 100, collectCount: 10, commentCount: 5 }), feed('ratio', {
          likeCount: 100, collectCount: 90, commentCount: 80,
        }), ...Array.from({ length: 12 }, (_, index) => feed(`extra-${index}`, {
          likeCount: 100 + index, collectCount: 8, commentCount: 4,
        }))] },
      { keyword: 'AI工作流', feeds: [repeated] },
    ])
    const types = new Set(projection.signals.flatMap(signal => signal.matchedSignalTypes))
    expect(types).toEqual(new Set(['cross_keyword', 'high_comment', 'high_collect', 'high_engagement']))
    expect(projection.signals).toHaveLength(8)
    expect(new Set(projection.signals.flatMap(signal => signal.feedIndexes)).size).toBe(projection.signals.length)
  })

  it('deduplicates visibly equivalent titles and keeps the candidate with broader keyword evidence', () => {
    const projection = deriveXhsIntelligence([
      { keyword: '设计', feeds: [feed('weaker', { title: 'AI 设计：入门！', likeCount: 10 }),
        feed('broader', { title: 'AI设计入门', likeCount: 1 })] },
      { keyword: 'AI工作流', feeds: [feed('broader', { title: 'AI设计入门', likeCount: 1 })] },
    ])
    const titleCards = projection.signals.filter(signal => signal.feedIndexes.some(index => projection.feeds[index]?.title?.replace(/\s|[：！]/gu, '') === 'AI设计入门'))
    expect(titleCards).toHaveLength(1)
    expect(titleCards[0]?.keywords).toEqual(['设计', 'AI工作流'])
  })

  it('derives only relative candidates from the current sample without trend language', () => {
    const projection = deriveXhsIntelligence([{ keyword: '设计', feeds: [
      feed('a', { likeCount: 10, collectCount: 1, commentCount: 1 }),
      feed('b', { likeCount: 10, collectCount: 9, commentCount: 8 }),
      feed('c', { likeCount: 20, collectCount: 2, commentCount: 1 }),
      feed('d', { likeCount: 10, collectCount: 1, commentCount: 9 }),
    ] }])
    expect(projection.signals.length).toBeLessThanOrEqual(8)
    expect(projection.signals.every(signal => signal.feedIndexes.every(index => index >= 0 && index < projection.feeds.length))).toBe(true)
    expect(projection.signals.some(signal => signal.matchedSignalTypes.includes('high_engagement'))).toBe(true)
    expect(projection.signals.some(signal => signal.matchedSignalTypes.includes('high_collect'))).toBe(true)
    expect(projection.signals.some(signal => signal.matchedSignalTypes.includes('high_comment'))).toBe(true)
    expect(JSON.stringify(projection.signals)).not.toMatch(/增长|上涨|下降|爆发|趋势加速/u)
  })

  it('does not invent relative ratios when metrics are missing or the sample is too small', () => {
    const projection = deriveXhsIntelligence([{ keyword: '设计', feeds: [feed('only', {
      likeCount: null, collectCount: 5, commentCount: null,
    })] }])
    expect(projection.signals.some(signal => signal.matchedSignalTypes.includes('high_collect')
      || signal.matchedSignalTypes.includes('high_comment'))).toBe(false)
  })
})
