import { describe, expect, it } from 'vitest'
import {
  TALKCRAFT_COMPONENTS,
  describeTalkcraftReference,
  getTalkcraftComponent,
} from '../src/client/skeleton/video-packaging/talkcraft-components.js'
import {
  TALKCRAFT_COMPONENT_IDS,
  validateTalkcraftLibraryRefs,
} from '../src/client/skeleton/video-packaging/talkcraft-lint.js'
import { TALKCRAFT_SELECT_PROMPT } from '../src/client/skeleton/video-packaging/talkcraft-select-prompt.js'

describe('talkcraft libraryRef lint (fixture only, no model calls)', () => {
  const validPlan = {
    proposals: [
      {
        proposalId: 'p-info',
        libraryRef: {
          lib: 'talkcraft',
          componentId: 'info-card-assemble',
          params: {
            title: '《讲故事的科学》',
            caption: '这期推荐的一本书',
            pills: ['叙事', '心理学'],
            lines: ['三幕结构的现代版：钩子、转折、回收', '为什么开头 3 秒必须有冲突'],
            highlightLines: [0],
          },
        },
      },
      {
        proposalId: 'p-word',
        libraryRef: {
          lib: 'talkcraft',
          componentId: 'word-slot-cycle',
          params: { stem: '一个 AI，帮你', words: ['写代码', '改简历', '查资料'], final: '搞定所有事' },
        },
      },
      { proposalId: 'p-plain', evidenceText: '普通叙述，无组件' },
    ],
  }

  it('passes legal libraryRefs and skips proposals without one', () => {
    const plan = structuredClone(validPlan)
    expect(validateTalkcraftLibraryRefs(plan)).toBe(plan)
  })

  it('rejects a hardcoded (◦) card outside the 29-card whitelist', () => {
    const plan = structuredClone(validPlan)
    plan.proposals[0]!.libraryRef!.componentId = 'bar-chart-growth'
    expect(() => validateTalkcraftLibraryRefs(plan)).toThrow('29 张真 props 卡白名单')
  })

  it('rejects a libraryRef from a library this linter does not own', () => {
    const plan = structuredClone(validPlan)
    plan.proposals[0]!.libraryRef!.lib = 'aikou'
    expect(() => validateTalkcraftLibraryRefs(plan)).toThrow('只开放 talkcraft')
  })

  it('rejects a self-invented param that is not in the card Props', () => {
    const plan = structuredClone(validPlan)
    ;(plan.proposals[0]!.libraryRef!.params as Record<string, unknown>).color = '#ff0000'
    expect(() => validateTalkcraftLibraryRefs(plan)).toThrow('不允许的参数 "color"')
  })

  it('rejects a missing required primary-content param', () => {
    const plan = structuredClone(validPlan)
    delete (plan.proposals[0]!.libraryRef!.params as Record<string, unknown>).title
    expect(() => validateTalkcraftLibraryRefs(plan)).toThrow('缺少必填的主内容参数 "title"')
  })

  it('rejects an empty array param', () => {
    const plan = structuredClone(validPlan)
    ;(plan.proposals[1]!.libraryRef!.params as Record<string, unknown>).words = []
    expect(() => validateTalkcraftLibraryRefs(plan)).toThrow('word-slot-cycle.words 必须是非空数组')
  })

  it('rejects a style-locked color param the AI filled itself', () => {
    const plan = structuredClone(validPlan)
    ;(plan.proposals[0]!.libraryRef!.params as Record<string, unknown>).swatches = ['#ff0000']
    expect(() => validateTalkcraftLibraryRefs(plan)).toThrow('样式锁定参数')
  })

  it('rejects an illegal layout enum value', () => {
    const plan = {
      proposals: [
        {
          proposalId: 'p-layout',
          libraryRef: {
            lib: 'talkcraft',
            componentId: 'parallel-items-with-host',
            params: { layout: 'grid', items: ['甲', '乙', '丙'] },
          },
        },
      ],
    }
    expect(() => validateTalkcraftLibraryRefs(plan)).toThrow('parallel-items-with-host.layout 只能是')
  })

  it('rejects a wrongly typed param', () => {
    const plan = {
      proposals: [
        {
          proposalId: 'p-num',
          libraryRef: {
            lib: 'talkcraft',
            componentId: 'unit-grid-proportion',
            params: { target: '很高', label: ['的观众'] },
          },
        },
      ],
    }
    expect(() => validateTalkcraftLibraryRefs(plan)).toThrow('unit-grid-proportion.target 必须是数字')
  })

  it('exposes exactly the 29 true-props cards', () => {
    expect(TALKCRAFT_COMPONENT_IDS).toHaveLength(29)
    expect(new Set(TALKCRAFT_COMPONENT_IDS).size).toBe(29)
    expect([...TALKCRAFT_COMPONENT_IDS].sort()).toEqual(
      [
        'bed-echo-blur', 'chip-grid-single-select', 'countdown-arc-scatter', 'crash-zoom-punch',
        'doc-park-left-pill-deal', 'error-retype', 'filmstrip-conveyor', 'flying-words',
        'gallery-wall-dolly', 'grid-to-hero', 'host-card-glass-board', 'info-card-assemble',
        'lead-word-zoom-assemble', 'line-carry-transition', 'parallel-items-with-host',
        'rack-focus-pair', 'reticle-lock-on', 'scanline-annotate', 'source-converge',
        'split-60-40-story', 'split-compare-slider', 'split-text-stagger', 'stack-fan-out',
        'still-layout-relay', 'timeline-photo-strip', 'title-demote-to-label',
        'unit-grid-proportion', 'word-relay-filmstrip', 'word-slot-cycle',
      ].sort(),
    )
  })

  it('registry covers every whitelisted card with schema + meta + semantics', () => {
    for (const slug of TALKCRAFT_COMPONENT_IDS) {
      const spec = TALKCRAFT_COMPONENTS[slug]
      expect(spec, slug).toBeDefined()
      expect(spec.propsSchema.length, `${slug} propsSchema`).toBeGreaterThan(0)
      expect(spec.meta.width, `${slug} meta.width`).toBe(960)
      expect(spec.meta.fps, `${slug} meta.fps`).toBe(30)
      expect(spec.meta.durationInFrames, `${slug} meta.durationInFrames`).toBeGreaterThan(0)
      expect(Array.isArray(spec.semanticWords), `${slug} semanticWords`).toBe(true)
      expect(Array.isArray(spec.inputType), `${slug} inputType`).toBe(true)
    }
  })

  it('getTalkcraftComponent throws for an unknown card', () => {
    expect(() => getTalkcraftComponent('slam')).toThrow('不受支持')
  })

  it('describeTalkcraftReference summarizes a ref in plain language', () => {
    const text = describeTalkcraftReference({
      lib: 'talkcraft',
      componentId: 'info-card-assemble',
      params: { title: 'x', lines: ['y'] },
    } as never)
    expect(text).toContain('info-card-assemble')
    expect(text).toContain('7.2s')
  })

  it('select prompt carries the 26-word vocab and the 29 card templates', () => {
    for (const word of ['钩子', '论点', '例证', '数据', '对比', '列举', '定义', '步骤', '转折', '设问',
      '金句', '标题', '引用', '自我介绍', '介绍他人', '号召', '时间地点', '空间叙事',
      '机制', '选择', '过程演示', '章节', '转场', '强调', '氛围', '结尾']) {
      expect(TALKCRAFT_SELECT_PROMPT, `vocab ${word}`).toContain(word)
    }
    for (const slug of TALKCRAFT_COMPONENT_IDS) {
      expect(TALKCRAFT_SELECT_PROMPT, `card ${slug}`).toContain(slug)
    }
    expect(TALKCRAFT_SELECT_PROMPT).toContain('不许编造 src')
  })
})
