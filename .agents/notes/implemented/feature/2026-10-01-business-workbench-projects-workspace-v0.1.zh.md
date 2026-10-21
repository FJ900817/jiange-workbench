# Agent Note: Business Workbench Projects Workspace Projection

Status: implemented

English | [中文](2026-10-01-business-workbench-projects-workspace-v0.1.md)

## Problem

Projects 页面需要连接已有 XHS 业务证据，同时不能暗示存在 Project Registry，也不能把一条生产样本等同于整个 Project。

## Decision

Projects 使用现有 `XhsRealContext` 的只读 `xhs` 投影。客户端 `ProjectContext` 携带 `projectId: null`、已有项目 discriminator、展示元数据，以及拆分为账号、周期、周次和 note 的精确样本 identity。账号2 Swiss 样本是该投影中的证据，不是已注册 Project。Fixture 项目保持明确区分；Host 尚无 Project Registry 时，Project 创建入口不可用。

Project detail 从共享 Host projection 读取当前 Job、Review、Validation、Artifact、封面、素材和 Workspace 事实。一次性内存导航请求可打开同一条样本的 Work detail、Image Studio 或 Cover Studio；目标页面仍从共享投影读取自己的内容。导航不会持久化业务记录，也不会复制真值。

## Alternatives considered

- **为页面创建 Project Registry 或虚构 Project ID**：这会声称 Host 当前不存在的持久实体和 Workspace 关系。
- **将生产样本继续作为 Project Fixture**：这会隐藏当前 Job / Artifact 真值，并可能与账号4示例混淆。
- **把项目 identity 放进 URL 或持久化 store**：当选中的投影已经提供 identity 时，这会增加路由持久化，并形成第二个 identity 所有者。

## Consequences

用户可以查看现有 XHS 工作上下文，并在 Projects、Work 和两个真实 Studio 页面之间直接切换。当前页面仍不能创建、编辑或独立枚举正式 Project；页面名称和 key 标识的是只读投影而非注册实体。正式 Desktop 视觉验收要求运行中的 Web Runtime 实际服务本次构建；旧 bundle 不能作为有效截图证据。

## Testing

聚焦客户端测试覆盖只读 ProjectContext、禁用创建入口、Fixture 行隔离、真实 Review / Validation 状态，以及跳转到同一 Work 与 Studio 样本。输出包将 Desktop 截图验收结果与 build、test 结果分开记录。
