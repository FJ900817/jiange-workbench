# Agent Note: Radar 情报空间

Status: implemented

[English](2026-10-02-radar-information-spaces-v0.2.md) | 中文

## Problem

单一 Radar 列表无法为公共 AI 情报、未来的来源研究与跨来源信号提供清晰分区。

## Decision

Radar 页面拥有五个内部页面：总览、AI 情报、小红书雷达、生财有术和综合信号。客户端没有业务页面 pathname router，因此 Radar 使用组件状态切换页面，并始终显示内部二级导航。建议路径只作为 DOM 页面标识，不是可导航 URL。

总览最多预览两条现有公共 AIHOT 只读 Adapter 返回的记录；其他空间使用明确的无数据槽位。AI 情报将公共 AIHOT 与本地 AIHOT 状态分开，本地引擎保持未连接。小红书、生财有术和综合信号没有真实来源或 Registry 时不展示示例记录。

## Alternatives considered

- **在全局 Sidebar 增加来源入口** — 这会把 Radar 子页面提升为一级 Workspace，削弱现有 Workspace 层级。
- **在没有既有路由器时增加 pathname 路由** — 这会为单个 Workspace 引入第二套导航机制。
- **用 Fixture 填充空白空间** — 这会让正式 Desktop 把未证实来源的数据展示成当前信息。

## Consequences

Radar 可以按来源扩展，而不增加全局 Workspace，也不会混淆公共 AIHOT、本地 AIHOT 和未接入来源。内部页面状态不可深链；Radar 组件重建后会回到默认页。公共 AIHOT Adapter 继续只读；来源采集、人工标签写入和跨来源注册不属于本次变更。

## Testing

Radar 公共与 Fixture 页面聚焦测试通过，覆盖内部导航、公共 Story 详情、诚实的未接入来源状态和不使用 Fixture 替代真实数据。ui-conversation TypeScript project、包 bundle 和 apps/web production build 均通过。正式 Harness Desktop reload 后已逐页检查五个页面。当前桌面工具无法持久化窗口级截图。
