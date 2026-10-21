# Agent Note: Business Workbench Studios 工作空间

Status: implemented

[English](2026-10-01-business-workbench-studios-workspace-v0.1.md) | 中文

## Problem

Studios 工作空间需要展示已有图片与封面生产证据，同时不能暗示尚不存在的 Provider 或审批能力。

## Decision

Studios 使用账号 2 Swiss 样本的共享只读 `XhsRealContext`。Image Studio 展示已有 P5 候选和 Manifest 状态；Cover Studio 展示冻结的 P1–P8 框架及 Renderer 框架证据。候选预览焦点仅保存在页面状态中。Studio 页面通过现有内存上下文请求导航到 Project Detail 和 Work Detail。

Video、Avatar 和 Voice Studio 只显示为不可用入口，不提供交互路由。产品页面不渲染旧 Fixture 的生成或审批流程。

## 考虑过的方案

- **在产品路由中保留可访问的 Fixture 生成与审批原型** — 会把模拟候选创建或审批呈现为可用能力。
- **创建 Studio Registry 或持久化 Studio 上下文** — 当前 Runtime 数据中不存在该 Registry 或独立 Studio 对象。
- **让 Studios 页面直接使用猜测的 Project 或 Work ID** — 当前样本是只读聚合，不存在正式 Project 或 Work Registry ID。

## 结果

用户可以在 Studios、Project 和 Work 之间检查同一生产样本，而不改变业务状态。生成、审批、正式素材绑定、最终封面渲染及正式 Studio 发现仍不属于本次实现。

## 测试

聚焦客户端测试覆盖真实样本、未来 Studio 不可用状态、只读候选状态、框架状态和 Project/Work 上下文导航。正式 Desktop 截图记录在 Studios Workspace V0.1 输出包中。
