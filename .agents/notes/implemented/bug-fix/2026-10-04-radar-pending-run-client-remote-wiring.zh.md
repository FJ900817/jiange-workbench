# Agent Note: Radar Pending-Run Client Remote Wiring

Status: implemented

[English](2026-10-04-radar-pending-run-client-remote-wiring.md) | 中文

## Problem

Radar 待分析处理页面无法使用 Host 已认证的 pending-run Remote，因为 conversation Client 投影只传递了情报与人工判断方法。

## Decision

`ui-conversation` Client 投影通过现有 `localAIHOT` 回调转发 `processLocalAIHOTPending`、`readLocalAIHOTPendingRun` 和 `listLocalAIHOTPendingRuns`。每个回调在 Remote 成功时保留其结果，在 Remote 出错时映射为 `unavailable`。启动操作仍只能由 UI 在用户明确确认后调用。

## Alternatives considered

- **让 Web Client 直接调用 Process API**：这会把 process credential 暴露给浏览器，并绕过现有 Host credential provider。
- **继续让 pending-run 控件不可用**：这虽然保留只读界面，但 Radar 将无法使用已经部署的 Host 操作。

## Consequences

Radar 可以读取 pending-run 历史与详情，也可以仅提交用户明确确认的请求。Client 不会收到 process credential。集成测试固定了三个回调路径；正式验收仍须停在确认框的开始按钮之前。

## Testing

`apply-inject.client.spec.tsx` 使用模拟 Host Remote 验证 Client 回调投影。Radar Surface 测试继续验证选择与确认行为，不调用正式 Process API。
