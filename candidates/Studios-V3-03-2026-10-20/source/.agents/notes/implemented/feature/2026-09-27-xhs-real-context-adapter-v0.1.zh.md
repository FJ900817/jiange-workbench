# Agent Note: XHS Swiss 只读上下文投影

Status: implemented

[English](2026-09-27-xhs-real-context-adapter-v0.1.md) | 中文

## 问题

Business Workbench 的 Projects、Work 与 Studio 页面需要展示同一条生产样本，同时不能引入平行的 Project、Work 或 Asset 记录。

## 决策

Business Workbench Host 以 `readXhsSwissContext` 暴露账号 2、2026 年 8 月、第 02 周、`note001` 的只读投影。它读取已配置的 XHS 源根目录、Business Artifact 根目录下固定的不可变封面证据、现有 Business Workbench Job，以及这些 Job 引用的 Review 和 Validation Artifact。该投影将 Work 表示为由样本身份键控的聚合，不声称系统已有正式 Project 或 Work 注册表。

读取器固定已知证据路径，检查解析后的路径仍位于配置根目录之内，并在返回候选图片 data URL 前校验 manifest 中的 SHA-256。它返回逻辑来源引用，不返回 Host 文件系统路径。不一致证据标记为 partial；必需文件缺失或格式错误时会 fail closed，不会生成 partial 投影。投影保留 Job 状态、Review 和 Validation 来源关系、Swiss 页面顺序、Renderer 框架证据与未批准的 P5 候选状态。它不会创建记录、批准素材或渲染最终封面。

组装后的 conversation client 注入 `remote.businessWorkbench`，每次页面组装时获取一次投影，并通过本地只读 store 发布。Projects、Work、Image Studio 与 Cover Studio 消费同一投影；其他项目示例继续与真实样本分离。

## 考虑过的替代方案

- **为界面创建 Project 和 Work 注册表**——这会复制现有 Workspace 与 Job 真值，并暗示实际不存在的持久业务对象。
- **继续把 XHS 样本作为 UI fixture**——fixture 无法证明同一批生产 Job、Artifact 与封面证据在各页面保持一致。
- **扫描整个源 Vault**——目录发现会扩大文件访问范围并使样本身份变得含糊；适配器只读取固定样本与固定证据路径。
- **把 P5 候选图当成已批准素材**——生成候选没有人工选择或批准状态，提升它会伪造审批事实。

## 影响

Host 只执行有界读取，Client 不拥有业务真值。界面能够一致展示真实样本，并准确标明 Project 注册、Workspace 绑定、候选审批与最终封面合成均不存在。接入其他样本需要显式修改投影，不会隐式发现目录。

## 测试

投影聚焦测试覆盖 7 个 Job 聚合、Review 与 Validation 来源关系、Swiss 页面顺序、Renderer 证据、未批准候选、Artifact hash 校验及 symlink 包含范围。Client 测试验证真实样本与项目 fixture 分离。assembled web replay 验证 Remote 贡献与 Client 注入的组合。
