# Agent Note: AIHOT Radar Read-only Projection

Status: implemented

English | [中文](2026-10-01-aihot-radar-readonly-projection.zh.md)

## Problem

Radar needed a first real external read path without coupling the Harness to AIHOT storage or confusing live records with local prototypes.

## Decision

The default Radar surface reads the public AIHOT API through a client-only adapter. The adapter validates the consumed response fields, maps one public Story to one Signal, and maps Story reports to Evidence when the detail is opened. It issues GET requests only, uses a short in-memory cache, and keeps fixture rendering behind an explicit mode that never mixes with live results. An Item fallback is used only when a hot-topic response omits a Story link; because the Item schema does not expose global Story membership, the UI states only that the association was not supplied.

## Alternatives considered

- **Read AIHOT PostgreSQL or deploy its services locally** — this would add storage and operational coupling outside the public API boundary.
- **Replace failed live reads with fixture records** — this would make sample data appear to be current external information.
- **Infer Story membership for Items** — the public response does not provide enough evidence for that conclusion.

## Consequences

Radar can display a traceable public Story projection without a server-side mirror, write path, or generated analysis. The schema snapshot is pinned by SHA for this PoC, but the upstream repository commit remains unpinned. Live hot-topic data during verification contained no unlinked Story fallback sample, and the formal Desktop still served its older fixture build, so visual acceptance remains incomplete.

## Testing

Focused adapter and surface tests cover Story deduplication, Evidence, Item fallback, offline, HTTP 503, invalid schema, timeout, cache, and real-versus-fixture separation. The package TypeScript check passes. Formal Desktop live-data visual acceptance is pending.
