# Agent Note: Project Context Long-Field Disclosure

Status: implemented

[English](2026-10-01-project-context-long-field-disclosure.md) | 中文

## Problem

只读 Project 投影中的来源标识和校验值可能超过详情列宽，并挤压 Review 状态的视觉层级。

## Decision

Project detail 在常规视图中显示短标识，并将完整来源标识、相对来源路径和哈希值放入原生折叠详情。Review 与 Validation 状态保持一级信息；来源 Job 和 Artifact 标识作为次级信息。Project Context 侧栏只保留投影 identity、Project ID 尚未建立的说明、Workspace 未绑定说明和轻量跳转入口。

## Alternatives considered

- **在常规视图中换行显示所有标识**：完整值始终可见，但工程元数据会压过业务状态，并拉长每一行。
- **从页面移除标识和哈希**：可降低视觉密度，但会丢弃检查真实来源所需的信息。
- **为 UI 持久化第二份格式化投影**：当短显示值可以从现有投影直接计算时，这会增加并行真值副本。

## Consequences

常规视图保持在详情网格内，并优先展示 Review / Validation 结果。完整来源值仍可查看，且不改变 Host 投影或业务数据。用户需要展开详情才能检查完整来源信息。

## Testing

Project 页面测试验证精简状态和 Project Context，并展开详情确认完整 Artifact ID、Job ID 和来源路径仍可查看。
