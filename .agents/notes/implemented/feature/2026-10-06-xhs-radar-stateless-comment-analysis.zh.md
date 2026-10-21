# Agent Note: Stateless XHS Comment Analysis

Status: implemented

[English](2026-10-06-xhs-radar-stateless-comment-analysis.md) | 中文

## Problem

小红书 Radar 需要从用户选定笔记已加载的评论中提炼可供审核的需求结论，但受限 Agent 执行会创建持久化 Session，其中包含 Prompt 与 Response 事件。把外部用户评论保存在这些 Session 日志中，不符合本功能已批准的数据最小化要求。

## Decision

`analyzeXhsComments` 是仅适用于小红书 Radar V0.4 评论需求分析的限定例外。Host 直接调用现有 `ctx.llm.stream()`，并使用独立的 `business-workbench.commentAnalysis` 配置路由；Web Profile 将其固定为 `deepseek-official` / `deepseek-v4-flash`。每次请求还明确设置 `reasoningEffort=off` 和 `maxTokens=4096`；推理和最终文本共享有限输出上限，因此显式关闭推理可防止部署默认值在 JSON 答案生成前耗尽预算。理由和隔离 Provider 证据见[推理预算实验](../../../../docs/experiments/business-layer-v0.1-phase4c1t-reasoning-budget.zh.md)。它不会读取或回退到 Agent 默认选择。路由缺失、配置无效或注册表无此路由时，分别返回不含内容的专用错误码。它不创建 Agent 或 Session，也不传 `sessionId` 或 tools。模型请求只包含笔记标题、正文和最多十条非空评论文本，并为评论分配临时证据引用。Prompt 与 Host 校验均限制每类最多 3 条、总计最多 15 条、每条不超过 120 字。Host 在返回已清理结论和 Host 计算的可信度之前，会校验输出类别、结论长度和证据引用。

响应收集会追加 `text-delta`；仅对未产生非空文本增量的索引，才使用完成态文本 `block-end`。Reasoning、tool、usage 和 finish 事件不作为回答。正常结束但正文为空时返回 `EMPTY_RESPONSE`；Provider finish 错误报告该码时返回 `PROVIDER_EMPTY_RESPONSE`；max-token finish 和超大响应使用独立的 Provider 响应错误码；只有非空但无法解析的文本才返回 `ANALYSIS_PARSE_ERROR`。

原始评论、Prompt 和 Provider Response 只在请求期间留于内存。最多 50 项的进程内 LRU 以笔记身份和规范化文本的 SHA-256 fingerprint 为键，只保存已校验结论。本功能不会把评论正文、Prompt、原始 Response 或凭据写入 Session 日志、Workspace、文件或普通日志。失败时，Host 只返回并记录已配置路由、错误码、失败阶段、是否调用 `llm.stream()`、请求/响应可观测状态、HTTP 状态、耗时和 stream/响应计数；现有分析区域只展示这些字段，不显示模型原文或评论内容。评论文本仍会发送给已配置的模型提供方；无持久化保证仅针对 Harness 本地存储，不涵盖 Provider 侧处理。

此例外不会改变其他任何模型请求的 Session 可重建规则。

## Alternatives considered

**使用 `restrictedAgent`，并在调用后 dispose Session。** 不采用，因为 dispose 不会删除包含 Prompt 与 Response 的持久化 Session 事件日志。

**新增独立模型 SDK 或 Provider endpoint。** 不采用，因为这会重复管理路由与凭据，而不是复用 Harness 现有 Provider。

**把评论持久化到新的分析记录中。** 不采用，因为第一版只需要内存中的分析结果，也必须避免保留原始外部评论。

## Consequences

本功能可以在不创建 Session 历史的情况下分析单篇笔记，并在当前 Host 进程内缓存已校验结果。小红书专用路由独立于 Agent 默认值，且必须能在当前 Provider 注册表中解析。只有观察到 Provider HTTP 状态或 stream 事件时，请求才标记为 `confirmed`；未调用 `llm.stream()` 时为 `not_started`，其他情况为 `unknown`。Runtime 退出后缓存丢失是有意行为。操作说明必须告知用户：评论会发送给已配置的 Provider，即使 Harness 不会在本地持久化评论。证据引用仅对当前已加载评论集有效，Client 会将其解析回界面中显示的真实评论。
