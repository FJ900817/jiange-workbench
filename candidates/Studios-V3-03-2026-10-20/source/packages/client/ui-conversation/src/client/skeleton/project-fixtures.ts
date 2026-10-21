/** UI-only Business Workbench Project examples; this data is not a Runtime registry. */
export interface ProjectFixture {
  readonly project_id: string
  readonly name: string
  readonly goal: string
  readonly stage: string
  readonly workspace_binding: {
    readonly workspace_id: string
    readonly name: string
    readonly path: string
    readonly state: 'fixture'
  }
  readonly active_work: {
    readonly work_id: string
    readonly title: string
    readonly status: string
    readonly updated_at: string
  } | null
  readonly artifacts: readonly { readonly title: string; readonly kind: string; readonly updated_at: string }[]
  readonly recent_activity: readonly { readonly title: string; readonly time: string }[]
}

/** Representative Project examples used to validate the Projects route. */
export const PROJECT_FIXTURES: readonly ProjectFixture[] = [
  {
    project_id: 'project-xhs-virtual-product',
    name: '小红书虚拟产品',
    goal: '围绕视觉审美认知手册，持续生产经过审核的内容与视觉资产。',
    stage: '封面框架审核',
    workspace_binding: {
      workspace_id: 'workspace-xhs-local',
      name: '小红书生产工作区',
      path: '~/Documents/DeepSeek-Harness-Workspace/xhs',
      state: 'fixture',
    },
    active_work: {
      work_id: 'work-xhs-cover-review',
      title: '账号4 · Editorial 封面框架',
      status: '等待人工确认',
      updated_at: '今天 10:42',
    },
    artifacts: [
      { title: 'Editorial P1–P8 框架', kind: '封面框架', updated_at: '今天' },
      { title: 'Swiss Cover Baseline V0.1', kind: '黄金样本', updated_at: '9月18日' },
    ],
    recent_activity: [
      { title: 'Editorial 框架进入人工审核', time: '今天 10:42' },
      { title: 'Cover Plan 已关联正文终稿', time: '今天 09:18' },
      { title: '新增账号4单篇封面验证', time: '昨天 16:30' },
    ],
  },
  {
    project_id: 'project-wechat-ip',
    name: '公众号 IP',
    goal: '建立稳定的公众号选题、内容与读者关系生产流程。',
    stage: '项目准备',
    workspace_binding: { workspace_id: 'workspace-wechat', name: '公众号工作区', path: '尚未绑定', state: 'fixture' },
    active_work: null,
    artifacts: [],
    recent_activity: [{ title: '整理项目方向', time: '9月22日' }],
  },
  {
    project_id: 'project-ai-media',
    name: 'AI 自媒体',
    goal: '探索可复用的 AI 内容生产与分发方式。',
    stage: '方向探索',
    workspace_binding: { workspace_id: 'workspace-ai-media', name: '自媒体工作区', path: '尚未绑定', state: 'fixture' },
    active_work: null,
    artifacts: [],
    recent_activity: [{ title: '记录首轮内容假设', time: '9月20日' }],
  },
  {
    project_id: 'project-brand-design',
    name: '品牌设计',
    goal: '沉淀品牌策略、视觉探索与可交付设计资产。',
    stage: '待启动',
    workspace_binding: { workspace_id: 'workspace-brand', name: '品牌设计工作区', path: '尚未绑定', state: 'fixture' },
    active_work: null,
    artifacts: [],
    recent_activity: [{ title: '项目空间已建立', time: '9月17日' }],
  },
]
