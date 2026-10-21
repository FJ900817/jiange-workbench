# Agent Note: Aipoju private Desktop IPC

Status: implemented

English | [中文](2026-10-12-aipoju-private-desktop-ipc.zh.md)

## Problem

The authenticated Breakout CLI must be callable from the macOS Desktop Host without turning the loopback-only Typert `/api` carrier into an unauthenticated data endpoint or exposing credential material to Renderer.

## Decision

The macOS Shell accepts Aipoju messages only from the trusted main WebKit frame at the exact origin `http://127.0.0.1:3080`. Each app launch creates a fresh random token and a launch-specific socket path. The token stays in native Shell memory and the Host startup environment; ordinary Command subprocesses do not receive the token variables. The Host consumes and removes both launch variables when the Workbench service initializes. Renderer messages contain only a request id, one closed operation name, and bounded arguments.

The Host binds a Unix socket below `~/Library/Application Support/DeepSeek Harness/aipoju-ipc/`, using a 32-hex-character random basename to stay within macOS `sockaddr_un.sun_path` limits. The directory is owned by the current user with mode `0700`, and each socket is current-user-owned with mode `0600`. The server accepts one JSON request per connection, compares the token in constant time, bounds request/response sizes, and removes its socket during service disposal. It exposes no HTTP route or Typert Remote.

The only accepted operations are `topic.list`, `topic.search`, and `topic.detail`. The adapter maps them to fixed argument arrays for `/Users/jane/.npm-global/bin/breakout`, uses `shell: false`, a fixed allowlisted environment, one active process, a 20-second deadline, and a 2 MiB combined output cap. It returns selected topic fields only; unknown or write-capable operations and out-of-range arguments fail closed. CLI output, user content, and the token are never logged. Returned content remains data and must be rendered as text by a future UI.

The separate [one-shot Host auth probe](2026-10-12-desktop-host-one-shot-cli-auth-probe.md) remains a startup-only diagnostic and does not use this persistent read channel.

## Alternatives considered

**Add Aipoju Typert Remotes or an HTTP endpoint.** Rejected because the existing loopback carrier has no reliable caller authentication, and Origin/CORS checks alone do not authenticate a process.

**Put a fixed token in Renderer or profile configuration.** Rejected because frontend bundles and profile data are visible to page code and cannot hold a Host credential.

**Accept arbitrary CLI arguments or operation names.** Rejected because that would turn a source-specific read adapter into command execution and could expose write-capable CLI functions.

## Consequences

Only the native Desktop Shell can initiate the authenticated private channel, and the Host accepts only the three Aipoju read operations. The channel is unavailable to Web-only and Codex Host processes without the per-launch Shell secrets. Real authenticated list/search/detail calls still require a deployed native Shell and user-operated Desktop validation; code fixtures are not live business evidence.

## Verification

Host tests exercise Unix-socket permissions, missing and forged tokens, denied operations, invalid parameters, output projection, CLI argument templates, and single-process admission. Swift policy tests reject subframes and every tested origin mismatch. The first formal launch exposed an overlong socket basename; the shortened 32-hex basename and Host length guard are covered by focused tests. Formal list/search/detail validation remains pending.
