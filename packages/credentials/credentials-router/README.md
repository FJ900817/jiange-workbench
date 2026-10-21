# dsh-credentials-router

English | [中文](README.zh.md)

The composite `ctx.credentials` provider keeps environment-variable references and ordinary credential records on `dsh-credentials-local`. It routes only records whose scope is exactly `workbench-scys` to `dsh-credentials-macos-keychain`.

The router delegates each operation to the selected provider. In particular, `modifyRecord` delegates the original mutation callback once and adds no lock. The selected provider owns read-modify-write serialization and storage behavior. Descriptions and record enumeration retain the credential service's value-free metadata contract.

## Configuration

| Field | Required | Meaning |
|---|---:|---|
| `local` | no | Configuration for the existing file-backed provider. |
| `keychain.helperPath` | no | Absolute path to the bundled macOS Keychain helper. When omitted, SCYS record operations fail with `WORKBENCH_SCYS_KEYCHAIN_UNAVAILABLE`. |
| `keychain.timeoutMs` | no | Upper bound for one Keychain helper operation. |

The router is intended for a Host composition that already provides subprocess support. It does not migrate records, and it does not route `CredentialRef` values to Keychain.

## Model Experience

Indirectly, through consumers that resolve credential references or read records. The router does not expose secret values in descriptions or record listings; consumers that explicitly resolve or read a credential receive the value under the `dsh-credentials` service contract.

#### KV Cache effect

No direct invalidation; the router never adds credential values to model requests.

## Known Limitations

- Only the exact `workbench-scys` record scope uses Keychain; all other record scopes and all references remain on the local provider.
- If no Keychain provider is configured, SCYS record access fails closed while local credential behavior remains available.
