# Agent Note: 小红书 Radar 使用受限按需只读 Adapter

Status: implemented

[English](2026-10-05-xhs-radar-on-demand-read-adapter.md) | 中文

## Problem

Workbench 需要产品级的小红书读取路径，同时不能向 Renderer 暴露任意 MCP 调用器，也不能暗示存在全站榜单。

## Decision

`BusinessWorkbenchService` 只暴露来源状态、有限关键词搜索和所选笔记详情 Remote。Host adapter 使用固定 loopback MCP URL，要求使用现有仅所有者可读的 `0600` Host credential，并且只允许 `check_login_status`、`search_feeds` 与 `get_feed_detail`。缺少 credential 时 fail closed。搜索不会自动触发，结果不会持久化；Client 只接收映射后的 Feed 字段，缺失值表示为 null。详情读取使用所选搜索结果返回的 id 与 access token。“爆文观察”只对页面内存中当前加载的结果排序，不描述成官方或全局榜单。

组件包含今日信号、爆文观察、搜索发现和评论需求区域。今日信号只有用户明确点击后才会执行可编辑且有上限的关键词列表。评论只展示所选 Feed 普通详情响应中的内容，不自动分类。UI 区分来源不可用、未登录、超时、普通搜索失败、详情失败与空结果。

## Alternatives considered

**向 Client 暴露任意 MCP 工具名或 URL：**拒绝，因为 Renderer 输入会控制 Host 网络访问与工具选择。

**进入页面时搜索全部监控词并加载笔记详情：**拒绝，因为页面导航不应触发大范围来源读取；搜索与详情保持用户主动触发。

**本机服务未鉴权时允许 Host 不带 credential 调用：**拒绝，因为 Host bridge 已定义仅 Host 持有的 credential 路径；本机服务配置与之对齐前必须 fail closed。

**将互动排序命名为热榜：**拒绝，因为数据源没有官方全站排名操作。

## Verification

Host adapter、登录 adapter 与 Radar surface 聚焦测试通过。获准的“设计”实时搜索只调用一次，返回 MCP 工具错误；没有重试，没有可用于实时详情读取的结果。因此正式字段映射和正式 Desktop 视觉验收仍未验证。

## Consequences

Renderer 获得固定产品 facade，而不是 MCP 基础能力；这些 Remote 不可调用写操作工具。现有本机 MCP 服务与 Host credential 对齐前，来源状态返回不可用，也不会显示实时数据。合成测试验证映射逻辑，但不能证明上游真实响应字段；完全上线前必须补充部署响应证据。

## Related

Radar MCP 认证方式由[loopback 无认证读取模式](2026-10-05-xhs-radar-loopback-no-auth.zh.md)取代；本说明保留原 credential 决策记录。
