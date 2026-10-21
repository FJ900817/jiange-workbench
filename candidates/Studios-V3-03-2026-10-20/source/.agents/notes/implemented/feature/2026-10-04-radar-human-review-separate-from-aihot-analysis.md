# Agent Note: Radar human review stays separate from AIHOT analysis

Status: implemented

English | [中文](2026-10-04-radar-human-review-separate-from-aihot-analysis.zh.md)

## Problem

Workbench readers need to keep, qualify, or discard an AIHOT article without rewriting the AIHOT system's own analysis or selection.

## Decision

Workbench human reviews are stored in `workbench_human_reviews`, keyed uniquely by Article, with an optional Analysis reference, verdict, reasons, note, and timestamps. `KEEP`, `MAYBE`, and `DROP` remain separate from AIHOT score, selection, summary, and prefilter fields. The Workbench Host proxies review reads and writes using a dedicated server-side `WORKBENCH_REVIEW_TOKEN`; the browser never receives this credential. When the private API is unavailable, the client may show its last successful review projection as stale, but disables review writes until a successful read recovers the data.

## Alternatives considered

**Store verdicts on AIHOT Analysis.** Rejected because a human judgment would overwrite or conflate system-generated analysis and selection.

**Expose the private write token to the browser.** Rejected because browser storage and requests would widen access beyond the Host-only credential boundary.

## Consequences

AIHOT Analysis remains independently auditable while each Article has at most one current Workbench verdict. Review writes require a distinct credential and a Host-mediated API call. Offline review remains visible as stale information but cannot be changed until the private API recovers.

## Verification

Route, migration, Host, and Radar tests cover create/read/update, idempotency, invalid and unauthorized requests, stale/offline write disabling, and separation from AIHOT analysis. Formal Desktop verification confirms the seeded Albertsons judgment, list filters, detail projection, offline state, and recovery. Changing live judgments on other real articles remains an explicit human action.
