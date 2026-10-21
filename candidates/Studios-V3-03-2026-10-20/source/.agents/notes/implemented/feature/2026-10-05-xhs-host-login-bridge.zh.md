# Agent Note：由 Host 代理的小红书登录

Status: implemented

[English](2026-10-05-xhs-host-login-bridge.md) | 中文

## Problem

小红书 MCP 登录端点需要本机 bearer 凭据并返回身份认证二维码，因此浏览器组件不能直接调用 MCP 服务或保留凭据。

## Decision

`business-workbench` 提供两个固定 Host Remote，分别读取登录状态与获取二维码。Host 读取共享的所有者私有文件 `DSH_HOME/secrets/xhs-mcp-token`，并拒绝非普通文件、符号链接、非当前所有者文件或权限不是 `0600` 的文件。状态 Remote 只返回登录布尔值；二维码 Remote 只接受有大小上限的内联 PNG 与过期时间。Client 没有通用 MCP 或 HTTP 代理，并且只在组件内存中保留二维码。

二维码显示期间，Radar 每 15 秒读取一次登录状态。固定上游实现会为每次状态检查创建浏览器，因此此前建议的 3 秒轮询会重复启动浏览器任务。Client 取消会清除二维码并停止轮询，但由于上游没有取消端点，不能取消服务端最长四分钟的二维码浏览器会话。

LaunchAgent 配置和凭据尚未应用。本机 wrapper 和 loopback 绑定属于单独的授权部署步骤。

## Alternatives considered

**Renderer 直接访问 MCP HTTP**——拒绝，因为这会把 bearer token 与本地服务端口暴露给浏览器代码，而且 MCP 工具还包含批准范围之外的操作。

**通过 MCP 工具端点获取二维码和状态**——拒绝，因为 REST 登录端点能返回 Host 可校验的受限投影，无须暴露通用工具调用。

**每三秒检查状态**——拒绝，因为固定上游实现会为每次状态检查创建浏览器和页面；15 秒间隔减少重复浏览器启动，同时仍提供有界的登录反馈。

## Consequences

Host 负责凭据访问和响应字段过滤，UI 可以显示二维码而不写入磁盘或浏览器存储。用户取消 UI 后，上游二维码浏览器可能继续运行直到四分钟超时；登录成功提示最多延迟一个轮询间隔。应用 LaunchAgent 仍需 wrapper 并重启 MCP；加载新的 Remote 可能还需要重新加载 Host Runtime。
