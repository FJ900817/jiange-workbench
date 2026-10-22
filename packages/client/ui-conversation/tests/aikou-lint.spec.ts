import { describe, expect, it } from 'vitest'
import { createFixturePlan, parseSubtitles, validatePackagingPlan } from '../src/client/skeleton/video-packaging/packaging-plan.js'
import { AIKOU_COMPONENT_IDS, validateAikouLibraryRefs } from '../src/client/skeleton/video-packaging/aikou-lint.js'

describe('aikou libraryRef lint (fixture only, no model calls)', () => {
  const transcript = {
    id: 'transcript-aikou',
    fileName: 'aikou.srt',
    sourceKind: 'imported-srt',
    segments: parseSubtitles(
      'srt',
      '1\n00:00:01,000 --> 00:00:04,000\n还差那么点意思。\n\n2\n00:00:05,000 --> 00:00:08,000\n不要急着改指令。\n',
      8,
    ),
  }
  const validPlan = createFixturePlan({ duration: 8, width: 1280, height: 720, transcript })

  it('passes legal libraryRefs from the fixture plan', () => {
    expect(validPlan.proposals.length).toBeGreaterThan(0)
    for (const proposal of validPlan.proposals) expect(proposal.libraryRef).toBeDefined()
    expect(validateAikouLibraryRefs(validPlan)).toBe(validPlan)
  })

  it('rejects an unknown component id outside the 8-component whitelist', () => {
    const plan = structuredClone(validPlan)
    plan.proposals[0] = {
      ...plan.proposals[0]!,
      libraryRef: { ...plan.proposals[0]!.libraryRef!, componentId: 'slam' },
    }
    expect(() => validateAikouLibraryRefs(plan)).toThrow('不在 8 个白名单组件内')
  })

  it('rejects a libraryRef from a library that P0 has not opened', () => {
    const plan = structuredClone(validPlan)
    plan.proposals[0] = {
      ...plan.proposals[0]!,
      libraryRef: { ...plan.proposals[0]!.libraryRef!, lib: 'talkcraft' },
    }
    expect(() => validateAikouLibraryRefs(plan)).toThrow('P0 只开放 aikou')
  })

  it('rejects a missing required param', () => {
    const plan = structuredClone(validPlan)
    const tag = plan.proposals.find(p => p.libraryRef!.componentId === 'tag')!
    delete (tag.libraryRef!.params as Record<string, unknown>).icon
    expect(() => validateAikouLibraryRefs(plan)).toThrow('缺少必填参数 "icon"')
  })

  it('rejects an illegal tag.icon value', () => {
    const plan = structuredClone(validPlan)
    const tag = plan.proposals.find(p => p.libraryRef!.componentId === 'tag')!
    tag.libraryRef!.params.icon = 'rocket'
    expect(() => validateAikouLibraryRefs(plan)).toThrow('tag.icon 只能是')
  })

  it('rejects an illegal qa.dir value', () => {
    const plan = structuredClone(validPlan)
    const qa = plan.proposals.find(p => p.libraryRef!.componentId === 'qa')!
    qa.libraryRef!.params.dir = 0
    expect(() => validateAikouLibraryRefs(plan)).toThrow('qa.dir 只能是')
  })

  it('rejects a self-invented param that is not in the template', () => {
    const plan = structuredClone(validPlan)
    const tag = plan.proposals.find(p => p.libraryRef!.componentId === 'tag')!
    ;(tag.libraryRef!.params as Record<string, unknown>).color = '#ff0000'
    expect(() => validateAikouLibraryRefs(plan)).toThrow('不允许的参数 "color"')
  })

  it('rejects a self-filled style color through validatePackagingPlan', () => {
    const plan = structuredClone(validPlan)
    plan.proposals[0] = {
      ...plan.proposals[0]!,
      style: { ...plan.proposals[0]!.style, color: '#ff0000' },
    }
    expect(() => validatePackagingPlan(plan)).toThrow('锁定预设')
  })

  it('exposes exactly the 8 P0 components', () => {
    expect([...AIKOU_COMPONENT_IDS].sort()).toEqual(
      ['counter', 'months', 'numlist', 'qa', 'stat', 'strips', 'tag', 'tiles'].sort(),
    )
  })
})
