# Agent Note: AIHOT 证据分析协议

Status: implemented

English | [中文](2026-10-17-aihot-evidence-analysis-protocol.md)

## Problem

AIHOT 公共 Item 和 Story 在进入结构化模型分析前，需要转换为有界且可追溯来源的数据表示，避免混淆官方事实、弱关联和模型推断。

## Decision

`business-workbench/src/aihot-evidence-analysis.ts` 接收 A3-02 标准化后的 Item 与 Story，数据包最多包含各一条记录及五条报道，保留字段级 API 来源，分别保存 Item 与 Story 统计值；只有当输入记录中存在对应的报道 ID 或完全相同的原文 URL 时，才接受已确认关联。可能关联和来源冲突会保留为未核实信息。文本和 UTF-8 总输入大小均有上限。

`AihotAnalysisRunner` 通过 `HarnessRestrictedAgentRuntime` 创建独立且持久化的 Agent Session，并提交完整 Evidence Pack 快照；它不复用当前 Session，不包含环境历史，也不提供工具。Runner 要求 `SessionPersistence` 已挂载；标准 `session-checkpoint-policy` 会在 Provider 请求发出前写入完整请求前缀。request header 记录实际系统指令和模型路由，user message 记录序列化任务与 Evidence Pack，Session 还记录模型响应及回合结果。调用方取消与超时均使用 Agent 原生取消机制，因此 `turn/end` 会区分取消与 Provider 失败。Runner 使用 A3-03 校验器验证响应，并只返回白名单错误类别。

Session 日志包含模型可见输入、响应片段和回合结果。结构化校验结论可以从已保存的响应和 Evidence Pack 确定性重算，但不会另存为独立 Session 事件。本阶段不新增 Remote、UI 或自动调用方，也未执行真实 Provider 请求。

## Alternatives considered

- **绕过 Session 调用 `ctx.llm.stream()`**——不采用，因为模型可见输入必须能从 Session 日志重建；现有小红书限定例外不自动授权另一条无状态路径。
- **复用当前 Session**——不采用，因为这会把公开 AIHOT 证据与私人对话历史混合，并造成错误归属。
- **新增 Remote、Agent 框架或持久化层**——不采用，因为现有 Agent Registry、Session 日志和配置中的持久化能力已提供执行路径；内部 Runner 尚未连接产品调用方。

## Consequences

无需 Provider 凭据、网络请求或用户数据，即可测试证据协议和 Session 重放路径。真实 AIHOT 公共记录可在本地打包；fixture 模型测试验证请求输入和输出可在 Session 重载后恢复。当前未执行真实 Provider 请求或 Desktop 验收。真实调用会使用既有配置中的 Provider，可能产生常规用量费用，须经用户明确确认后再执行。
