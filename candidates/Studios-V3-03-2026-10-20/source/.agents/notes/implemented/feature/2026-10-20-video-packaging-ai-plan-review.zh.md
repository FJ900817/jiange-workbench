# Agent Note：Video Packaging AI 方案审核

Status: implemented

[English](2026-10-20-video-packaging-ai-plan-review.md) | 中文

## 问题

Video Packaging 缺少从字幕证据到可编辑时间轴建议的受控流程。可见的模型选择器也可能让用户误以为任一已配置聊天路由都能安全分析视频内容。

## 决策

Host 从已注册的 LLM Provider 提供只读 Video Packaging 模型目录。返回 Provider/模型标识和名称；在专用 Video Packaging Agent 路由建立前，调用状态为不可用，认证状态为未检查。它不解析凭据值，也不复用小红书的 `restrictedAgent` 或 `commentAnalysis` 路由。Client 保持真实模型调用关闭。

编辑器接收 SRT/VTT 字幕证据，并将规则生成方案明确标记为 Fixture。素材库模式只检索已确认且具有明确复用许可的资产。自由创作模式只生成编辑器现有的标题、重点框和信息卡组件。方案在预览前会校验字幕证据、组件支持、方案 ID 唯一性、时间和画布边界。用户可以修改并选择方案；仅所选方案会被追加为新组件，不会替换现有内容。方案草稿及审核状态随包装工程保存。拒绝方案只更新审核元数据。

## 曾考虑的替代方案

**复用小红书 `restrictedAgent` 路由。** 拒绝，因为该路由服务另一种业务流程，其批准输入和指令不适用于视频包装。

**调用 `commentAnalysis` 或媒体生成模型。** 拒绝，因为它们都不是 Video Packaging 分析路由；媒体生成能力也不提供字幕编排语义。

**仅凭注册目录就把模型标记为可用。** 拒绝，因为 Provider/模型注册不能证明凭据、授权、专用执行路由或安全请求控制已就绪。

## 后果

用户可以查看当前注册的 Provider/模型元数据，并通过明确标记的 Fixture 完成方案审核到时间轴的流程。本功能不会发送真实模型请求。真实模型调用仍不可用，直到具备专用 Session-backed 路由、安全认证状态、有界输入输出控制和明确部署配置。

## 测试

聚焦测试覆盖空模型注册、方案校验、重复方案 ID 拒绝、选择性应用和既有时间轴组件保护。隔离候选执行 Host library 构建、Client contract 类型检查和 Client Bundle 构建。
