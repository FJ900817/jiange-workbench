# Agent Note: AIHOT bounded data processing over the public reader

Status: implemented

English | [中文](2026-10-17-aihot-data-pipeline.zh.md)

## Problem

AIHOT's public Item and Story readers validate official responses and own HTTP caching, but future consumers need a reusable batch projection that can page safely, retain provenance, compare snapshots, and distinguish confirmed event links from candidates without starting a second collector or storing a local mirror.

## Decision

`packages/client/ui-conversation/src/client/skeleton/aihot-data-pipeline.ts` composes `loadAihotItems` and the existing public record types. The caller supplies a finite page cap, request interval, and checkpoint age; the implementation caps one run at ten pages, detects repeated cursors, and returns successful records plus an in-memory checkpoint on interruption or API failure. The checkpoint retains the exact query identity and cursor, so callers cannot resume it with different filters; it is not a durable cursor for a later rolling-window sync.

Normalized Items retain API field origins, `publishedAt`, `discoveredAt`, and a separate client `observedAt`. The public Item `score` is retained as an official numeric field without assigning undocumented comparative meaning. Item-to-Story links are confirmed only when a Story report ID equals the Item ID or its original URL exactly matches; supplied candidate links remain marked `needs_review`. Equal Item IDs collapse to the last observed record; equal original URLs are counted in a canonical article projection while the distinct official Item records remain available for incremental comparison.

Two snapshots classify added, unchanged, and changed Items and Stories by official identity. The comparison does not infer deletion from absence because a public rolling-window query is not a complete, stable mirror. No persistence, scheduler, worker, model call, UI route, or database write is part of this module.

## Alternatives considered

**Create another HTTP client or collector package.** Rejected because A1 already owns endpoint validation, query-bound cursors, cache behavior, and safe API errors; a second reader could drift from the official schema and duplicate requests.

**Persist cursors and snapshots in the existing local database.** Rejected because this phase does not authorize database changes or a durable mirror, and the seven-day query window moves over time.

**Infer Story identity from similar titles.** Rejected because title similarity cannot establish an official event relationship; such candidates must remain explicitly unconfirmed.

## Consequences

Consumers can reuse one normalized, provenance-aware result for search, analysis, or later content systems while A1 remains the only network reader. A bounded read can resume successful pages during its configured checkpoint lifetime, but callers must begin a new query after the checkpoint expires. The pipeline does not provide long-term change history, removal detection, or a background synchronization service.

## Verification

Focused tests cover two-page collection beyond 100 records, duplicate IDs, page caps and resume, API failure recovery, cursor loops, cancellation, throttling, query mismatch, checkpoint expiry, exact Story association, unconfirmed candidates, and Item/Story snapshot diffs. A live read through the existing adapter completed two official pages with 200 unique Item IDs; this was a bounded read, not a full catalog mirror.
