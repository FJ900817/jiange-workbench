# @deepseek-ai/dsh-client-ui-sidebar

[English](README.md) | 中文

侧边栏外壳插件：负责可替换品牌 slot、新会话、Business Workspace 一级路由、布局持有的折叠控件，以及固定在底部的 Library 与 Settings 入口。全局侧栏不再展示 Workspace／Session 浏览器或 Command 辅助入口；Command 通过自己的快捷区域按需打开原浏览器。[ui-workspace](../ui-workspace/README.zh.md) 持有浏览器及其数据与视图状态。折叠到布局拥有的 76px 操作轨道仍属于本地呈现行为。约定：[slot 系统标准](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.zh.md)。

侧栏始终把 Command、Projects、Work、Studios 与 Radar 显示为 Business Workspace 一级路由；展开时名称常驻，44px 点击目标内的 Mascot 本体为 40px。Workspace 行高 56px，列表间隔 10px。当前路由仍使用浅色身份底和左侧身份色条。五种身份色直接定义在身份样式中，不使用 CSS 滤镜。Command 是默认路由并保留原生会话外壳；Projects、Work、Studios 与 Radar 显示各自页面。收起态采用独立的 76px 操作轨道，每个身份的紧凑徽记仍在原 44px 点击目标内。Command 快捷区打开同一个 Workspace／Session 浏览器，不创建第二套状态。Library、可选页脚操作、系统更新状态座、Settings 与原生 Voice 启动器继续共享页脚栅格；Voice 保持现有原生处理器。原生更新器把现有状态按钮锚定到系统状态座；候选失败仍可查看，点击后会打开原有详情面板。Business Workspace 路由与 Runtime Workspace、Session 选择互相独立。当前 Grok 派生 SVG 未取得明确复用许可，不能视为已获准的软件包发布或商业再分发资产。

品牌通过四个独立 single slot 呈现：`sidebar.brand.mark`、`sidebar.brand.name`、`sidebar.brand.glyph` 与 `sidebar.brand.short-name`。展开字标和收起态 glyph 可以使用不同图形与文案。外壳 fallback 是中性几何标记，以及临时的 `Business Workbench`／`Workbench` 名称组合。`ui-brand-official` 不占用这些 slot，因此主界面不展示 Harness 品牌；应用身份、Bundle ID、CLI、Runtime 与仓库均未改变。部署包可单独替换各呈现值，而不必替换 New Session 控件或轨道几何；声明感知的 `slots.inject()` 支持任意激活顺序。

New Session 会启动运行时的页面局部前端 Session Intent。运行时优先使用作用域操作明确指定的 Workspace，否则使用当前 Session 所属 Workspace，再否则使用最近活跃 Workspace；一个 Workspace 都没有时则清空选择，进入空白 New Session 页面。Workspace 专属控件与共享选择器由 ui-workspace 持有。

`SidebarRootComponentProps` 组合布局 owner share、全局 Session／Workspace 钩子、品牌与 Settings slot、可选页脚操作，以及注入的 `startSession` 与侧边栏切换回调。Business Workspace 路由不由 Session 状态推导，也不会创建 Runtime Workspace。这里没有插件 store。

实时收起时，外壳会把展开内容固定在当前宽度并用 150ms 淡出，然后切换到独立布局的 76px 操作轨道。收起态保持五个身份入口的原紧凑构图与 44px 点击目标。页面初始即为收起状态时会静态渲染轨道；减少动态效果模式会禁用轨道进入动画。

栏内的滚动条是一种指针可供性：只要指针不在栏内，外壳就把 ui-theme 的[滚动条间接层](../ui-theme/README.zh.md)重新绑定为 `transparent`；指针离开后滑块再保留 2 秒，因此没人指向的列表不会带着滚动条。避免行位移的空间预留属于滚动区域本身（[ui-workspace](../ui-workspace/README.zh.md)），所以显示滑块不会引起重排。

页脚包含 `sidebar.settings`、可选的 `sidebar.footer.action` 列表，以及供原生 Voice 与更新器控件使用的稳定 DOM 锚点。Voice 座位始终挂载，并在展开态隐藏，因此 macOS 桥接层可在收起标记变化后立即移动唯一的启动器；座位暂缺时不会退回到展开态 Settings 坐标。内容区高度低于 920px 时，收起轨道仍完整显示五个 Workspace 点击目标、Library、System Status、Settings 与 Voice；次级侧栏快捷入口和可选页脚操作暂时收起，展开侧栏后仍可访问。900 × 640pt 的原生窗口最小尺寸已使用此紧凑高度布局验证。侧边栏只共享栏状态（`wide`）；ui-settings 注册 Settings 触发行和面板，macOS 桥接层依据状态锚点定位更新控件。

`/client` 导出表层只包含插件主体（`apply`／`inject`）及约定类型；SidebarRoot、行组件和树派生仍由 slot 注册封装在包内。

## 模型体验

无。侧边栏渲染浏览器会话列表；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；该包（package）既不组装也不发送提供方请求。

## 已知限制与暂缓事项

- **Session 状态点渲染由 [ui-workspace](../ui-workspace/README.zh.md) 持有**：没有可用的 done/error 通知数据源。
- **Workspace 浏览行为由组合持有**：分组、排序、搜索与行状态都属于 [ui-workspace](../ui-workspace/README.zh.md)，不属于此外壳。
- **「New task completed」未读标记是本地查看状态**：完成时间 > 上次查看时间这一事实永远不会到达宿主。
