# Agent Note: SCYS Today Feed V0.1

Status: implemented

English | [中文](2026-10-14-scys-today-feed-v0.1.zh.md)

## Problem

The Shengcai Today area used a fixed keyword search, so it could not represent the verified recent, hot-filtered, and digested-filtered source queries as an active feed.

## Decision

Today reads the three fixed feed operations through the existing authenticated Desktop private bridge. The Host caches each successful mode in memory for fifteen minutes, coalesces concurrent requests for the same mode, accepts only a boolean refresh flag, and returns the last successful result with a safe status when a refresh fails. The UI reads modes sequentially, chooses up to eight featured items with digested results before hot results, then up to twelve recent items after removing featured identities. Both selection and ordering use source `entityType`, `entityId`, and `gmtCreate`-derived publication time; real interaction counts break publication-time ties. The UI claims server filter selection only and shows no per-item official hot/digested badge without item evidence. Featured cards use the Aipoju text-first layout, title-deduplicated plain-text excerpts, compact metadata, and a separate source link; missing SCYS image data creates no placeholder. Search, project, detail, and comment dates display in Shanghai time, and known internal topic types are localized. Comment reads remain user-triggered and distinguish loading from completed results. Saved-grant reconnect retries only classified network failures and HTTP 408, 425, 429, or 5xx responses, after Host-memory delays of two, four, eight, then fifteen minutes. Missing or invalid authorization state does not retry; retries never start OAuth, concurrent status reads share one attempt, and success clears the backoff.

## Alternatives considered

- **Keep the fixed AI search as the default** — it would continue to misrepresent a keyword sample as the Today entry point despite the verified unkeyed recent query.
- **Add a new Remote or HTTP feed endpoint** — the existing authenticated private bridge already carries these fixed read operations, so a second access path would increase the exposed surface without adding capability.
- **Persist feed snapshots outside the Host** — a process-memory cache meets the fifteen-minute reuse need without making source content durable or adding a second owner.
- **Mark every result as officially hot or digested** — the source sometimes omits item markers, so query filters cannot justify per-item claims.

## Consequences

Opening Today no longer requires search input and can display at most twenty distinct source records across featured and latest sections. A failed refresh can keep previously read content visible while the page reports stale status and a safe error code. The normalized feed does not include image fields, so this version intentionally renders no image placeholder or inferred image; image support requires a source-backed field addition. Desktop data and visual acceptance remain separate from build and unit-test evidence.

## Verification

Formal Desktop data acceptance, focused test evidence, and the separate user-visual status are recorded in the [Radar stage closure](../../../../outputs/Business_Workbench_Radar_Completed_Modules_20261015.md).
