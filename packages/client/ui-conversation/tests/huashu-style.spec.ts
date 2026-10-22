import { describe, expect, it } from 'vitest'
import { createFixturePlan, parseSubtitles, validatePackagingPlan } from '../src/client/skeleton/video-packaging/packaging-plan.js'
import {
  HUASHU_ANIMATIONS,
  HUASHU_LANGUAGES,
  HUASHU_CARD_ELEMENTS,
  HUASHU_STYLE_PRESETS,
  HUASHU_STYLE_PRESET_IDS,
  isLegalAnimation,
  HUASHU_STYLE_PROMPT,
} from '../src/client/skeleton/video-packaging/huashu-style.js'
import { validateHuashuStyle } from '../src/client/skeleton/video-packaging/huashu-style-lint.js'
import { VIDEO_PACKAGING_SUGGESTION_SYSTEM_PROMPT } from '../../../business/business-workbench/src/video-packaging-model'

/**
 * huashu-motion style guide (4th library, "借设计不借引擎"): fixture only,
 * no model calls. Covers: animation vocabulary, 20 distilled languages,
 * locked style presets, style lint iron rule, prompt injection.
 */
describe('huashu-motion style guide (fixture only, no model calls)', () => {
  const transcript = {
    id: 'transcript-huashu',
    fileName: 'huashu.srt',
    sourceKind: 'imported-srt',
    segments: parseSubtitles(
      'srt',
      '1\n00:00:01,000 --> 00:00:04,000\n还差那么点意思。\n\n2\n00:00:05,000 --> 00:00:08,000\n不要急着改指令。\n',
      8,
    ),
  }
  const makePlan = (stylePreset = 'neutral-editorial') =>
    createFixturePlan({ duration: 8, width: 1280, height: 720, transcript, stylePreset })

  it('动画词汇表恰好 8 个，含新值且渲染可降级', () => {
    expect(HUASHU_ANIMATIONS).toEqual([
      'fadeUp', 'fade', 'none', 'slam', 'countUp', 'wordSwap', 'wipe', 'spring',
    ])
    for (const a of ['fadeUp', 'slam', 'countUp', 'none']) expect(isLegalAnimation(a)).toBe(true)
    expect(isLegalAnimation('zoomSpin')).toBe(false)
    expect(isLegalAnimation('')).toBe(false)
  })

  it('20 种运动语言全部提炼，每种有说法与动效映射', () => {
    expect(HUASHU_LANGUAGES.length).toBe(20)
    const ids = HUASHU_LANGUAGES.map(l => l.id)
    for (const want of ['talking-head', 'kinetic-type', 'data-story', 'card-montage']) {
      expect(ids).toContain(want)
    }
    for (const lang of HUASHU_LANGUAGES) {
      expect(lang.says.length).toBeGreaterThan(0)
      expect(isLegalAnimation(lang.animation)).toBe(true)
    }
  })

  it('talking-head 5 种卡片元素沉淀齐全', () => {
    expect(HUASHU_CARD_ELEMENTS.map(c => c.element)).toEqual([
      'name-plate', 'count-up-card', 'keyword-huazi', 'chapter-card', 'corner-badge',
    ])
    for (const card of HUASHU_CARD_ELEMENTS) expect(isLegalAnimation(card.animation)).toBe(true)
  })

  it('两个风格预设色板纪律一致（白/金/深，不许自创颜色）', () => {
    expect(HUASHU_STYLE_PRESET_IDS).toEqual(['huashu-talking-head', 'huashu-kinetic'])
    for (const id of HUASHU_STYLE_PRESET_IDS) {
      const preset = HUASHU_STYLE_PRESETS[id]!
      for (const bucket of ['title', 'highlight', 'info'] as const) {
        expect(preset[bucket]!.color).toBe('#ffffff')
        expect(preset[bucket]!.accent).toBe('#e6b94e')
        expect(preset[bucket]!.background).toBe('#1f2728')
      }
    }
    // kinetic 标题字号必须形成 scale contrast（一屏一个主张）
    expect(HUASHU_STYLE_PRESETS['huashu-kinetic']!.title.fontSize).toBeGreaterThan(
      HUASHU_STYLE_PRESETS['huashu-talking-head']!.title.fontSize,
    )
  })

  it('非法 animation 被生产校验链路拒绝（中文错）', () => {
    const plan = makePlan()
    expect(plan.proposals.length).toBeGreaterThan(0)
    plan.proposals[0]!.animation = 'zoomSpin' as never
    expect(() => validatePackagingPlan(plan)).toThrow('动画')
  })

  it('新动画值 slam / countUp 可通过生产校验', () => {
    const plan = makePlan()
    plan.proposals[0]!.animation = 'slam'
    if (plan.proposals[1]) plan.proposals[1]!.animation = 'countUp'
    expect(() => validatePackagingPlan(plan)).not.toThrow()
  })

  it('huashu 风格预设可整体通过校验（四值一字不差）', () => {
    // fixture 按 neutral-editorial 生成 style；切预设时必须同步换成该预设的四值，
    // 否则锁会拒绝——这正是"换文字保样式"要的效果。
    for (const presetId of HUASHU_STYLE_PRESET_IDS) {
      const plan = makePlan(presetId)
      const preset = HUASHU_STYLE_PRESETS[presetId]!
      for (const proposal of plan.proposals) {
        proposal.style = { ...preset[proposal.componentType]! }
      }
      expect(() => validatePackagingPlan(plan)).not.toThrow()
    }
  })

  it('风格 lint 独立可用：非法值抛中文错，合法放行', () => {
    expect(() => validateHuashuStyle({ proposals: [{ proposalId: 'p1', animation: 'bounce' }] })).toThrow(
      '不在 8 个合法取值内',
    )
    expect(validateHuashuStyle({ proposals: [{ proposalId: 'p1', animation: 'wipe' }] })).toBeTruthy()
    expect(() => validateHuashuStyle({})).toThrow('缺少提案列表')
  })

  it('风格指南注入系统提示词（防 AI 味铁律在场）', () => {
    expect(typeof HUASHU_STYLE_PROMPT).toBe('string')
    expect(HUASHU_STYLE_PROMPT).toContain('不许自由发挥')
    for (const a of HUASHU_ANIMATIONS) expect(HUASHU_STYLE_PROMPT).toContain(a)
    expect(VIDEO_PACKAGING_SUGGESTION_SYSTEM_PROMPT).toContain('【风格指南')
    expect(VIDEO_PACKAGING_SUGGESTION_SYSTEM_PROMPT).toContain('huashu-motion')
  })
})
