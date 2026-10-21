# Agent Note: 为 Business Workbench 侧栏提供独立操作轨道

Status: implemented

[English](2026-09-27-business-workbench-sidebar-responsive-states.md) | 中文

## 问题

收起侧栏时，仍需访问 Business Workspace 路由和 Command 原生浏览控件，不能只是压窄展开态内容。主界面产品品牌也必须能独立于 Harness 应用身份进行替换。

## 决策

- 布局使用宽度为 76px 的收起侧栏轨道。每个 44px 点击目标都包含独立的 36px 紧凑身份徽记，其中图形为 26px，状态点完整内嵌；收起态不是把展开图形缩小后直接放入轨道。名称在展开态常驻显示，在收起态通过 Tooltip 提供。
- Command 的原生 Workspace 与 Session 浏览器保持挂载，并可从轨道打开侧边浮层。浮层使用同一个浏览器实例，在点击外部、Escape、选择 Session 或离开 Command 时关闭。
- “更多能力”只属于 Command：展开时内联显示，收起时通过可关闭的浮层显示。
- 侧栏声明独立的 `sidebar.brand.mark`、`sidebar.brand.name`、`sidebar.brand.glyph` 与 `sidebar.brand.short-name` slot。Shell 提供中性的 `Business Workbench` 与 `Workbench` fallback。`ui-brand-official` 不占用产品品牌 slot；原生应用身份、Bundle ID、CLI、Runtime 与仓库名称保持不变。
- 页脚中的 Voice 座位始终挂载，并在展开态隐藏。macOS 桥接层在收起标记出现时把唯一的 Voice 启动器移入该座位；座位暂缺时不会退回展开态 Settings 坐标。
- macOS 主窗口通过 AppKit 将最小内容尺寸设为 900 × 640 pt。内容区高度低于 920px 时，收起轨道会隐藏次级侧栏快捷入口和可选页脚操作，以保留五个 Workspace 点击目标、Library、System Status、Settings 与 Voice；展开侧栏后可再次访问这些入口。
- 收起侧栏只改变布局呈现。AppFrame 保持 conversation slot 挂载，侧栏不修改 Session 或 Workspace 数据。

## 曾考虑的替代方案

- **保留 56px 轨道并压缩现有控件**：否决，因为空间不足以居中展示可识别的 Workspace 图形，同时为 Workspace、新建会话、浏览器、工具和页脚入口提供独立目标。
- **点击收起态的 Workspace 或 Session 控件后展开整栏**：否决，因为一次浏览操作会改变用户布局状态并打断当前内容上下文。
- **在浮层中再挂载一个浏览器实例**：否决，因为多个浏览器实例可能产生不同的本地搜索、分组和选择状态。
- **继续把 Harness 官方字标作为产品 fallback**：否决，因为产品品牌必须可以替换，而不重命名或重新配置 Desktop Shell 与 Runtime。

## 后果

收起轨道提供独立且有名称提示的 Workspace 与 Command 控件，同时保留单一原生浏览器实例和当前会话子树。侧边浮层会占用侧栏外部的屏幕空间，并支持键盘关闭。临时 Shell 品牌仅用于界面呈现，不改变应用标题、Bundle ID、Runtime、CLI 或持久化用户数据。页脚将 Library、可选原生控件、系统状态、Voice 与 Settings 对齐到同一居中工具栅格。唯一的 Voice 启动器在展开位置和持续挂载的收起态座位之间移动，并继续调用原有 `startListening` 处理器。候选更新失败由系统状态锚点上的现有原生控件表达；该控件打开原有详情与重试／日志入口，但不会自动重试或应用更新。原生窗口强制 900 × 640 pt 的最小尺寸；在短窗口中，次级侧栏入口让位于五个 Workspace 路由和持续可用的底部工具。
