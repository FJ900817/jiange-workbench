# Agent Note: Host-mediated local AIHOT read projection

Status: proposed

English | [中文](2026-10-03-host-mediated-local-aihot-read-projection.zh.md)

## Problem

Radar needs access to locally persisted AIHOT Articles and Analyses without giving the browser a local service credential or making the Workbench depend on AIHOT PostgreSQL tables. Public AIHOT hotspots and a user's local intelligence are separate sources and must remain distinguishable when either source is unavailable.

## Proposal

The Workbench Host calls a private AIHOT list/detail API over loopback. AIHOT authenticates a dedicated `WORKBENCH_READ_TOKEN`, returns bounded Article/Analysis projections, and runs each query in a read-only transaction. The Host resolves the token from its credential provider, validates the response, and returns only projection fields through Business Workbench Remotes. The browser receives neither the token nor a database connection. Radar renders local intelligence and public hotspots in separate sections; a local read failure displays an unavailable state and never substitutes public data.

The projection includes persisted source, article, processing, and latest-analysis fields. Fields absent from persisted output remain null. The local API accepts GET only, sends no CORS permission, and returns no prompt, provider response, or credential data.

Client-safe contracts that need the session JSON type import `@deepseek-ai/dsh-session/types`, not the Host root entry: the root declaration adds `Context.sessions: SessionStore`, while browser plugins consume the distinct `ISessions` face.

## Alternatives considered

**Call the AIHOT loopback API from the browser.** This exposes the bearer credential to WebView code or requires a browser-held secret, so it violates the credential ownership requirement.

**Connect the Workbench Host directly to AIHOT PostgreSQL.** This couples the Workbench to AIHOT tables and expands database access beyond the read projection.

**Merge local rows into the public AIHOT adapter.** Local Articles and public hotspot aggregation have different provenance and availability; merging them makes source fallback and status ambiguous.

## Acceptance criteria

- AIHOT list and detail endpoints require the dedicated bearer token, allow GET only, and return bounded projections with null for unavailable persisted fields.
- Each projection query uses a read-only PostgreSQL transaction and does not change Article, Analysis, receipt, source-cursor, or fetch state.
- The Host adapter obtains the token from the Host credential provider, sends it only to the loopback API, validates responses, and returns an unavailable result on credential, transport, or schema failure.
- Radar keeps local intelligence separate from public hotspots and never uses public data as a local fallback.
- A production build, focused tests, secret scan, actual local-database read verification, and formal Desktop visual verification pass before replacing the local API/Web services.

## Risks

The loopback URL names a service reachable from the Harness Host process and requires the AIHOT web proxy to remain bound to the local machine. The deployment must keep the token out of browser bundles, reports, URLs, logs, and non-API containers. A failed Host build or stale Desktop bundle prevents visual acceptance even when the AIHOT API works; service replacement must wait for both sides to pass.
