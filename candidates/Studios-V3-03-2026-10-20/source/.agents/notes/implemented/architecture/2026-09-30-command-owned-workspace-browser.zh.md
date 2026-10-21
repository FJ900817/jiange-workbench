# Agent Note: Command owns the Workspace and Session browser entry

[English](2026-09-30-command-owned-workspace-browser.md) | 中文

Status: implemented

## Problem

全局侧栏在每个 Business Workspace 路由旁都展示原生 Workspace 与 Session 浏览器，但这些控件属于 Command。Projects、Work、Studios 与 Radar 因而继承了 Command 专属上下文。

## Decision

侧栏只负责全局导航、新会话和共享页脚操作。`ui-workspace` 将现有浏览器注册到 Command 的 `conversation.command.workspaceBrowser` slot，由 Command 快捷区按需打开。浏览器继续使用原有 store、Host 数据与操作；迁移不会创建第二套 Workspace 或 Session 模型。

Command 快捷区通过既有 `data-dsh-taskboard-entry`、`data-dsh-ssh-entry` 与 `data-dsh-skill-explorer-entry` 按钮触发原插件控制器。侧栏 CSS 隐藏这些插件注入的旧入口行，不卸载插件或复制其面板；插件未加载时 Command 会提示当前不可用。

展开态 Workspace 行保留 44px 身份点击目标，Mascot 本体调整为 40px，行高为 56px，列表间隔为 10px。折叠 Rail 的图形与点击目标保持不变。

## Alternatives considered

**保留浏览器并在非 Command 路由隐藏：**不采用，因为 Command 专属导航仍占据全局 Shell，也使各路由的侧栏上下文更复杂。

**在 Command 中创建第二个浏览器：**不采用，因为这会重复 Workspace 与 Session 视图状态，并可能与 Host 数据脱节。

## Consequences

Projects、Work、Studios 与 Radar 不再通过全局侧栏显示 Command 的 Workspace／Session 浏览器。Command 在按需打开的对话框中呈现同一个浏览器，保留原有数据与控件。任务看板、SSH 和技能快捷区调用原插件侧栏按钮，不创建第二套界面或状态。展开态侧栏的 Workspace 区域更高、行距更松；折叠 Rail 保持原有几何。

## Testing

Sidebar 测试确认全局外壳不再渲染 Command 辅助入口或 Workspace 浏览器 slot。Conversation 测试确认 Command 快捷控件和浏览器对话框；Workspace 与目录选择器测试固定新 slot 注册及共享选择流程。
