# Agent Note: Host macOS Keychain credentials

Status: proposed

English | [中文](2026-10-07-host-macos-keychain-credentials.zh.md)

## Problem

The managed `.credentials.yaml` file is readable by processes running as the same user, so it is not an acceptable store for Workbench OAuth tokens. The credential seam currently installs one provider per Cordis context, and existing Harness credentials must not be migrated or silently displaced.

## Proposal

Add a macOS-only provider for the existing `ctx.credentials` interface. A small bundled native helper should use the macOS Security framework, with secret values exchanged only through Host-owned pipes. The helper should use the existing desktop application identifier as its Keychain service name, keep account names stable, and return only generic operation errors. The provider should not read `.credentials.yaml`, create Session events, or expose secrets to Renderer code. Keep one `ctx.credentials` service by composing the existing local provider with a router: references and records outside the exact `workbench-scys` scope remain local, while only that record scope enters Keychain. The router forwards `modifyRecord` directly so the backing provider retains its lock and callback semantics. Do not mount the composition into a profile until controlled routing tests and the official Host verify both storage paths; restore the profile if Host verification fails.

## Alternatives considered

**Continue using `.credentials.yaml`.** Rejected for OAuth tokens because same-user processes can read the file.

**Pass secrets in helper arguments or use a shell command.** Rejected because process arguments may be observable and shell construction adds another secret-exposure path.

**Replace the shared provider immediately.** Rejected because a Cordis context has one `ctx.credentials` provider and changing the base provider could make existing file-backed credentials unavailable; no migration is authorized.

## Acceptance criteria

The Keychain provider must pass real set, get, has, delete, and list-record tests under the bundled desktop runtime. Router tests use controlled local and secure providers and prove exact scope selection, one-time callback delegation, backend receiver preservation, error propagation, and value-free descriptions. Before OAuth, the official Host must verify ordinary credentials still use the local provider and `workbench-scys` records use Keychain. Keep secrets out of `.credentials.yaml`, logs, Session data, environment variables, command arguments, and Renderer APIs; do not migrate existing credentials.

## Risks

Keychain access can depend on the signed desktop runtime and the user's unlocked login Keychain. A helper that compiles but cannot complete a real Keychain write is not ready for OAuth use. The profile must activate the router as the sole credential service; a failed Host check must not leave that temporary profile active.
