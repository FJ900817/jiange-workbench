# Agent Note: Xiaohongshu Radar loopback no-auth access

Status: implemented

English | [中文](2026-10-05-xhs-radar-loopback-no-auth.zh.md)

## Problem

Workbench and existing local clients need to share one Xiaohongshu MCP listener without introducing a second credential configuration.

## Decision

`BusinessWorkbenchService` exposes only source status, bounded keyword search, and selected-feed detail to the Renderer. The Host connects without authentication to the fixed `http://127.0.0.1:18060/mcp` endpoint and only calls `check_login_status`, `search_feeds`, and `get_feed_detail`. The MCP listener must bind to `127.0.0.1`; the Host sends no authorization header and accepts no caller-supplied endpoint, path, header, or tool name. Login QR and other MCP tools are not part of the Radar Renderer facade.

The Host maps bounded feed projections and preserves missing upstream fields as null. Searches run only after explicit user action; detail is read only for a selected search result. Feed data and source access tokens remain in page memory. Interaction sorting covers only loaded results and is not described as an official or platform-wide ranking.

This decision supersedes the Host-token requirement in [the credentialed adapter note](2026-10-05-xhs-radar-on-demand-read-adapter.md) for Radar calls. The separate login Remote implementation remains outside the Radar component path.

## Alternatives considered

**Keep requiring a Host-only bearer token:** rejected for this local phase because it would add a separate credential to an MCP service already used locally without authentication; all clients would need a coordinated migration before enabling auth.

**Expose caller-selected HTTP or MCP operations:** rejected because Renderer-controlled destinations or tool names would grant the Host arbitrary local network access or source operations.

**Keep QR login in the Radar component:** rejected because the verified session is already logged in and the Radar source status comes from the permitted MCP `check_login_status` tool; login actions are outside this read-only feature.

**Call the MCP from Renderer JavaScript:** rejected because it would expose the local service endpoint and couple the UI to MCP transport details.

## Verification

Focused Host adapter and Radar component tests verify fixed product calls, source-status gating, and no QR path. Build and assembled-artifact checks verify that the Renderer does not contain the MCP endpoint. Live verification checks the loopback listener, MCP login status, and one Codex search; Workbench search, detail, comments, and formal Desktop appearance require separate successful Desktop observations.

## Consequences

Existing local clients retain their no-auth MCP connection while the listener becomes loopback-only. The Host does not manage a token for Radar, but any local process running as the user can still connect to the MCP; loopback binding is not per-process authentication. Enabling authentication later requires migrating every local client together.
