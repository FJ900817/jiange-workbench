import { describe, expect, it } from 'vitest'
import { createFixturePlan, parseSubtitles, validatePackagingPlan } from '../src/client/skeleton/video-packaging/packaging-plan.js'
import { AIKOU_COMPONENT_IDS } from '../src/client/skeleton/video-packaging/aikou-lint.js'
import { TALKCRAFT_COMPONENT_IDS } from '../src/client/skeleton/video-packaging/talkcraft-lint.js'
import { SHOTCRAFT_COMPONENT_IDS } from '../src/client/skeleton/video-packaging/shotcraft-cards/shotcraft-lint.js'
import { TALKCRAFT_SELECT_PROMPT } from '../src/client/skeleton/video-packaging/talkcraft-select-prompt.js'
import { SHOTCRAFT_SELECT_PROMPT } from '../src/client/skeleton/video-packaging/shotcraft-cards/shotcraft-select.js'

/**
 * 三库选卡提示词 + lint 校验的收尾接线（fixture only, no model calls）。
 * 覆盖：非法 componentId 被生产校验链路拒绝、无 libraryRef 提案跳过、
 * talkcraft/shotcraft 选卡提示词链路可用。
 */
describe('video packaging library wiring (fixture only, no model calls)', () => {
  const transcript = {
    id: 'transcript-wiring',
    fileName: 'wiring.srt',
    sourceKind: 'imported-srt',
    segments: parseSubtitles(
      'srt',
      '1\n00:00:01,000 --> 00:00:04,000\n还差那么点意思。\n\n2\n00:00:05,000 --> 00:00:08,000\n不要急着改指令。\n',
      8,
    ),
  }
  const makePlan = () => createFixturePlan({ duration: 8, width: 1280, height: 720, transcript })

  it('aikou 非法 componentId 被生产校验链路拒绝（中文错）', () => {
    const plan = makePlan()
    expect(plan.proposals.length).toBeGreaterThan(0)
    plan.proposals[0] = {
      ...plan.proposals[0]!,
      libraryRef: { lib: 'aikou', componentId: 'not-a-component', params: { label: 'x' } },
    }
    expect(() => validatePackagingPlan(plan)).toThrow('不在 8 个白名单')
  })

  it('talkcraft 非法 componentId 被生产校验链路拒绝（中文错）', () => {
    const plan = makePlan()
    plan.proposals[0] = {
      ...plan.proposals[0]!,
      libraryRef: { lib: 'talkcraft', componentId: 'not-a-card', params: {} },
    }
    expect(() => validatePackagingPlan(plan)).toThrow('不在 29 张真 props 卡白名单')
  })

  it('shotcraft 非法 componentId 被生产校验链路拒绝（中文错）', () => {
    const plan = makePlan()
    plan.proposals[0] = {
      ...plan.proposals[0]!,
      libraryRef: { lib: 'shotcraft', componentId: 'not-a-shot', params: {} },
    }
    expect(() => validatePackagingPlan(plan)).toThrow('不在 31 个白名单')
  })

  it('无 libraryRef 的提案跳过组件级校验', () => {
    const plan = makePlan()
    for (const proposal of plan.proposals) delete (proposal as unknown as Record<string, unknown>).libraryRef
    expect(() => validatePackagingPlan(plan)).not.toThrow()
  })

  it('talkcraft 选卡提示词链路可用：覆盖 29 张白名单卡', () => {
    expect(typeof TALKCRAFT_SELECT_PROMPT).toBe('string')
    expect(TALKCRAFT_SELECT_PROMPT).toContain('talkcraft')
    for (const id of TALKCRAFT_COMPONENT_IDS) expect(TALKCRAFT_SELECT_PROMPT).toContain(id)
    expect(TALKCRAFT_COMPONENT_IDS.length).toBe(29)
  })

  it('shotcraft 选卡提示词链路可用：覆盖 31 张白名单卡', () => {
    expect(typeof SHOTCRAFT_SELECT_PROMPT).toBe('string')
    expect(SHOTCRAFT_SELECT_PROMPT).toContain('shotcraft')
    for (const id of SHOTCRAFT_COMPONENT_IDS) expect(SHOTCRAFT_SELECT_PROMPT).toContain(id)
    expect(SHOTCRAFT_COMPONENT_IDS.length).toBe(31)
    expect(AIKOU_COMPONENT_IDS.length).toBe(8)
  })
})
