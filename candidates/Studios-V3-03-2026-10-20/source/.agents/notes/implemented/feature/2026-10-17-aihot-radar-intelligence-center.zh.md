# Agent Note: AIHOT Radar 情报中心

Status: implemented

[English](2026-10-17-aihot-radar-intelligence-center.md) | 中文

## Problem

Radar 只有公共热点预览和独立的本地 AIHOT 视图，没有供官方公共资讯库、报告索引和热点详情使用的正式页面。周报和月报索引还需要区分真实空结果、请求失败，以及 `latest` 详情可读但未出现在索引中的情况。

## Decision

现有 Radar AI 区域承载已确认的信息中心结构：公共数据首页、完整资讯库、热点事件、周期报告，以及原有本地“我的情报”页面。首页以官方热榜中的一个 Story 为焦点，读取该 Story 的官方摘要和最多两条最新报道，列出最多四条其他官方热点，并链接至信息中心已有页面。来源数明确表示报道覆盖，不代表重要性。首页区分热榜 `HotTopic.sourceCount` 与 Story 详情的 `sourceCount`，并展示 Story 详情的 `reportCount`；证据列表是独立的 `reports[]` 集合，最多展示两条。首页刷新会清空共享公共读取缓存，并刷新现有 Radar 热点。资讯库分别加载官方精选与最近七天全部资讯；资讯库把官方支持的筛选条件和绑定查询的 Cursor 传给现有只读 GET 读取器，并只追加未出现过的官方 Item ID。重复 Cursor 会停止分页。报告索引区分加载、空列表和请求失败；若索引为空但 `latest` 详情可读，则展示该详情并说明索引不一致，不合成索引条目。公共 Item 没有专用详情路由，因此应用内详情只显示列表接口实际返回的字段，并提供 AIHOT 与原文链接。本地 Article、Analysis 和 Review 继续沿用原 Host 路径。

## Alternatives considered

- **把公共 Item 并入本地 AIHOT 存储** — 不采用，因为公共发布记录与用户拥有的 Article／Analysis／Review 数据具有不同归属和生命周期。
- **把空报告索引当成请求失败，或用 `latest` 生成索引行** — 不采用，因为成功的空响应、请求失败和索引／详情不一致是不同的服务状态。
- **从公共 Item 列表记录渲染完整文章正文** — 不采用，因为官方 Item API 没有独立的完整详情操作或正文数据字段。

## Consequences

官方公共数据页面沿用现有 Radar 导航，不增加公开 API 或 Host 操作。搜索结果不在客户端二次过滤，Cursor 由各自查询持有，只有 latest 详情可读时也不会把报告冒充为完整索引。官方 API 未提供该操作前，页面无法展示 AIHOT Item 的完整正文。真实 Desktop 验收与用户视觉验收仍须和组件测试及构建结果分开记录。焦点原标题保留完整文本，通过平衡换行避免尾字孤行，不改变已确认的视觉方向。

## Testing

聚焦组件测试覆盖三层首页、官方 Story 详情和报道、页面导航、筛选参数传递、Cursor 追加与去重、报告索引／详情不一致，以及请求失败与空列表的区分。一次正式 Desktop 会话显示了新版首页，并通过现有只读适配器取得了真实 AIHOT Story 摘要、报道和热点数据。随后运行仓库文档中的 `dev:web` watcher 时，其较大范围的 TypeScript watch 报告了六处既有测试类型错误；该过程中 Desktop 页面变为空白，3080 Host 也停止响应。因此不能把短暂的真实数据渲染视为稳定的最终 Desktop 验收。继续视觉验收前，先恢复正常 Host 会话；没有修改 App Bundle 或用户数据。

用户后续确认 V1.1.3 首页视觉方向 PASS。首页现在区分热榜 `sourceCount`、Story 详情 `sourceCount` 与 Story 详情 `reportCount`；报道证据仍只从 `reports[]` 显示两条。本轮收口时，现有 Desktop 普通导航后显示实时 Story 统计：16 个来源、17 条报道。独立只读浏览器视口在 1280×800 和 1100×800 均无页面横向溢出；1100px 时焦点和证据上下排列。聚焦测试 12/12、包级类型检查和 Client bundle 构建均通过。本轮未运行 `dev:web` 或重启；Client bundle 构建后现有 Desktop 导航时显示了新标签，具体资源重载机制未验证。历史 WKWebView 白屏根因仍为 NOT VERIFIED。
