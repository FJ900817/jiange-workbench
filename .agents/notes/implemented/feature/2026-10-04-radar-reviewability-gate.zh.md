# Agent Note：Radar 可判断状态来自当前内容投影

Status: implemented

[English](2026-10-04-radar-reviewability-gate.md) | 中文

## Problem

此前，即使 Article 没有可用的当前 Analysis、用户也无法检查足够的已保存内容，页面仍会把它呈现成可提交人工判断的情报。

## Decision

AIHOT 私有投影负责判断可读状态和情报状态。只有最新 Analysis 与 Article 版本一致、相关性通过、摘要非空，且已保存正文或 Feed 摘录时，Article 才可人工判断。人工判断会把投影状态改为 `kept`、`maybe` 或 `dropped`，但不会让原本不完整的 Article 自动变为可判断。写入接口会在锁定 Article 行时重新检查同一组条件；条件不满足时返回 `ARTICLE_NOT_REVIEWABLE`。

列表只提供有长度上限的 Feed 摘录预览。详情提供有长度上限的正文或摘录以及已有持久化 Analysis 事实。投影不包含原始 HTML、Provider payload、prompt 或 receipt。

## Alternatives considered

**在 Radar 中根据“没有人工判断”推断可判断状态。** 拒绝，因为 UI 无法权威判断 Analysis 是否新鲜、相关性是否通过、摘要是否完整或是否有来源内容。

**允许用人工判断补足缺失分析。** 拒绝，因为人工标签应描述可检查的证据，不能替代证据。

## Consequences

Radar 可以区分待分析与待判断，并对不可判断的 Article 隐藏审核控件。详情页会明确标出可读内容是正文还是 Feed 摘录。已有 Article 和 Analysis 仅作为只读投影；本改动不会运行分析或修改来源内容。

## Verification

投影测试覆盖当前与过期 Analysis 版本、相关性通过/阻断、摘要是否存在、正文/摘录是否可用、列表/详情长度上限及判断状态投影。API 测试覆盖拒绝不可判断内容的写入。要把本改动判为完全验收，仍需正式 Desktop 验证和数据库计数不变核验。
