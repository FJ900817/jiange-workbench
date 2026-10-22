import { describe, expect, it } from 'vitest'
import {
  SHOTCRAFT_COMPONENT_IDS,
  validateShotcraftLibraryRefs,
} from '../src/client/skeleton/video-packaging/shotcraft-cards/shotcraft-lint.js'

/** 自建 plan 对象：不依赖 fixture 的 aikou refs，只测 shotcraft 校验器本身。 */
function makePlan(refs: Array<unknown>) {
  return {
    proposals: refs.map((libraryRef, i) => ({
      proposalId: `p${i + 1}`,
      libraryRef,
    })),
  }
}

describe('shotcraft libraryRef lint (self-built plans, no model calls)', () => {
  it('whitelist has 31 adapted component ids', () => {
    expect(SHOTCRAFT_COMPONENT_IDS).toHaveLength(31)
    expect(SHOTCRAFT_COMPONENT_IDS).toContain('typography/marker-underline-title')
    expect(SHOTCRAFT_COMPONENT_IDS).toContain('typography/type-assembly-moves')
    expect(SHOTCRAFT_COMPONENT_IDS).toContain('ui-entrance/wall-reveal-moves')
    expect(SHOTCRAFT_COMPONENT_IDS).toContain('data/chart-live-moves')
    expect(SHOTCRAFT_COMPONENT_IDS).toContain('data/timeline-travel')
  })

  it('passes legal shotcraft libraryRefs', () => {
    const plan = makePlan([
      { lib: 'shotcraft', componentId: 'typography/marker-underline-title', params: { title: 'Meet the *new*', sub: '' } },
      { lib: 'shotcraft', componentId: 'typography/type-assembly-moves', params: { variant: 'split-text-stagger', text: 'Hello world' } },
      { lib: 'shotcraft', componentId: 'ui-entrance/list-reveal', params: { items: 'Home|⌘1\nShots|⌘2' } },
      { lib: 'shotcraft', componentId: 'data/timeline-travel', params: { events: 'v1.0|Jul 2026|Jul|Launch|x|y' } },
      { lib: 'shotcraft', componentId: 'data/chart-live-moves', params: { variant: 'oscilloscope-stream' } },
    ])
    expect(validateShotcraftLibraryRefs(plan)).toBe(plan)
  })

  it('skips proposals without libraryRef', () => {
    const plan = makePlan([undefined, undefined])
    expect(validateShotcraftLibraryRefs(plan)).toBe(plan)
  })

  it('rejects a null libraryRef as malformed', () => {
    const plan = makePlan([null])
    expect(() => validateShotcraftLibraryRefs(plan)).toThrow('组件引用不是对象')
  })

  it('rejects an unknown component id outside the whitelist', () => {
    const plan = makePlan([
      { lib: 'shotcraft', componentId: 'typography/flying-words', params: { title: 'x' } },
    ])
    expect(() => validateShotcraftLibraryRefs(plan)).toThrow('不在 31 个白名单组件内')
  })

  it('rejects a libraryRef from another library', () => {
    const plan = makePlan([{ lib: 'aikou', componentId: 'tag', params: { label: 'x' } }])
    expect(() => validateShotcraftLibraryRefs(plan)).toThrow('只处理 shotcraft')
  })

  it('rejects unknown params not in propsSchema', () => {
    const plan = makePlan([
      { lib: 'shotcraft', componentId: 'typography/marker-underline-title', params: { title: 'x', fontColor: '#ff0000' } },
    ])
    expect(() => validateShotcraftLibraryRefs(plan)).toThrow('不允许的参数 "fontColor"')
  })

  it('rejects missing required params', () => {
    const plan = makePlan([
      { lib: 'shotcraft', componentId: 'typography/marker-underline-title', params: { sub: '副' } },
    ])
    expect(() => validateShotcraftLibraryRefs(plan)).toThrow('缺少必填参数 "title"')
  })

  it('rejects an illegal select option for variant', () => {
    const plan = makePlan([
      { lib: 'shotcraft', componentId: 'typography/type-assembly-moves', params: { variant: 'spin-zoom', text: 'Hi' } },
    ])
    expect(() => validateShotcraftLibraryRefs(plan)).toThrow('只能是 split-text-stagger/letterform-drift/text-on-path')
  })

  it('rejects a missing params bag', () => {
    const plan = makePlan([{ lib: 'shotcraft', componentId: 'data/timeline-travel' }])
    expect(() => validateShotcraftLibraryRefs(plan)).toThrow('缺少参数包 params')
  })

  it('rejects a plan without proposals', () => {
    expect(() => validateShotcraftLibraryRefs({} as never)).toThrow('缺少提案列表')
  })
})
