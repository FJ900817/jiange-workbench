# dsh-credentials-router

[English](README.md) | 中文

该组合式 `ctx.credentials` 提供方会将环境变量引用和普通凭据记录保留在 `dsh-credentials-local`，只有作用域精确为 `workbench-scys` 的记录才路由到 `dsh-credentials-macos-keychain`。

Router 会把每个操作委托给选定的提供方。尤其是 `modifyRecord`：它只委托原始修改回调一次，不额外加锁。读-改-写串行化和存储行为由选定的提供方负责。描述与记录枚举遵循凭据服务的约定，不包含凭据值。

## 配置

| 字段 | 必需 | 含义 |
|---|---:|---|
| `local` | 否 | 现有文件型提供方的配置。 |
| `keychain.helperPath` | 否 | 已随应用打包的 macOS Keychain helper 绝对路径。缺省时，SCYS 记录操作会以 `WORKBENCH_SCYS_KEYCHAIN_UNAVAILABLE` 失败。 |
| `keychain.timeoutMs` | 否 | 单次 Keychain helper 操作的最长等待时间。 |

Router 用于已经提供 subprocess 支持的 Host 组合。它不会迁移记录，也不会将 `CredentialRef` 路由到 Keychain。

## 模型体验

Router 通过解析凭据引用或读取记录的消费者间接影响模型调用。它不会在描述或记录列表中暴露 secret；根据 `dsh-credentials` 服务约定，明确解析或读取凭据的消费者会取得对应值。

#### KV Cache 影响

无直接失效；Router 不会将凭据值加入模型请求。

## 已知限制

- 只有精确的 `workbench-scys` 记录作用域使用 Keychain；其他记录和所有引用仍使用本地提供方。
- 未配置 Keychain 提供方时，SCYS 记录访问会 fail closed，本地凭据行为仍可用。
