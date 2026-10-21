# Agent Note: Radar AI 破局俱乐部 V0.1

Status: implemented

[English](2026-10-12-radar-aipoju-v0.1.md) | 中文

## Problem

Radar 需要一个只读的 AI 破局俱乐部首页信息流，同时不能向 Renderer 暴露 CLI 凭据，也不能把仅限制 loopback 的 Host API 变成未认证的数据入口。

## Decision

Radar 标签只使用现有原生 Shell 消息桥与 Host 私有 Unix Socket。进入页面时，Host 按已验证的 20 条分页参数读取候选，达到 50 条不同主题或读取上限 100 条后停止；根据来源时间、真实互动和内容完整度对近 7 天主题做本地排序，返回最多 8 条精选，再返回最多 12 条与精选不重复的最新主题。精选使用双列文字优先卡片，有图时在右侧显示缩略图；最新动态保持横向列表，缺图或加载失败时不显示缩略图。卡片摘要会从纯文本中移除与标题重复的开头。Host 仅在内存保留 15 分钟首页快照；手动刷新绕过缓存，刷新失败时保留最近成功结果和安全错误码。关键词搜索最多返回 20 条，只有用户选择主题后才加载详情。固定操作为 `topic.list`、`topic.search` 和 `topic.detail`。只有 Host 进程启动 Breakout CLI；Renderer 只接收规范化主题字段，正文按文本渲染。来源和图片 URL 仅接受 HTTP 或 HTTPS。

页面区分加载、空结果、认证错误和安全错误状态。不执行分析、写入、调度，也不把主题合并到其他 Radar 来源。相同的已认证通道还只开放固定的 SCYS 信息流操作 `scys.recent`、`scys.hot`、`scys.digested`。Host 按官方 schema 构造 `searchTopic` 参数，固定最近 7 天 Unix 秒时间范围，每次最多读取两页、每页 10 条并设定单次调用超时；结果必须具有 `entityType`、`entityId` 和数值 `gmtCreate`，再按身份去重并按来源时间倒序。信息流投影会丢弃文章正文并限制展示字符串长度。服务端筛选条件接受情况与逐篇官方标记证据分别返回；SCYS 操作不进入 HTTP 或 Typert Remote。

## Alternatives considered

**由 Renderer 调用本机 HTTP API。** 否决，因为 loopback 本身无法认证调用者；因此新增 SCYS 读取继续复用已有令牌认证私有 Socket。

**开放通用 CLI 命令或完整能力清单。** 否决，因为 Radar 只需要三个只读操作，不能提供任意命令执行能力。

## Consequences

只有通过原生 Shell 启动并拥有消息桥的 Desktop 才能读取真实主题或执行三个固定的 SCYS 信息流读取。浏览器构建会 fail closed 并显示不可用状态。精选是本地可解释排序，不代表俱乐部官方推荐。SCYS 查询不改变 Radar UI。

## Verification

聚焦 Renderer 测试覆盖列表／详情／搜索调用、认证提示和不可信正文标记的纯文本渲染。Host IPC 测试覆盖操作白名单与认证；Swift 策略测试覆盖精确可信来源检查。正式 Desktop 数据验收与独立的用户视觉验收状态记录在 [Radar 阶段收口](../../../../outputs/Business_Workbench_Radar_Completed_Modules_20261015.md)。
