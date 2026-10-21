# Agent Note: Aipoju private Desktop IPC

Status: implemented

[English](2026-10-12-aipoju-private-desktop-ipc.md) | 中文

## Problem

需要从 macOS Desktop Host 调用已认证的 Breakout CLI，同时不能把仅 loopback 的 Typert `/api` 载体变成未认证数据入口，也不能向 Renderer 暴露凭据材料。

## Decision

macOS Shell 只接受可信主 WebKit Frame 在精确来源 `http://127.0.0.1:3080` 发出的 Aipoju 消息。每次 App 启动都会生成新的随机令牌和本次启动专属 Socket 路径。令牌只保留在原生 Shell 内存和 Host 启动环境中；普通 Command 子进程不会收到令牌环境变量。Host 在 Workbench 服务初始化时消费并删除这两个启动环境变量。Renderer 消息只包含请求 ID、封闭操作名和受限参数。

Host 在 `~/Library/Application Support/DeepSeek Harness/aipoju-ipc/` 下绑定 Unix Socket，使用 32 位十六进制随机文件名以满足 macOS `sockaddr_un.sun_path` 路径长度限制。目录由当前用户拥有且权限为 `0700`，每个 Socket 由当前用户拥有且权限为 `0600`。服务端每个连接只接受一条 JSON 请求，使用常量时间比较令牌、限制请求/响应大小，并在服务释放时移除 Socket。不提供 HTTP 路由或 Typert Remote。

唯一允许的操作为 `topic.list`、`topic.search` 和 `topic.detail`。Adapter 只把这些操作映射为固定参数数组，调用 `/Users/jane/.npm-global/bin/breakout`；使用 `shell: false`、固定环境变量白名单、单进程并发、20 秒截止时间以及 2 MiB stdout/stderr 总上限。返回值只包含经过挑选的主题字段；未知或写入操作和越界参数都会 fail closed。CLI 输出、用户正文和令牌不会写入日志。未来 UI 必须将返回正文作为文本渲染。

独立的[Host 一次性认证探针](2026-10-12-desktop-host-one-shot-cli-auth-probe.zh.md)仍是启动时诊断，不使用此持久只读通道。

## Alternatives considered

**增加 Aipoju Typert Remote 或 HTTP endpoint。** 否决。现有 loopback 载体没有可靠的调用者身份认证，仅检查 Origin/CORS 不能认证进程。

**把固定令牌写入 Renderer 或 Profile 配置。** 否决。页面代码可读取前端 bundle 和 Profile 数据，不能承载 Host 凭据。

**接受任意 CLI 参数或操作名。** 否决。这会把来源专用读取 Adapter 扩大为命令执行能力，并可能暴露 CLI 写入功能。

## Consequences

只有原生 Desktop Shell 能发起经过认证的私有通道，Host 只接受三种 Aipoju 读取操作。没有每次启动 Shell 秘密的 Web-only 和 Codex Host 进程不能使用该通道。真实认证列表、搜索和详情调用仍需部署原生 Shell，并由用户完成 Desktop 验收；代码夹具不能作为真实业务证据。

## Verification

Host 测试覆盖 Unix Socket 权限、缺失与伪造令牌、拒绝越权操作、无效参数、返回字段投影、固定 CLI 参数模板和单进程准入。Swift 策略测试拒绝子 Frame 及所有已测试的来源不匹配。首次正式启动暴露了 Socket 文件名过长问题；缩短后的 32 位十六进制文件名和 Host 路径长度校验已加入聚焦测试。正式列表、搜索和详情验证仍待完成。
