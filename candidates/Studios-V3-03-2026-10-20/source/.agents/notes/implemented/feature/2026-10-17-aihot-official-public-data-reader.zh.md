# Agent Note：AIHOT 官方公共数据读取器

Status: implemented

[English](2026-10-17-aihot-official-public-data-reader.md) | 中文

## Problem

Radar 的热点投影无法读取公共资讯档案、定期报告及精选同步页面；本地 Article/Analysis 数据库当前不可用，而且属于独立的用户数据来源。

## Decision

客户端包通过独立的只读读取器访问 AIHOT 官方 `/api/v1` 发布数据。读取器校验实际消费的字段，将资讯 Cursor 与规范化查询参数绑定，限制跨页读取次数，并把精选快照及增量查询保留为显式的有界操作，不自动建立镜像。它复用现有条件 GET 缓存、合并并发的相同请求，并按服务端 `Retry-After` 在等待期内阻止同一请求。它不修改本地 AIHOT Article、Analysis 或人工 Review 路径。正式 AI 情报中心通过 Radar 既有 AI 区域使用该读取器；首页、资讯库、报告索引回退及 Item 详情限制见 [AIHOT Radar 情报中心记录](2026-10-17-aihot-radar-intelligence-center.zh.md)。

## Alternatives considered

- **把公共记录并入本地 AIHOT 数据库路径** — 不采用，因为公共发布数据与私有 Article/Analysis 记录的归属、可用性和来源信息不同。
- **自动爬取或镜像整个精选档案** — 不采用，因为当前内部预览只需要有界读取，不需要后台采集或批量再分发。
- **同时接入 MCP、Skill 和 REST 采集** — 不采用，因为官方渠道的已发布数据重叠，本客户端无需重复同步。

## Consequences

公共资讯、Story 详情及定期报告可独立于本地数据库查询，并明确区分空结果、结构错误、HTTP 错误、超时、离线和限流。官方 Item 响应没有标签数组或独立 Item 详情路由，因此读取器不会补造标签、文章正文或本地分析。Radar 正式页面直接使用这些方法，无需新增公共代理；正式 Desktop 与视觉验收仍须区别于 Adapter 的实时读取检查。
