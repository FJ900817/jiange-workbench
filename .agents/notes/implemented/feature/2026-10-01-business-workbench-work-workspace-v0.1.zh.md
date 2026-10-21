# Agent Note：Business Work Work Workspace 只读投影

状态：已实现

[English](2026-10-01-business-workbench-work-workspace-v0.1.md) | 中文

## 问题

Work 页面把示例条目与真实小红书生产投影混在一起，容易让 Job 层事实被误认为正式 Work 记录。

## 决策

Work V0.1 将账号 2 Swiss 任务 identity 展示为一个只读聚合，读取其真实 Job、Review、Validation、Artifact 引用和 P5 Asset Manifest。不创建 Work Registry、Work ID、生命周期状态、进度或审批写回；界面明确把完成数量标为 Job 级结果，并保留来源状态。

Work 详情使用共享 `XhsRealContext`，通过一次性内存导航进入相同 Project、Image Studio 与 Cover Studio。目标页面继续使用同一 identity，并从共享上下文读取各自投影。

## 考虑过的方案

- **在生产页面保留 Fixture Work 行** — 会让示例状态看起来像 Runtime 真值。
- **从七个 Job 合成正式 Work 记录** — 当前不存在 Work Registry 或来源 Work ID。
- **将所有 Job 压成一个已完成状态** — 会隐藏中断与失败记录，并错误描述聚合状态。

## 结果

用户可以检查真实七 Job 聚合并沿 Project 与 Studio 上下文继续浏览，同时不改动业务数据。正式 Work Registry 与生命周期真值建立前，Work 仍是只读投影。需要关注信号不表示未读，也不代表存在审批能力。

## 测试

聚焦客户端测试覆盖真实聚合、Job 状态汇总、失败证据、只读动作和上下文导航。正式 Desktop 截图保存在 Work Workspace V0.1 输出目录。
