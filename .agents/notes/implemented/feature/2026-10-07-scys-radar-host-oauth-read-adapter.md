# Agent Note: SCYS Radar uses a Host-owned OAuth read adapter

Status: implemented

English | [中文](2026-10-07-scys-radar-host-oauth-read-adapter.zh.md)

## Problem

Workbench needs an independent Shengcai account connection without copying Codex or Obsidian credentials, exposing the provider's complete MCP tool table, or allowing Renderer-controlled tool calls.

## Decision

The Business Workbench Host owns OAuth discovery, PKCE state, the loopback callback, browser opening, token exchange, token refresh, and the process-local authenticated MCP client. It stores the OAuth grant through the existing `workbench-scys` credential scope, which the credential router directs to macOS Keychain. The Client receives only source status and normalized records.

Saved-grant reconnect uses the callback URI in the stored client registration, not a new URI or an absent one. The MCP SDK can then refresh a rejected access token before retrying MCP initialization; reconnect blocks browser authorization and persisted credential deletion. If the registration lacks a usable loopback callback URI or refresh is rejected, the Host reports reauthorization required rather than retrying indefinitely.

The SCYS adapter invokes only exact names from a fixed read-only allowlist and exposes fixed product operations for content search/detail, project search/detail, and explicit comment loading. It does not register upstream tools globally or accept a tool name from the Client. Each list is bounded, absent source values remain null, and a missing content URL stays null.

Article search preserves the source's separate card id, MCP `entityType`/`entityId`, and seconds-based publication time. Detail and comments use only the latter two identity fields; a missing or unsupported identity returns a safe error before tool invocation. `topicDetail` keeps the response wrapper so author, URL, and Feishu-inclusive body remain available.

The Today area uses a manually triggered AI-topic sample because the adapter has no verified latest-content query. Its copy does not describe that sample as the latest feed or a platform-wide ranking. The four source areas remain inside the existing Radar navigation.

## Alternatives considered

**Copy an existing Codex or Obsidian grant.** Rejected because Workbench must own its authorization and revocation lifecycle.

**Omit the callback URI during saved-grant reconnect.** Rejected because the installed MCP SDK treats that provider as a non-interactive client and attempts an authorization-code exchange without a code instead of using the saved refresh token.

**Register all upstream tools or expose `invokeScys(toolName, args)`.** Rejected because either design would give the Renderer access to tools outside the product's explicit read-only set.

**Label a keyword search as today's latest content.** Rejected because no verified latest-content API or time filter is available to this adapter.

## Consequences

OAuth tokens and client registration information remain inside the Keychain-routed Host credential record; the Client, Session, Workspace, config, and ordinary logs receive no credential values. The adapter reads the upstream tool list only to locate supported allowlisted operations and determine their declared input fields. Unsupported schemas fail as source-specific errors rather than invoking a different tool.

Saved-grant reconnect failures include at most twelve URL-free Fetch observations, with a classified request phase, response status when available, and allowlisted error metadata. SDK source locations are reduced to an SDK-relative file and line; request headers, bodies, URLs, and raw exception text are not returned.

Before `connect()`, the reconnect status identifies the actual credential-read or record-parse stage, absent or incomplete grants, callback URI checks, and MCP construction failures. A helper-reported native read failure is distinct from a credential-router call failure; only allowlisted native OSStatus values are returned. These categories describe the failing operation without inferring that the stored grant or Keychain is defective from an initial trace stage.

Each reconnect reads the saved grant once into a connection-local snapshot; repeated SDK `tokens()` callbacks use that snapshot. A successful refresh persists the new tokens before replacing the snapshot, while disposal clears it. Reconnect diagnostics retain the callback count and bounded outcomes for credential read, record parsing, token mapping, callback return, and SDK token use. The failure point remains available when a callback rejects, and these diagnostics contain only safe error types and allowlisted codes.

## Verification

Focused adapter and Renderer tests cover the fixed allowlist, OAuth state binding, source-field mapping, empty nested lists, URL absence, request-phase observation, and the content/detail/project/comment UI flow. TypeScript builds verify Host and Client contracts. These checks do not establish that the production OAuth server accepts the discovered registration or prove real content retrieval; formal Desktop OAuth and read-only acceptance remain deployment checks.

## Related

The credential router's exact `workbench-scys` scope and Keychain routing are defined in the [`credentials-router` package](../../../../packages/credentials/credentials-router/README.md).
