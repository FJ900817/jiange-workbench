# Agent Note：AIHOT Radar 只读投影

Status: implemented

English | [中文](2026-10-01-aihot-radar-readonly-projection.md)

## Problem

Radar 需要建立第一条真实外部只读数据通路，同时避免 Harness 与 AIHOT 存储耦合，也避免把本地原型误认为实时记录。

## Decision

Radar 默认页面通过客户端只读 Adapter 读取 AIHOT 公共 API。Adapter 校验实际消费的响应字段，将一个公开 Story 映射成一个 Signal，并在用户打开详情时把 Story 报道映射为 Evidence。请求仅使用 GET，采用短时内存缓存；Fixture 必须显式选择，且不与实时结果混排。只有热点响应未提供 Story 链接时才使用 Item fallback；由于 Item schema 没有全局 Story 归属字段，界面只说明该响应未提供关联。

## Alternatives considered

- **读取 AIHOT PostgreSQL 或在本地部署其服务**：会跨越公共 API 接口并增加存储与运维耦合。
- **实时请求失败时改用 Fixture**：会让示例数据看起来像当前外部情报。
- **推断 Item 所属 Story**：公开响应没有足够证据支持该结论。

## Consequences

Radar 可以显示可追溯的公开 Story 投影，不需要服务端镜像、写入通路或生成式分析。本 PoC 通过 schema SHA 固定接口快照，但上游仓库 commit 未固定。本次实时热榜没有无 Story 关联样本，正式 Desktop 仍服务旧 Fixture 构建，因此视觉验收尚未完成。

## Testing

聚焦 Adapter 与页面测试覆盖 Story 去重、Evidence、Item fallback、offline、HTTP 503、无效 schema、超时、缓存，以及 Real / Fixture 隔离。包级 TypeScript 检查通过。正式 Desktop 实时数据视觉验收待完成。
