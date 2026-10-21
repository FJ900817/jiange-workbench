# Agent Note: Radar 人工判断与 AIHOT 分析分开保存

Status: implemented

[English](2026-10-04-radar-human-review-separate-from-aihot-analysis.md) | 中文

## Problem

Workbench 用户需要保留、标记待定或丢弃 AIHOT 文章，但不能因此改写 AIHOT 系统自己的分析或筛选结果。

## Decision

Workbench 人工判断存储在 `workbench_human_reviews`，以 Article 为唯一键，并包含可空的 Analysis 引用、判断、原因、备注和时间戳。`KEEP`、`MAYBE`、`DROP` 与 AIHOT 的评分、筛选、摘要和预筛选字段分开保存。Workbench Host 使用独立服务端凭据 `WORKBENCH_REVIEW_TOKEN` 代理人工判断读写；浏览器不会收到该凭据。私有 API 不可用时，客户端可以显示上次成功读取的判断投影作为过期数据，但必须禁用写入，直到读取成功并恢复数据。

## Alternatives considered

**把判断存入 AIHOT Analysis。** 拒绝，因为人工判断会覆盖或混淆系统生成的分析和筛选结果。

**把私有写入凭据暴露给浏览器。** 拒绝，因为浏览器存储和请求会扩大 Host 专用凭据的暴露范围。

## Consequences

AIHOT Analysis 保持独立可审计；每篇 Article 最多只有一条当前 Workbench 判断。人工判断写入需要独立凭据，并通过 Host 调用 API。离线时仍可查看过期判断，但必须等待私有 API 恢复后才能修改。

## Verification

API 路由、迁移、Host 和 Radar 测试覆盖创建、读取、更新、幂等、无效及未授权请求、离线禁用写入，以及与 AIHOT Analysis 分离。正式 Desktop 验证了 Albertsons 预置判断、列表筛选、详情投影、离线状态和恢复。对其他真实文章改写判断仍是明确的人工操作。
