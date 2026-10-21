# dsh-credentials-macos-keychain

English | [中文](README.zh.md)

macOS-only provider for the [`ctx.credentials`](../credentials/README.md) seam. It is intended to store credential references and records as generic-password items in the login Keychain under the app identifier `ai.deepseek.harness.desktop`; it never reads or migrates `.credentials.yaml`.

Mount `MacOSKeychainCredentialProvider` in the Host with an absolute path to the bundled `KeychainCredentialHelper`. The helper uses the Security framework and a JSON pipe: secret values are not command arguments, environment variables, files, or stderr output. Helper failures surface only stable `KEYCHAIN_*_FAILED` codes.

The provider implements reference and record operations from `CredentialProvider`. `modifyRecord()` holds an account-scoped advisory lock while the Host callback reads and commits the record, so separate Harness processes do not race a token refresh. Lock files contain only a digest of the account name and live under `~/Library/Caches/ai.deepseek.harness/keychain-locks`.

The app build installs the helper in `Contents/Frameworks` and passes its path to the local Host. Renderer code receives no provider instance or Keychain value; product APIs must return only credential presence or authorization status.

## Model Experience

No model-visible effect. Credential operations are Host-only and do not create Session events.

#### KV Cache effect

No direct invalidation; credentials never enter a request prefix.

## Known Limitations and Deferred Work

- The provider is macOS-only and requires the app-bundled native helper; it is not mounted by the shared cross-platform base bundle.
- The current host could compile the helper but could not complete a Keychain write in the integration test. Do not mount this provider for OAuth until the bundled desktop runtime passes the Keychain integration test.
- Existing values in `.credentials.yaml` are intentionally neither read nor migrated by this provider. A Host adopting it must obtain its own authorization again.
