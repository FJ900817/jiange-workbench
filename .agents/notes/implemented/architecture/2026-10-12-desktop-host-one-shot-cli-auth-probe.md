# Agent Note: Desktop Host one-shot CLI authentication probe

Status: implemented

English | [中文](2026-10-12-desktop-host-one-shot-cli-auth-probe.zh.md)

## Problem

The Aipoju CLI is authenticated in the user's Terminal, but the macOS Desktop Host starts with a different environment. The existing Workbench `/api` Typert Remote path has no authentication layer, so it must not be extended with a credential probe merely to inspect this difference.

## Decision

`BusinessWorkbenchService` checks for a local one-shot marker during Host initialization. It runs the probe only when the Host inherited the exact helper path supplied by the installed DeepSeek Harness Shell, the resolved Harness home and its `diagnostics` directory belong to the current user, and the diagnostics directory grants no permissions to group or other users. The marker is atomically renamed before validation or execution; it must be an empty, current-user-owned file with no group or other permissions.

The Host starts the fixed `/Users/jane/.npm-global/bin/breakout` executable with the argument array `['capabilities']`, `shell: false`, the Host environment, a 15-second deadline, and a 256 KiB combined output cap. It never persists or logs raw CLI output. A successful exit plus a parsed capability list records authentication success; an explicit authentication error records blocked authentication; all other command or parse failures remain unknown or identify CLI startup and timeout failures.

The result is atomically written with mode `0600` to `<DSH_HOME>/diagnostics/aipoju-host-auth-probe.result.json`. It contains only the runtime label, CLI/auth/capability booleans, capability count, status, and a non-sensitive error category. The probe itself adds no Remote or HTTP route, does not call login, and does not read credentials; the separate persistent Aipoju read channel is documented in [its architecture note](2026-10-12-aipoju-private-desktop-ipc.md).

## Alternatives considered

**Add a Typert Remote for the probe.** Rejected because every Remote is dispatched through the existing `/api` carrier, whose loopback and Host checks are reachability controls rather than caller authentication.

**Copy the Terminal credential into the Host environment or configuration.** Rejected because that changes credential ownership and persistence instead of testing whether the Desktop Host can already use the installed CLI.

**Run the CLI from Codex or Terminal and call that a Host result.** Rejected because it cannot establish the environment or credential access of the Desktop Host process.

## Consequences

Normal Host startup has no probe side effect. A user must create the private marker and start the installed Desktop Shell; only that Host can consume the marker and create the sanitized result. The fixed CLI path and Desktop helper path are installation-specific, so a different installation requires an explicit code change rather than an implicit fallback.

## Verification

Focused tests cover disabled startup, Desktop Shell identity, marker ownership and permissions, atomic consumption, fixed successful capability parsing, authentication failure redaction, missing CLI and Node, timeout, malformed output, and the output limit. The formal Desktop result is established only by a result file produced after the user starts the installed Shell with the marker present.
