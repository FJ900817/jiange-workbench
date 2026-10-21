# Agent Note: Desktop Host 一次性 CLI 认证探针

Status: implemented

[English](2026-10-12-desktop-host-one-shot-cli-auth-probe.md) | 中文

## Problem

AI 破局俱乐部 CLI 已在用户 Terminal 中完成认证，但 macOS Desktop Host 使用不同的运行环境。现有 Workbench `/api` Typert Remote 通道没有身份认证，因此不能仅为检查环境差异而增加凭据探针 Remote。

## Decision

`BusinessWorkbenchService` 在 Host 初始化期间检查本地一次性标记。只有 Host 继承了已安装 DeepSeek Harness Shell 注入的精确 helper 路径、解析后的 Harness home 及其 `diagnostics` 目录属于当前用户，并且诊断目录未向组用户或其他用户开放任何权限时，才会执行探针。Host 会先原子重命名标记，再验证或执行；标记必须是当前用户所有、权限不向组用户或其他用户开放的空文件。

Host 使用参数数组 `['capabilities']`、`shell: false` 启动固定路径 `/Users/jane/.npm-global/bin/breakout`，继承 Host 环境，并设置 15 秒超时与 256 KiB 合并输出上限。原始 CLI 输出不会持久化或写入日志。仅当命令成功退出且能力清单解析成功时记录认证成功；明确的认证错误记录为认证受阻；其他命令或解析失败保持为未知，或标记为 CLI 启动失败、超时。

结果以 `0600` 权限原子写入 `<DSH_HOME>/diagnostics/aipoju-host-auth-probe.result.json`。文件只包含运行时标识、CLI／认证／能力布尔值、能力数量、状态和非敏感错误类别。该探针本身不增加 Remote 或 HTTP 路由、不调用登录命令，也不读取凭据；独立的持续只读 Aipoju 通道见[架构记录](2026-10-12-aipoju-private-desktop-ipc.zh.md)。

## Alternatives considered

**增加 Typert Remote 探针。** 否决。所有 Remote 都由现有 `/api` 载体分发，而 loopback 与 Host 检查只限制请求可达性，不认证调用者。

**把 Terminal 凭据复制到 Host 环境或配置。** 否决。这样会改变凭据的所有权与持久化方式，而非验证 Desktop Host 是否能使用已安装 CLI。

**从 Codex 或 Terminal 启动 CLI，并把结果当作 Host 结果。** 否决。这无法证明 Desktop Host 进程的运行环境或凭据访问能力。

## Consequences

正常 Host 启动不会触发探针。用户必须创建私有标记并启动正式 Desktop Shell；只有该 Host 能消费标记并写出脱敏结果。CLI 路径和 Desktop helper 路径绑定当前安装，其他安装位置需要显式修改代码，不会静默回退。

## Verification

聚焦测试覆盖默认关闭、Desktop Shell 身份、标记所有者与权限、原子消费、固定命令成功解析、认证错误脱敏、CLI 与 Node 缺失、超时、无效输出和输出上限。只有用户在标记存在时启动正式 Shell 后产生的结果文件，才能作为正式 Desktop 验证证据。
