# Agent Note: Host macOS Keychain credentials

Status: proposed

[English](2026-10-07-host-macos-keychain-credentials.md) | 中文

## Problem

受管 `.credentials.yaml` 可被同一用户运行的进程读取，因此不能作为 Workbench OAuth Token 的存储。当前 credential seam 在每个 Cordis Context 中只安装一个 Provider；现有 Harness 凭据不得被迁移或悄然替换。

## Proposal

为现有 `ctx.credentials` 接口新增 macOS 专用 Provider。随应用打包的轻量原生 helper 使用 macOS Security framework，密钥值只通过 Host 管理的管道传递。Helper 使用现有桌面应用标识作为 Keychain service 名称，并保持 account 名稳定；操作失败只返回通用错误。Provider 不读取 `.credentials.yaml`、不创建 Session event，也不向 Renderer 暴露密钥。通过组合现有本地 Provider 和 Router，继续在 Context 中只注册一个 `ctx.credentials` 服务：引用以及精确 `workbench-scys` 作用域之外的记录仍使用本地存储，只有该记录作用域进入 Keychain。Router 直接转发 `modifyRecord`，保留后端的锁和回调语义。只有受控路由测试通过，且正式 Host 验证两条存储路径后，才把该组合挂载到 Profile；Host 验证失败时必须恢复 Profile。

## Alternatives considered

**继续使用 `.credentials.yaml`。** 因同一用户的进程可以读取该文件，不适合作为 OAuth Token 的存储。

**通过 helper 参数或 shell 命令传递密钥。** 进程参数可能被观察到，shell 命令构造也会增加密钥泄露途径，因此不采用。

**立即替换共享 Provider。** 一个 Cordis Context 只有一个 `ctx.credentials` Provider；修改 base Provider 可能使现有文件凭据不可用，而且本任务未授权迁移，因此不采用。

## Acceptance criteria

Keychain Provider 必须在打包桌面 Runtime 中通过真实 set、get、has、delete 和 list-record 测试。Router 测试使用受控的本地与安全后端，证明作用域精确路由、回调只委托一次、保留后端实例语义、错误原样传播且描述不包含凭据值。启动 OAuth 前，正式 Host 必须验证普通凭据仍由本地 Provider 处理，而 `workbench-scys` 记录进入 Keychain。密钥不得进入 `.credentials.yaml`、日志、Session 数据、环境变量、命令参数或 Renderer API；不得迁移现有凭据。

## Risks

Keychain 访问可能取决于桌面 Runtime 的签名，以及用户登录 Keychain 是否已解锁。只能编译、却不能完成真实 Keychain 写入的 helper 不能用于 OAuth。Profile 必须只启用 Router 作为凭据服务；Host 检查失败后，不得继续保留临时 Profile。
