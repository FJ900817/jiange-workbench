# Agent Note：SCYS Radar 使用 Host 管理的 OAuth 只读 Adapter

Status: implemented

[English](2026-10-07-scys-radar-host-oauth-read-adapter.md) | 中文

## 问题

Workbench 需要独立连接生财账号，同时不能复制 Codex 或 Obsidian 凭据、暴露完整 MCP 工具表，或允许 Renderer 控制工具调用。

## 决策

Business Workbench Host 负责 OAuth discovery、PKCE state、本机 loopback callback、打开浏览器、token 交换与刷新，以及进程内的认证 MCP Client。OAuth grant 通过现有 `workbench-scys` 凭据 scope 保存，由 credential router 路由到 macOS Keychain。Client 只收到来源状态和规范化记录。

已保存授权的重连使用客户端注册信息中的回调 URI，不使用新 URI，也不将其留空。MCP SDK 因而可以先刷新被拒绝的 Access Token，再重试 MCP 初始化；重连期间禁止打开浏览器授权或删除持久化凭据。若注册信息缺少可用的本机回调 URI，或刷新遭拒，Host 会报告需要重新授权，不会无限重试。

SCYS Adapter 只调用固定只读 allowlist 中的精确工具名，并为内容搜索/详情、项目搜索/详情以及用户主动加载评论提供固定产品方法。它不会将上游工具注册到全局工具表，也不接受 Client 传入工具名。每个列表均有数量上限，缺失来源字段保持 null，缺少内容 URL 时也保持 null。

文章搜索分别保留来源的卡片 ID、MCP `entityType`/`entityId` 和秒级发布时间。详情与评论只使用后两项身份字段；身份缺失或不受支持时，在调用工具前返回安全错误。`topicDetail` 保留响应外层，以读取作者、URL 和包含飞书正文的内容。

由于 Adapter 尚无已验证的最新内容查询，“今日生财”使用用户手动触发的 AI 主题采样；文案不会把采样称为最新内容流或全站榜单。四个来源区域仍处于现有 Radar 导航之内。

## 考虑过的方案

**复制 Codex 或 Obsidian 已有 grant。** 不采用，因为 Workbench 必须独立管理授权和撤销生命周期。

**已保存授权重连时省略回调 URI。** 不采用，因为当前安装的 MCP SDK 会将该 Provider 视作非交互式客户端，在没有授权码的情况下尝试授权码交换，而不是使用已保存的 Refresh Token。

**注册全部上游工具，或暴露 `invokeScys(toolName, args)`。** 不采用，因为两种设计都会使 Renderer 能访问产品明确只读集合之外的工具。

**把关键词搜索标为今日最新内容。** 不采用，因为此 Adapter 没有已验证的最新内容 API 或时间筛选能力。

## 结果

OAuth token 和客户端注册信息只保留在由 Keychain 路由的 Host 凭据记录中；Client、Session、Workspace、普通配置与日志都不会收到凭据值。Adapter 只读取上游工具列表，以定位被允许的操作并读取其输入字段声明。无法支持的参数 schema 会作为来源错误返回，不会切换调用其他工具。

已保存授权的重连失败最多包含 12 条不带 URL 的 Fetch 观测，记录分类后的请求阶段、可取得的响应状态，以及白名单错误元数据。SDK 错误位置只保留相对 SDK 的文件名和行号；请求 Header、Body、URL 和原始异常文本不会返回。

在调用 `connect()` 前，重连状态标明实际的凭据读取或记录解析阶段、授权记录缺失或不完整、回调 URI 检查以及 MCP 组件创建失败。Helper 报告的原生读取失败与凭据路由调用失败分别归类；仅返回白名单中的原生 OSStatus。这些分类描述实际失败操作，不会根据初始追踪阶段推断 Keychain 或已保存授权损坏。

每次重连只读取一次已保存 grant，形成该连接专属的内存快照；SDK 多次调用 `tokens()` 时复用该快照。刷新成功后先持久化新 Token，再更新快照；连接释放时清除快照。重连诊断保留回调次数，并有界记录凭据读取、记录解析、Token 映射、回调返回和 SDK 使用 Token 的结果。回调拒绝时保留失败点；诊断只包含安全错误类型和白名单错误码。

## 验证

聚焦 Adapter 与 Renderer 测试覆盖固定 allowlist、OAuth state 绑定、来源字段映射、嵌套空列表、缺失 URL、请求阶段观测，以及内容/详情/项目/评论 UI 流程。TypeScript 构建验证 Host 与 Client 类型。上述检查不能证明生产 OAuth 服务接受客户端注册，也不能证明真实内容读取成功；正式 Desktop OAuth 和只读验收仍需部署后验证。

## 相关记录

凭据路由使用的精确 `workbench-scys` scope 与 Keychain 路由定义于 [`credentials-router` package](../../../../packages/credentials/credentials-router/README.zh.md)。
