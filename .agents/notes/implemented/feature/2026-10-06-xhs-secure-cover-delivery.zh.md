# Agent Note: Host-mediated Xiaohongshu cover delivery

[English](2026-10-06-xhs-secure-cover-delivery.md) | 中文

Status: implemented

## Problem

小红书封面 URL 使用 HTTP，macOS App Transport Security 会阻止 WKWebView 加载这些图片。把带签名的来源 URL 返回给 Renderer，也会让 Host 以外的 Client 接触来源请求材料。

## Decision

Business Workbench Host 在映射 feed 或详情时，为每个符合条件的搜索封面或详情图片 URL 注册随机、仅当前进程有效的引用。Client 只收到引用并请求 `getXhsCoverAsset`，不能提交 URL。Host 只接受精确主机名 `sns-webpic-qc.xhscdn.com`、`sns-img-qc.xhscdn.com`、`sns-img-hw.xhscdn.com`、`sns-img-bd.xhscdn.com` 与 `sns-img-qn.xhscdn.com` 上的 HTTP 或 HTTPS URL，拒绝凭据和非默认端口，并在跟随每次重定向前重新验证目标；重定向必须留在原始主机。Host 仅发送图片 `Accept` header，并禁用凭据；从排队、重定向到读取响应正文全程共用 10 秒期限，拒绝超过 2 MiB 的正文，只接受 JPEG、PNG、WebP 和 AVIF。

成功字节保留在最多 50 项的进程内 LRU 缓存中。失败请求不缓存，并发重复请求共用一次获取；Host 信号量将图片下载并发限制为 4。Remote 只返回允许的 MIME type、Base64 图片字节、不透明缓存键和缓存命中状态，不返回来源 URL。Renderer 创建 Blob URL，并在 payload 变更或图片组件卸载时释放。引用缺失或获取被拒绝时显示中性占位，不显示破图图标。搜索封面使用固定 3:4 比例和 `object-fit: contain`；详情图片保持原始比例。

## Alternatives considered

**让 Renderer 加载来源 URL。** 不采用，因为 WKWebView 会阻止 HTTP 封面，而且完整签名 URL 会进入 Client 内存。

**增加通用 URL 图片代理。** 不采用，因为任意 URL 会创建不必要的网络获取能力并扩大 SSRF 攻击面。

**修改 ATS 或把 HTTP 改写成 HTTPS。** 不采用，因为已观察到的 CDN 不支持对同一签名封面使用 HTTPS，且全局传输例外会削弱其他 WebView 请求。

## Consequences

图片引用只在映射 feed 或详情的 Host 进程中有效；Host 重启后，旧引用会降级为中性占位图。由于现有 Remote 传输结构化 JSON 兼容值，图片字节使用 Base64 返回。2 MiB 限制约束单次获取，50 项 LRU 限制缓存条目数而非缓存总字节数。未列入精确白名单的来源图片主机保持不可用，不扩大取图策略。

## Testing

Host 测试覆盖域名白名单与本机地址拒绝、重定向复验、内容类型、声明长度与流式正文大小限制、超时预算、凭据省略、缓存复用和最多 4 个并发请求。Client 测试验证 Blob URL 渲染、中性降级和 URL 释放。正式 Desktop 的真实封面验收仍属于部署验证。
