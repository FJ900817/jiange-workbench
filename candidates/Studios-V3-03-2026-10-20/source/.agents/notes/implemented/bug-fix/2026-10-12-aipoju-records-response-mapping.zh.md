# Agent Note: Aipoju records response mapping

Status: implemented

[English](2026-10-12-aipoju-records-response-mapping.md) | 中文

## Problem

已认证的 Breakout CLI 返回了合法主题列表 JSON，但 Adapter 未识别真实列表字段，导致 Radar 将响应视为无效。

## Decision

Adapter 从已观察到的 `records` 字段读取列表，并严格校验必要主题 ID，同时允许空标题和缺失的可选字段。它将已观察到的来源链接、作者、图片和互动数字段映射到现有主题投影。进程、超时、输出上限、JSON 解析和 schema 映射错误使用不同的安全错误码；临时结构诊断不属于 Host 响应或 Renderer UI。

## Alternatives considered

**递归接受响应中任意数组。** 否决，因为响应可能包含无关数组；列表提取使用已观察到的命名 `records` 字段和现有已知列表包装。

**将每个缺失来源字段都视为无效主题。** 否决，因为作者、图片和互动数是可选信息；只要求主题 ID 有效且标题字段为字符串，标题可以为空。

**在私有桥中保留结构诊断。** 否决，因为真实结构已从正式 Desktop 请求中确认；已发布的桥只需返回规范主题数据和安全错误码。

## Consequences

已验证的分页响应现在可以进入最新主题和关键词结果，且不改变 CLI 调用或私有 IPC 协议。未来来源 schema 变化仍返回 `SCHEMA_MAPPING_ERROR`，不会暴露原始输出或编造字段。

## Verification

正式 Desktop Host 返回退出码 0、合法 object JSON，列表位于 `$.records`；旧 Adapter 在主题规范化前的列表提取阶段失败。映射 `records` 后，正式 Desktop 加载了真实最新主题，并完成了真实的 `AI工作流` 搜索。聚焦测试覆盖已观察的包装结构、可选字段、空标题、安全投影及彼此区分的进程/超时/输出上限/解析/schema 错误。
