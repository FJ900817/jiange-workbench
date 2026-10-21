/** UI-only Radar examples; no source is fetched and no Evidence or Work is persisted. */
export interface RadarProjectFixture {
  readonly project_id: string
  readonly name: string
}

export type RadarSourceType = 'xiaohongshu' | 'ai' | 'design' | 'shengcai'
export type RadarEvidenceStatus = 'unprocessed' | 'saved'
export type RadarWorkStatus = 'none' | 'created'

export interface RadarSignalFixture {
  readonly signal_id: string
  readonly title: string
  readonly source_type: RadarSourceType
  readonly source_name: string
  readonly source_url: string
  readonly captured_at: string
  readonly summary: string
  readonly evidence: {
    readonly original_title: string
    readonly original_summary: string
    readonly quote: string
    readonly link_label: string
  }
  readonly analysis: string
  readonly project_id: string | null
  readonly project_name: string | null
  readonly evidence_status: RadarEvidenceStatus
  readonly work_status: RadarWorkStatus
}

/** Projects available to local Radar association controls. */
export const RADAR_PROJECT_FIXTURES: readonly RadarProjectFixture[] = [
  { project_id: 'project-xhs-virtual-product', name: '小红书虚拟产品' },
  { project_id: 'project-wechat-ip', name: '公众号 IP' },
  { project_id: 'project-ai-media', name: 'AI 自媒体' },
  { project_id: 'project-brand-design', name: '品牌设计' },
]

/** Representative signals used to validate the Radar list and detail flow. */
export const RADAR_SIGNAL_FIXTURES: readonly RadarSignalFixture[] = [
  {
    signal_id: 'signal-xhs-design-aesthetics',
    title: '小红书搜索流量出现新的“设计审美”表达趋势',
    source_type: 'xiaohongshu',
    source_name: '小红书',
    source_url: 'https://example.invalid/radar/xhs-design-aesthetics',
    captured_at: '今天 09:30',
    summary: '近期搜索内容中，“设计审美提升”开始出现更明确的训练类表达，用户讨论从单张作品展示转向可复用的观察与练习方法。',
    evidence: {
      original_title: '设计审美怎么练：从观察到表达',
      original_summary: '示例来源摘要：内容围绕日常观察、拆解画面重点和持续练习展开。此处为本地演示资料，不代表真实抓取。',
      quote: '“先说清画面里什么最重要，再决定哪些细节值得留下。”',
      link_label: '示例来源链接（未连接）',
    },
    analysis: '如果这种表达持续出现，可能说明受众更愿意为“可练习的方法”停留。可以在小红书虚拟产品中验证：把审美判断拆成清楚的观察步骤，而不是只展示结果。',
    project_id: 'project-xhs-virtual-product',
    project_name: '小红书虚拟产品',
    evidence_status: 'unprocessed',
    work_status: 'none',
  },
  {
    signal_id: 'signal-ai-cn-typography',
    title: '新的 AI 图像模型开始强调中文排版一致性',
    source_type: 'ai',
    source_name: 'AI 行业',
    source_url: 'https://example.invalid/radar/ai-cn-typography',
    captured_at: '今天 08:40',
    summary: '多份模型更新说明开始把多语言文字布局与画面一致性列为改进方向。',
    evidence: {
      original_title: '图像生成模型更新：多语言文本能力改进',
      original_summary: '示例来源摘要：公告描述文本生成与排版一致性方面的变化。此处为本地演示资料，不代表真实抓取。',
      quote: '“改善海报与界面中的多语言文字呈现。”',
      link_label: '示例来源链接（未连接）',
    },
    analysis: '这可能影响未来视觉素材的制作成本，但仍需要在真实中文长文案和正式模板上验证，不能据此替代当前已认证的封面 Renderer。',
    project_id: null,
    project_name: null,
    evidence_status: 'unprocessed',
    work_status: 'none',
  },
  {
    signal_id: 'signal-shengcai-ai-media',
    title: '生财出现一篇关于 AI 自媒体转化路径的实战帖',
    source_type: 'shengcai',
    source_name: '生财有术',
    source_url: 'https://example.invalid/radar/shengcai-ai-media',
    captured_at: '昨天',
    summary: '示例讨论把内容选题、产品承接和持续复盘放在同一条转化路径里。',
    evidence: {
      original_title: '一个 AI 自媒体项目的转化复盘',
      original_summary: '示例来源摘要：作者回顾内容到产品转化的实践过程。此处为本地演示资料，不代表真实抓取。',
      quote: '“每篇内容都要知道它在验证什么，而不是只看有没有发出去。”',
      link_label: '示例来源链接（未连接）',
    },
    analysis: '值得关注的是内容与产品验证之间的关联方式。若要复用，应先拆成可检验的假设，再决定是否形成独立 Work。',
    project_id: 'project-ai-media',
    project_name: 'AI 自媒体',
    evidence_status: 'unprocessed',
    work_status: 'none',
  },
  {
    signal_id: 'signal-design-visual-hierarchy',
    title: '设计趋势讨论重新聚焦信息主次与留白',
    source_type: 'design',
    source_name: '设计趋势',
    source_url: 'https://example.invalid/radar/design-hierarchy',
    captured_at: '昨天',
    summary: '示例讨论认为，降低装饰密度、强化内容主次有助于提升复杂页面的阅读效率。',
    evidence: {
      original_title: '复杂页面中的信息层级观察',
      original_summary: '示例来源摘要：从标题、留白和辅助信息权重讨论页面阅读秩序。此处为本地演示资料，不代表真实抓取。',
      quote: '“先确定主要信息，再让辅助内容退到合适的位置。”',
      link_label: '示例来源链接（未连接）',
    },
    analysis: '这与 Business Workbench 当前的信息层级探索有关，可作为设计复盘的参考信号，但不是已验证的产品结论。',
    project_id: 'project-brand-design',
    project_name: '品牌设计',
    evidence_status: 'unprocessed',
    work_status: 'none',
  },
]

/** Category labels shown by the Radar local prototype. */
export const RADAR_CATEGORIES = ['全部', '小红书', 'AI', '设计', '商业', '生财'] as const
