# Agent Note: Explicit XHS Comment Loading

Status: implemented

[English](2026-10-06-xhs-explicit-comment-loading.md) | 中文

## Problem

小红书默认详情响应可能不包含评论，即使笔记报告的评论数大于零，用户仍无法查看评论。

## Decision

Workbench 通过固定 MCP 工具读取默认详情。用户明确点击**加载评论**后，同一个产品级 Remote 才向固定 loopback 详情 API 发起请求；请求关闭回复展开，最多加载 10 条评论，并使用独立的 120 秒超时。Host 校验成功响应封装，从 `response.data.data.note` 读取笔记，从 `response.data.data.comments.list` 读取评论，并将 `userInfo` 映射为可空评论字段。空列表是成功结果；无效响应封装或 HTTP 请求失败才是错误。Client 区分零评论笔记、评论尚未加载的正数评论笔记、请求中、已返回评论和请求失败。

## Alternatives considered

- **每次读取笔记详情都加载评论**：这会让耗时较长的浏览器滚动成为普通详情阅读的一部分，即使用户只想看笔记本身。
- **将默认响应为空视为笔记无评论**：这会混淆“笔记确实没有评论”和“来源响应没有加载评论”。
- **向 Client 暴露通用来源请求**：这会让 Renderer 能选择本地 endpoint 或固定产品方法之外的请求选项。

## Consequences

打开笔记不会触发评论滚动；有界评论请求必须由用户操作触发。UI 最多显示 10 条返回的一级评论，不要求来源展开回复。报告零评论的笔记显示空状态；评论数大于零但尚未加载时提供显式加载操作，并单独显示请求失败状态。

## Testing

Adapter 测试固定 endpoint、POST 请求体、120 秒超时、双层 `data` 响应封装、`comments.list` 映射、空列表成功、可选字段空值与来源专用字段隔离。Client 测试验证只有用户点击加载操作后才发出显式请求，并验证返回的评论正文、作者和点赞数会显示。
