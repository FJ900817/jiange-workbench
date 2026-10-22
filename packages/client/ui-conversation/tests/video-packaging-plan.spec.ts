import { describe, expect, it } from 'vitest'
import { applyPackagingPlan, createFixturePlan, parseSubtitles, validatePackagingPlan } from '../src/client/skeleton/video-packaging/packaging-plan.js'

describe('Video Packaging reviewed plans', () => {
  const transcript = {
    id: 'transcript-test',
    fileName: 'test.srt',
    sourceKind: 'imported-srt',
    segments: parseSubtitles('srt', '1\n00:00:01,000 --> 00:00:04,000\n不要急着改指令。\n', 8),
  }
  const plan = createFixturePlan({ duration: 8, width: 1280, height: 720, transcript })
  const project = { components: [{ id: 'existing', proposalId: 'prior', layer: 3 }], width: 1280, height: 720 }

  it('rejects duplicate proposal ids before a plan can reach the timeline', () => {
    const duplicate = structuredClone(plan)
    duplicate.proposals.push(structuredClone(duplicate.proposals[0]!))
    expect(() => validatePackagingPlan(duplicate)).toThrow('空或重复的组件 ID')
  })

  it('applies only selected suggestions and preserves existing project components', () => {
    expect(plan.proposals).toHaveLength(1)
    const proposal = plan.proposals[0]!
    const result = applyPackagingPlan(project, plan, [])
    expect(result.addedIds).toEqual([])
    expect(result.project.components).toEqual(project.components)
    const accepted = applyPackagingPlan(project, plan, [proposal.proposalId])
    expect(accepted.project.components).toHaveLength(2)
    expect(accepted.project.components[0]).toEqual(project.components[0])
    expect(accepted.project.components[1]!.semanticEvidence).toBe(transcript.segments[0]!.text)
  })
})

describe('Video Packaging library allowlist', () => {
  const transcript = {
    id: 'transcript-lib',
    fileName: 'test.srt',
    sourceKind: 'imported-srt',
    segments: parseSubtitles('srt', '1\n00:00:01,000 --> 00:00:04,000\n不要急着改指令。\n', 8),
  }
  const withLib = (lib: string) => {
    const p = structuredClone(createFixturePlan({ duration: 8, width: 1280, height: 720, transcript }))
    p.proposals[0]!.libraryRef = { lib, componentId: 'x', params: {} }
    return p
  }

  it('accepts refs to integrated libraries (aikou, talkcraft, shotcraft)', () => {
    for (const lib of ['aikou', 'talkcraft', 'shotcraft']) {
      expect(() => validatePackagingPlan(withLib(lib))).not.toThrow()
    }
  })

  it('rejects refs to libraries that are not open yet', () => {
    expect(() => validatePackagingPlan(withLib('huashu'))).toThrow('尚未开放')
    expect(() => validatePackagingPlan(withLib('nope'))).toThrow('不受支持')
  })
})
