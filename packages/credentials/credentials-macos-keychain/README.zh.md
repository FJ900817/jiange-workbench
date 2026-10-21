# dsh-credentials-macos-keychain

[English](README.md) | 中文

这是 [`ctx.credentials`](../credentials/README.zh.md) 的 macOS 专用 Provider，目标是将凭据引用和记录作为通用密码项目存入登录钥匙串，使用应用标识 `ai.deepseek.harness.desktop`；不会读取或迁移 `.credentials.yaml`。

在 Host 中挂载 `MacOSKeychainCredentialProvider`，并传入随应用打包的 `KeychainCredentialHelper` 绝对路径。Helper 使用 Security framework 和 JSON 管道传输数据：密钥不会进入命令参数、环境变量、文件或 stderr。Helper 故障只返回稳定的 `KEYCHAIN_*_FAILED` 错误码。

Provider 实现 `CredentialProvider` 的引用和记录操作。`modifyRecord()` 在 Host 回调读取并提交记录期间持有按账户隔离的 advisory lock，因此不同 Harness 进程不会在刷新 token 时互相覆盖。锁文件只包含账户名摘要，位于 `~/Library/Caches/ai.deepseek.harness/keychain-locks`。

应用构建会把 Helper 安装到 `Contents/Frameworks`，并将其路径传给本机 Host。Renderer 不会获得 Provider 实例或钥匙串值；产品 API 只能返回凭据是否存在或授权状态。

## Model Experience

不会影响模型可见内容。凭据操作仅在 Host 执行，不创建 Session 事件。

#### KV Cache effect

不会直接失效；凭据不会进入请求前缀。

## Known Limitations and Deferred Work

- 该 Provider 仅支持 macOS，并依赖随应用打包的原生 Helper；共享的跨平台 base bundle 不会挂载它。
- 当前 Host 可以编译 Helper，但集成测试未能完成 Keychain 写入。在随应用打包的 Desktop Runtime 通过 Keychain 集成测试前，不要将此 Provider 用于 OAuth。
- 本 Provider 有意不读取或迁移 `.credentials.yaml` 中的现有值。Host 改用它后，需要重新完成该 Host 自己的授权。
