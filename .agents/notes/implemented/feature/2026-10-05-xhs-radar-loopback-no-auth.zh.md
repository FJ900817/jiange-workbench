# Agent Note: 小红书 Radar loopback 无认证读取

Status: implemented

[English](2026-10-05-xhs-radar-loopback-no-auth.md) | 中文

## Problem

Workbench 与现有本机客户端需要共用一个小红书 MCP 监听端点，同时避免新增第二套凭据配置。

## Decision

`BusinessWorkbenchService` 只向 Renderer 暴露来源状态、有限关键词搜索和所选笔记详情。Host 无认证连接固定的 `http://127.0.0.1:18060/mcp` endpoint，只调用 `check_login_status`、`search_feeds` 与 `get_feed_detail`。MCP 必须绑定 `127.0.0.1`；Host 不发送 Authorization header，也不接受调用方提供的 endpoint、path、header 或工具名。登录二维码及其他 MCP 工具不属于 Radar Renderer facade。

Host 返回有界 Feed 投影，并将缺失的上游字段保留为 null。搜索只由用户明确触发；详情只在用户选择搜索结果后读取。Feed 数据和来源访问 token 只保留在页面内存。互动排序仅覆盖已加载结果，不称为官方或全站榜单。

本决策针对 Radar 调用取代[凭据版 Adapter 说明](2026-10-05-xhs-radar-on-demand-read-adapter.zh.md)中的 Host token 要求。独立登录 Remote 实现仍保留在 Radar 组件调用路径之外。

## Alternatives considered

**继续要求 Host-only bearer token：**本地阶段不采用，因为当前 MCP 已由本机客户端无认证使用；启用认证前必须让所有客户端统一迁移。

**暴露调用方可选的 HTTP 或 MCP 操作：**不采用，因为由 Renderer 控制目的地址或工具名会赋予 Host 任意本机网络访问或来源操作能力。

**在 Radar 组件中保留二维码登录：**不采用，因为已验证会话处于登录状态，且 Radar 来源状态通过允许的 MCP `check_login_status` 读取；登录动作不属于此只读功能。

**让 Renderer JavaScript 直接调用 MCP：**不采用，因为这会暴露本机服务地址，并使 UI 依赖 MCP transport 细节。

## Verification

Host adapter 与 Radar 组件聚焦测试验证固定产品调用、来源状态门禁和无二维码路径。构建与 assembled-artifact 检查验证 Renderer 不含 MCP endpoint。实时核验包括 loopback 监听、MCP 登录状态和一次 Codex 搜索；Workbench 搜索、详情、评论与正式 Desktop 视觉仍须由正式桌面成功观察后才能确认。

## Consequences

现有本机客户端继续使用无认证 MCP 连接，同时监听范围收紧到 loopback。Radar Host 不管理 token，但同一用户下的任何本机进程仍可连接 MCP；loopback 绑定不是进程级认证。未来启用认证时必须协调迁移所有本机客户端。
