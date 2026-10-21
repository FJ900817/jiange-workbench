# Agent Note: Host-mediated local AIHOT read projection

Status: proposed

[English](2026-10-03-host-mediated-local-aihot-read-projection.md) | 中文

## 问题

Radar 需要读取本地持久化的 AIHOT Article 与 Analysis，同时不能把本地服务凭据交给浏览器，也不能让 Workbench 依赖 AIHOT PostgreSQL 表。公共 AIHOT 热点与用户本地情报是不同来源；任一来源不可用时仍须保持可区分。

## 提案

Workbench Host 通过 loopback 调用 AIHOT 私有 list/detail API。AIHOT 使用独立的 `WORKBENCH_READ_TOKEN` 鉴权，返回有界 Article/Analysis 投影，并在只读事务中执行每次查询。Host 从凭据提供方读取 token，校验响应，再通过 Business Workbench Remote 只返回投影字段。浏览器既收不到 token，也不会获得数据库连接。Radar 将本地情报与公共热点放在独立区域；本地读取失败时显示不可用状态，绝不使用公共数据替代。

投影包含已持久化的来源、文章、处理与最新分析字段。未持久化的字段保持 null。本地 API 只接受 GET，不授予 CORS 访问权，也不返回 prompt、provider response 或凭据数据。

需要 session JSON 类型的 Client 安全契约应从 `@deepseek-ai/dsh-session/types` 导入，而不是 Host 根入口：根入口将 `Context.sessions` 声明为 `SessionStore`，浏览器插件消费的则是不同的 `ISessions` 面。

## 备选方案

**让浏览器调用 AIHOT loopback API。** 这会把 bearer credential 暴露给 WebView 代码，或要求浏览器持有 secret，因此违反凭据所有权要求。

**让 Workbench Host 直接连接 AIHOT PostgreSQL。** 这会令 Workbench 与 AIHOT 表结构耦合，并把访问范围扩大到只读投影之外。

**把本地数据并入公共 AIHOT adapter。** 本地 Article 与公共热点聚合具有不同的来源证明和可用性；合并会使来源回退和状态含义变得含混。

## 验收标准

- AIHOT list/detail endpoint 要求独立 bearer token，只接受 GET，并对尚无持久值的字段返回 null。
- 每个投影查询都使用 PostgreSQL 只读事务，不改变 Article、Analysis、receipt、source cursor 或 fetch 状态。
- Host adapter 从 Host 凭据提供方取得 token，只将其发送到 loopback API，校验响应，并在凭据、传输或 schema 失败时返回统一不可用结果。
- Radar 保持本地情报与公共热点分离，绝不以公共数据作为本地回退。
- 在替换本地 API/Web 服务之前，生产构建、聚焦测试、secret scan、本地真实数据库读取验证和正式 Desktop 视觉验收均通过。

## 风险

loopback URL 指向 Harness Host 进程可访问的服务，并要求 AIHOT Web proxy 继续只绑定本机。部署必须避免 token 进入浏览器 bundle、报告、URL、日志或非 API 容器。如果 Host 构建失败或 Desktop 装载旧 bundle，即使 AIHOT API 可用也无法通过视觉验收；两端未通过前不得替换服务。
