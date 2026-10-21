# Agent Note: Radar AI 破局俱乐部 V0.1

Status: implemented

English | [中文](2026-10-12-radar-aipoju-v0.1.zh.md)

## Problem

Radar needed a read-only home feed over authenticated AI 破局俱乐部 topics without exposing CLI credentials or turning the loopback Host API into an unauthenticated source-data endpoint.

## Decision

The Radar tab uses only the existing native Shell message bridge and private Host Unix socket. On entry, the Host reads verified 20-row CLI pages until it has 50 unique candidates or has read at most 100 rows. It ranks up to eight topics from the last seven days by source time, available engagement, and content completeness, then returns up to twelve distinct newest topics. Featured topics use two-column text-first cards with optional right-side thumbnails; newest topics stay in a horizontal list and omit absent or failed thumbnails. Card excerpts remove a matching leading title from plain text. A 15-minute in-memory Host snapshot avoids repeated CLI calls; manual refresh bypasses it, and a failed refresh preserves the last successful snapshot with a safe error code. Keyword search returns at most twenty topics, and detail loads only after selection through the fixed `topic.list`, `topic.search`, and `topic.detail` operations. The Host remains the only process that starts Breakout CLI; the Renderer receives normalized topic fields and renders body content as text. Source and image URLs are accepted only when they use HTTP or HTTPS.

The tab reports loading, empty, authentication, and safe error states. It does not analyze, write, schedule, or merge these topics into other Radar sources. The same authenticated bridge also exposes only the fixed SCYS feed operations `scys.recent`, `scys.hot`, and `scys.digested`. The Host builds `searchTopic` parameters from the official schema, fixes the range to seven days in Unix seconds, reads at most two pages of ten with a per-call timeout, requires `entityType`/`entityId` and numeric `gmtCreate`, deduplicates identity pairs, and sorts by source time. Feed projections discard article body text and bound display strings. Server-side filter acceptance is reported separately from per-item official marker evidence; no SCYS operation is added to HTTP or Typert Remote.

## Alternatives considered

**Call the local HTTP API from the Renderer.** Rejected because loopback access alone does not authenticate the caller; the new SCYS reads therefore use the existing token-authenticated private socket.

**Expose a generic CLI command or full capability catalog.** Rejected because the Radar UI needs only three read operations and must not provide arbitrary command execution.

## Consequences

Only a Desktop launched with the native Shell bridge can load real Aipoju topics or invoke the three fixed SCYS feed reads. Browser-only builds fail closed with an unavailable state. Featured topics use an explainable local ordering and do not represent official club recommendations. SCYS query operations do not change Radar UI behavior.

## Verification

Focused Renderer tests cover list/detail/search wiring, authentication messaging, and literal rendering of untrusted body markup. Host IPC tests cover operation allowlisting and authorization; Swift policy tests cover exact trusted-origin checks. Formal Desktop data acceptance and the separate user-visual status are recorded in the [Radar stage closure](../../../../outputs/Business_Workbench_Radar_Completed_Modules_20261015.md).
