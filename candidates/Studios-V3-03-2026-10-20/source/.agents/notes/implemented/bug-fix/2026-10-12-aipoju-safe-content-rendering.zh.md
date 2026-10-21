# Agent Note: Aipoju safe content rendering

Status: implemented

[English](2026-10-12-aipoju-safe-content-rendering.md) | 中文

## Problem

Breakout 主题正文可能包含 HTML 标记；Radar 必须在保持可读的同时避免执行不可信内容。

## Decision

Aipoju Renderer 将主题正文转换为纯文本，保留段落和换行，解码常见文本实体，并在 React 渲染前移除标记。图片来自单独投影的 `images` 字段，加载失败时显示中性占位。

## Alternatives considered

**净化后渲染来源 HTML。** 不采用，因为这会增加 HTML 执行面，而可读正文和图片展示不需要它。

**从正文标记中解析图片 URL。** 不采用，因为已观察到的主题详情会单独提供图片；Renderer 只接受 Host 投影的图片列表。

## Consequences

正文在不渲染来源标记的情况下保持可读，图片也不依赖正文格式。HTML 专属样式不会保留；不可用或加载失败的图片不会被伪造。

## Verification

Radar 公共页面测试覆盖 HTML 转纯文本、脚本与图片标记保持惰性，以及单独图片字段的显示。正式 Desktop 检查确认一篇真实主题图片通过投影图片列表成功加载，也确认另一篇真实主题正文中的 HTML 标签此前会作为文本显示。
