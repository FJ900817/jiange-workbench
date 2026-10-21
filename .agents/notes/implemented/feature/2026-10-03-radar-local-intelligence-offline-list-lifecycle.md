# Agent Note: Radar Local Intelligence Offline List Lifecycle

Status: implemented

English | [中文](2026-10-03-radar-local-intelligence-offline-list-lifecycle.zh.md)

## Problem

Radar remains mounted while another Workspace is selected, so the local AIHOT list could remain visible from an earlier request without checking whether that source was still available.

## Decision

The local list distinguishes idle, loading, ready, empty, offline, and request error. Radar revalidates the list when its Workspace becomes active, when the user enters or returns from detail to My Intelligence, and when the user activates the list-only refresh control. A successful response replaces the list and records an in-memory read timestamp; an unavailable response or rejected request retains the last successful list and labels it as prior data. A successful empty response is not treated as offline. Request identifiers prevent an older overlapping read from replacing a newer result. Public hotspots and local detail reads remain independent.

## Alternatives considered

- **Keep the mounted list without revalidation** — this left stale local data appearing current after the user returned to Radar.
- **Clear the list on every unavailable response** — this removed useful prior context even when the UI could clearly label it as stale.
- **Poll the local API periodically** — this added recurring traffic without a user-visible need; focus, section entry, and explicit refresh provide bounded reads.

## Consequences

The user can distinguish current data, prior successful data, a successful empty result, and unavailable/error states without changing the local AIHOT service or switching to public data. The timestamp and retained list are in-memory only; a full app reload does not restore stale list data. Returning to Radar or entering My Intelligence triggers a fresh read without restarting Harness.

## Testing

Radar surface tests cover initial success, stale retention after offline, section re-entry, Workspace focus regain, manual refresh recovery, local detail offline, public-hotspot isolation, successful empty results, and rejected requests. Build and formal Desktop verification are recorded in the V0.7 delivery report.
