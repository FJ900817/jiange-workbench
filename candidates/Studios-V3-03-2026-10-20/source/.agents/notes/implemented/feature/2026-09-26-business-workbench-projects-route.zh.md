# Agent Note: 将 Business Projects 与 Harness Workspace 导航分离

Status: implemented

[English](2026-09-26-business-workbench-projects-route.md) | 中文

## 问题

Business Workbench 需要一个真实的 Projects 页面，同时不能改变 Harness Session、Runtime Workspace 或输入栏行为。把 Business Workspace 只当作 Mascot 身份选择，无法提供独立页面；替换会话树又可能丢失当前 Session 与输入状态。

## 决策

- 五个 Business Workspace 身份继续作为侧栏路由，展开侧栏时常驻显示名称。
- 现有会话外壳作为 Command 路由；切换到其他 Business Workspace 时，会话子树继续挂载。
- Projects 列表和项目详情作为会话根节点内的独立 UI 页面；示例数据放入 UI Fixture 模块，不写入 Runtime 持久化。
- Work 显示 Fixture 驱动的工作生命周期列表和本地详情审核状态；样例存放在 `work-fixtures.ts`，不会创建 Runtime Job 或 Approval。
- Work 列表按标题、中文当前节点、辅助 Project／更新时间排列；英文系统节点名低于中文业务文案。详情将相关产物放入主内容，并把最近动态作为次级信息。
- Studios 提供由 Fixture 驱动的 Image Studio UI 路由和只读 Cover Studio 原型；Video Studio 尚未开放。
- Radar 提供由 Fixture 驱动的信号列表与详情路由；原始来源/Evidence、AI 摘要和分析分区呈现，Evidence、项目关联与 Work 操作只更新组件本地状态。
- Studio 候选生成与确认只保存在组件本地状态。候选元数据包括项目、Work、页面、槽位、模型、Prompt、尺寸、时间和确认状态；不会调用 Provider、创建 Runtime Job 或正式 Artifact，也不会运行 Renderer。
- Harness 原生 Workspace 与 Session 浏览器继续挂载，但只在 Command 路由显示；展开状态下的“更多能力”不依赖 Session 是否为空。
- Library 与 Settings 同处低权重页脚区域，点击 Library 显示本地尚未开放提示。

## 曾考虑的替代方案

- **路由切换时替换会话树**：否决，因为卸载会话树会丢失内存中的输入子树，也可能干扰当前 Session 展示。
- **现在加入 Runtime Project Registry**：否决，因为本阶段只验证 Desktop 交互与页面架构，使用 Fixture，不授权修改业务数据模型。
- **将 Work 接入 Runtime Job 或呈现为通用待办清单**：否决，因为本阶段使用隔离样例验证生命周期 UI；Work 需要显示业务当前节点和下一位处理者，但本轮不接入 Runtime 或 Approval。
- **现在将 Image Studio 候选操作接入图片 Provider**：否决，因为本阶段只验证 Studio 页面和本地选择流程；真实生成与正式素材持久化不在范围内。
- **五个入口仍只切换身份外观**：否决，因为 Projects 必须发生真实主页面切换，而不能只改变 Hero。

- **现在将 Radar 接入 MCP、网页搜索或持久化 Evidence/Work 注册表**：否决，因为本阶段只用本地示例验证“来源→证据→项目/工作”的操作路径。

## 后果

当前 UI 可以演示 Projects、Work、Studios 与 Radar 页面；项目记录、Work 生命周期、Studio 素材候选和产物元数据、Radar 信号、Evidence 状态、项目关联、演示 Work、活动记录、审核选择及 Workspace 绑定仍是示例 Fixture。Work 审核、Studio 素材确认和 Radar 操作只保存在组件本地状态；Radar 演示 Work 不会追加到 Work Fixture 列表。Radar 将原始来源/Evidence、AI 摘要和分析分开显示，但不抓取来源，也不创建持久化 Evidence、Project 或 Work 记录。Cover Studio 展示冻结的 Editorial 模板和 Renderer 认证状态，但不会启动渲染、注入素材或创建正式 Artifact。Command 之外隐藏原生浏览器但保持其挂载，因此业务空间不会暴露 Session 控件，也不会因切换而卸载浏览器状态。Library 仍是本地占位入口，Business Workspace 路由选择也不会持久化。
