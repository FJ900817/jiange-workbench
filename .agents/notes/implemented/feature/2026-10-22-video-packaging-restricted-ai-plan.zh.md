# Agent Note: Video Packaging 受限 AI 方案入口（V3-03R）

Status: implemented

[English](2026-10-22-video-packaging-restricted-ai-plan.md) | 中文

## Problem

V3-03 的 Video Packaging 编辑器留了一个悬空的 AI 方案调用：客户端把
`/api/ai/plan` 分发给 `bridge.runPlan()`，但 Host 端从未实现这个 Remote，
`RunVideoPackagingPlanRequest` 类型也不存在。模型目录接口
（`listVideoPackagingAiModels`）只暴露自由文本 `status`，操作者无法判断一个
模型是已注册、已配置、可路由调用，还是被阻断——以及被什么具名原因阻断。
未来的模型调用需要一个有界、默认关闭的入口，其重试与费用边界必须在运行
前得到证明。

## Decision

Business Workbench 为 Video Packaging 拥有一个受限 AI 方案入口。
`requestVideoPackagingAiPlan` 接受冻结后的输入（已授权的视频引用、SRT/VTT
字幕、创作要求文本、素材库/自由模式、画布尺寸、已批准素材摘要），只返回
结构化的包装方案建议。模型绝不写工程、绝不渲染、绝不批量处理素材。本阶段
该入口恒以 `VIDEO_PACKAGING_AI_DISABLED` 拒绝；调用开关默认关闭，零
provider 请求发出。

模型就绪度是四级阶梯，不是自由文本状态：`registered`（注册表可见）→
`configured`（凭据 `describe()` 确认可用；绝不读取密钥明文）→ `routable`
（专用受限路由存在、已启用、且重试已证有界）→ `not-callable` 附具名原因
（`no-credential`、`route-disabled`、`retry-unbounded`、`unknown-provider`、
`unregistered`）。本阶段所有列出的模型均为 `not-callable` 附原因；这是诚实
的产品状态。

重试/费用举证由 `proveVideoPackagingRetryBounds` 完成，只读公开的
`ctx.llm.providerRetryPolicy(provider)`，并具名已检查的层
（`dsh-llm-retry`、direct-fetch adapter、restricted-agent 单 turn）。
`'always'` 重试策略是无界的，路由保持 not ready；无法检查的 provider
报告 `unknown`，绝不编造边界。

客户端 bridge 补上缺失的 `runPlan` 方法，接到新的 Host Remote；编辑器原来
悬空的调用现在会得到一个诚实的拒绝，而不是类型错误。本阶段无真实模型调
用、无 Desktop 部署、无任何凭证明文。

## Alternatives considered

- 保持 `runPlan` 悬空、V3-03R 只做 Host 端：拒绝，因为编辑器已经在调用它；
  未实现的 bridge 方法是潜在的运行时故障，不是干净的接缝。
- 就绪度用布尔值：拒绝，因为布尔值隐藏了模型不可运行的原因；操作者需要
  具名阻断项才能行动。
- 读取凭据来"验证"它：拒绝；`describe()` 在不触碰密钥的前提下确认可用性，
  这正是红线的意义。
- 用 fixture 模型启用路由：拒绝；真实入口后面挂 fixture 会让调用方误以为
  调用链已通。入口必须大声拒绝，直到真实、有界、用户授权的路由存在。

## Consequences

- 编辑器的 `/api/ai/plan` 路由现在到达真实的 Host Remote，收到结构化的
  `VIDEO_PACKAGING_AI_DISABLED` 拒绝；UI 可以展示具名原因而不是静默失败。
- `listVideoPackagingAiModels` 返回四级阶梯；在凭据、路由、重试举证齐备
  之前，所有模型均为 `not-callable`。
- 重试举证无需凭据、无需网络即可检查；无法检查的 provider 报告 `unknown`，
  绝不编造边界。
- 启用真实调用是独立的、需用户授权的阶段（P1）；本阶段按构造零 provider
  请求。
- 新增 Remote 后必须重新生成 Typert remote-client 类型（host 构建）；客户端
  对生成的命名空间做类型检查。
