# Agent Note: XHS Radar Search REST Contract

Status: implemented

English | [中文](2026-10-05-xhs-radar-search-rest-contract.md)

## Problem

Host 搜索适配器调用 MCP `search_feeds` 工具并递归猜测响应列表路径，因此没有遵守 Xiaohongshu v2.5.0 HTTP 搜索约定。

## Decision

`searchXhsFeeds` 向固定 loopback `/api/v1/feeds/search` endpoint 发送 `{ keyword, filters: {} }`，只接受包含 `success: true`、`data.feeds` 与 `data.count` 的响应。对于非 2xx 响应，它只在内存中检查顶层 `code`、`error` 与 `details`，并将已识别的超时、浏览器、导航、连接和上游错误模式映射为封闭诊断码；浏览器/导航故障与明确识别的上游响应故障使用不同的 Client 安全码。原始响应文本不会进入日志或跨越 Remote。搜索使用独立的 75 秒请求超时；登录状态与详情使用 35 秒。笔记字段继续允许为 null；Host 诊断只记录 HTTP 状态、响应键名、成功标记、结果数与封闭错误类别。

## Alternatives considered

- **保留 MCP 搜索工具并扩大响应解析范围**：这会保留错误的传输约定，并继续接受上游 HTTP endpoint 未定义的响应布局。
- **让 Client 调用本机 HTTP endpoint**：这会把本机数据源访问与 endpoint 选择暴露给 Renderer，并绕过 Host 固定适配器。

## Consequences

搜索使用一个由 Host 固定的 HTTP 请求；登录状态和笔记详情继续通过原有 MCP 工具读取。75 秒超时为上游浏览器搜索预留其等待预算与响应开销；超时映射为现有 `search_timeout` 结果，不自动重试。ready 结果包含上游结果数；诊断不记录关键词、笔记标识、token、响应值或笔记正文。

## Testing

适配器测试固定 POST URL、方法、请求体、响应路径、结果数映射、可选字段处理、非约定响应拒绝、上游错误 envelope 的安全分类与不暴露 details 的超时处理。Client 测试验证浏览器故障安全码沿用现有搜索状态 UI。
