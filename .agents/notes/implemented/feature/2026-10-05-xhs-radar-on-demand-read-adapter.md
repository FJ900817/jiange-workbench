# Agent Note: Xiaohongshu Radar uses a narrow on-demand read adapter

Status: implemented

English | [中文](2026-10-05-xhs-radar-on-demand-read-adapter.zh.md)

## Problem

Workbench needs a product-level path to read Xiaohongshu results without exposing an arbitrary MCP caller to the Renderer or implying a platform-wide ranking.

## Decision

`BusinessWorkbenchService` exposes only source status, bounded keyword search, and selected-feed detail Remotes. The Host adapter uses a fixed loopback MCP URL, requires the existing owner-only `0600` Host credential, and permits only `check_login_status`, `search_feeds`, and `get_feed_detail`. Missing credentials fail closed. No search is automatic, no result is persisted, and the Client receives only mapped feed fields with absent values represented as null. Detail reads use the id and access token returned by the selected search result. “Popular” sorts only results currently loaded in page memory; it is not represented as an official or global ranking.

The component includes Today Signals, Popular Observation, Search Discovery, and Comments areas. Today Signals runs its editable bounded keyword list only after an explicit user action. Comments are rendered from the selected feed's ordinary detail response and are not automatically classified. The UI distinguishes offline, logged-out, timeout, generic search failure, detail failure, and empty results.

## Alternatives considered

**Expose a generic MCP tool name or URL to the Client:** rejected because Renderer input would then control Host network access and tool selection.

**Fetch all monitor topics and note details on entry:** rejected because page navigation must not trigger broad source reads; search and detail stay user initiated.

**Call the MCP without the Host credential when its local server is unauthenticated:** rejected because the Host bridge already defines an owner-only credential path and must fail closed until the local service is configured to match it.

**Label engagement sorting as a hot list:** rejected because the source has no official platform-wide ranking operation.

## Verification

Focused Host adapter, login adapter, and Radar surface tests pass. A single authorized live search for “设计” returned an MCP tool error; no retry was made, no usable result was available for a live detail read, and the production field mapping and formal Desktop visual acceptance therefore remain unverified.

## Consequences

The Renderer receives a fixed product facade instead of MCP primitives, and write-capable tools are not reachable through these Remotes. Until the existing local MCP service and Host credential are aligned, source status resolves unavailable and live data does not appear. Synthetic tests verify mapping behavior but do not prove upstream response fields; deployment verification must supply that evidence before the feature is marked fully live.

## Related

Radar MCP authentication is superseded by [loopback no-auth reads](2026-10-05-xhs-radar-loopback-no-auth.md); this note preserves the original credential decision.
