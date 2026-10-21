/** UI-only Work examples; these values are not Runtime Jobs or approvals. */
export type WorkFixtureStatus = 'waiting_review' | 'running' | 'blocked' | 'completed'

/** Fields shared by a Work list item and its fixture-backed detail page. */
export interface WorkFixture {
  readonly work_id: string
  readonly title: string
  readonly project_id: string
  readonly project_name: string
  readonly status: WorkFixtureStatus
  readonly current_step: string
  readonly updated_at: string
  readonly block_reason?: string
  readonly review_required: boolean
  readonly artifacts: readonly { readonly title: string; readonly kind: string }[]
  readonly timeline: readonly { readonly title: string; readonly time: string; readonly state: 'complete' | 'current' | 'upcoming' }[]
  readonly activity: readonly { readonly title: string; readonly time: string }[]
}

/** Representative lifecycle items for the Work route and its detail view. */
export const WORK_FIXTURES: readonly WorkFixture[] = [
  {
    work_id: 'work-xhs-cover-review',
    title: '小红书｜账号4封面审核',
    project_id: 'project-xhs-virtual-product',
    project_name: '小红书虚拟产品',
    status: 'waiting_review',
    current_step: 'Human Review',
    updated_at: '今天 10:42',
    review_required: true,
    artifacts: [
      { title: '账号4 Editorial P1–P8 框架', kind: '封面框架' },
      { title: '账号4 note001 正文终稿', kind: '正文' },
      { title: '封面审核任务卡', kind: '任务卡' },
    ],
    timeline: [
      { title: 'Task Created', time: '今天 09:12', state: 'complete' },
      { title: 'Draft Generated', time: '今天 09:38', state: 'complete' },
      { title: 'Validation Passed', time: '今天 10:16', state: 'complete' },
      { title: 'Human Review', time: '今天 10:42', state: 'current' },
      { title: 'Final Artifact', time: '等待确认', state: 'upcoming' },
    ],
    activity: [
      { title: '业务审核已通过，等待人工确认', time: '今天 10:42' },
      { title: '结构与高清尺寸检查通过', time: '今天 10:16' },
      { title: 'P1–P8 框架生成完成', time: '今天 09:38' },
    ],
  },
  {
    work_id: 'work-wechat-final-approval',
    title: '公众号｜文章终稿确认',
    project_id: 'project-wechat-ip',
    project_name: '公众号 IP',
    status: 'waiting_review',
    current_step: 'Final Approval',
    updated_at: '今天 09:55',
    review_required: true,
    artifacts: [{ title: '文章终稿', kind: '正文' }, { title: '终稿确认任务卡', kind: '任务卡' }],
    timeline: [
      { title: 'Task Created', time: '今天 08:40', state: 'complete' },
      { title: 'Draft Generated', time: '今天 09:10', state: 'complete' },
      { title: 'Final Approval', time: '今天 09:55', state: 'current' },
      { title: 'Final Artifact', time: '等待确认', state: 'upcoming' },
    ],
    activity: [{ title: '终稿已提交确认', time: '今天 09:55' }],
  },
  {
    work_id: 'work-xhs-body-round-2',
    title: '小红书｜第2轮正文生产',
    project_id: 'project-xhs-virtual-product',
    project_name: '小红书虚拟产品',
    status: 'running',
    current_step: 'S3 正文生成',
    updated_at: '今天 11:08',
    review_required: false,
    artifacts: [{ title: '正文工作稿', kind: '草稿' }],
    timeline: [
      { title: 'Task Created', time: '今天 10:54', state: 'complete' },
      { title: 'S3 正文生成', time: '执行中', state: 'current' },
      { title: 'Human Review', time: '待后续节点', state: 'upcoming' },
    ],
    activity: [{ title: '正在生成正文草稿', time: '今天 11:08' }],
  },
  {
    work_id: 'work-media-competitor-research',
    title: 'AI 自媒体｜竞品分析',
    project_id: 'project-ai-media',
    project_name: 'AI 自媒体',
    status: 'blocked',
    current_step: '来源数据检查',
    updated_at: '今天 08:26',
    block_reason: '缺少来源数据',
    review_required: false,
    artifacts: [{ title: '调研需求摘要', kind: '任务卡' }],
    timeline: [
      { title: 'Task Created', time: '今天 08:05', state: 'complete' },
      { title: '来源数据检查', time: '阻塞', state: 'current' },
      { title: '竞品分析', time: '等待恢复', state: 'upcoming' },
    ],
    activity: [{ title: '等待补充可用来源', time: '今天 08:26' }],
  },
  {
    work_id: 'work-xhs-swiss-baseline',
    title: '小红书｜Swiss 框架回归验证',
    project_id: 'project-xhs-virtual-product',
    project_name: '小红书虚拟产品',
    status: 'completed',
    current_step: '已完成',
    updated_at: '昨天 16:20',
    review_required: false,
    artifacts: [{ title: 'Swiss P1–P8 回归结果', kind: '验证报告' }],
    timeline: [{ title: 'Validation Passed', time: '昨天 16:20', state: 'complete' }],
    activity: [{ title: 'Swiss 黄金样本回归通过', time: '昨天 16:20' }],
  },
  {
    work_id: 'work-brand-direction',
    title: '品牌设计｜视觉方向整理',
    project_id: 'project-brand-design',
    project_name: '品牌设计',
    status: 'completed',
    current_step: '已完成',
    updated_at: '9月23日',
    review_required: false,
    artifacts: [{ title: '视觉方向记录', kind: '项目资料' }],
    timeline: [{ title: '方向整理', time: '9月23日', state: 'complete' }],
    activity: [{ title: '视觉方向已归档到项目', time: '9月23日' }],
  },
]
