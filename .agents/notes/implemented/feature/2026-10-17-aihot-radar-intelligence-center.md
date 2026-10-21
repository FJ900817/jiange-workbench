# Agent Note: AIHOT Radar Intelligence Center

Status: implemented

English | [中文](2026-10-17-aihot-radar-intelligence-center.zh.md)

## Problem

Radar had a public-hotspot preview and a separate local AIHOT view, but no formal surface for the official public news archive, report indexes, and hotspot details. The weekly and monthly indexes also needed to show a real empty result separately from a failed request and from a readable `latest` detail that was missing from its index.

## Decision

The existing Radar AI section hosts the confirmed information-center structure: a public-data home, complete item library, hotspot events, periodic reports, and the existing local My Intelligence view. The home presents one official hot Story as its focus, loads that Story's official digest and up to two latest evidence reports, lists up to four other official hot signals, and links to the existing information-center sections. The source-count label explicitly describes coverage rather than importance. The home distinguishes `HotTopic.sourceCount` from Story-detail `sourceCount` and displays Story-detail `reportCount`; the evidence list is a separate `reports[]` collection capped at two displayed rows. Home refresh clears the shared public-read cache and refreshes the existing Radar signals. The library loads official selected and seven-day all-item queries separately; it sends supported filters and query-bound cursors to the existing GET-only reader and appends only unseen official item IDs. A repeated cursor stops pagination. Report-index loading, empty, and request-failure states remain distinct; an empty index with a readable `latest` detail displays that detail with a mismatch notice but does not synthesize an index entry. Public Items have no dedicated detail endpoint, so the in-app detail displays only fields returned by the list endpoint and links to AIHOT and the original source. Local Article, Analysis, and Review continue through their existing Host path.

## Alternatives considered

- **Merge public items into local AIHOT storage** — rejected because public publication records and user-owned Article/Analysis/Review data have different ownership and lifecycle.
- **Treat an empty report index as a request failure or manufacture rows from `latest`** — rejected because successful empty responses, failed requests, and detail/index inconsistencies are different service states.
- **Render a full article body from a public Item list record** — rejected because the official Item API does not provide a separate full-detail operation or body field.

## Consequences

The official public surface is reachable within the existing Radar navigation without a new public API or Host operation. Search results are not client-filtered, cursors remain owned by their query, and report data is not presented as complete when only a latest detail can be read. The UI cannot show a full AIHOT Item body until the official API provides that operation. Real Desktop acceptance and user visual acceptance remain separate from component tests and builds. Focus titles retain full text and use balanced wrapping; this does not change the accepted visual direction.

## Testing

The focused component tests cover the three-layer home, official Story detail and evidence, navigation, filter parameter forwarding, cursor append and deduplication, report index/detail mismatch, and request failure versus empty state. A formal Desktop session rendered the new home and returned live AIHOT Story summary, evidence, and hotspot data through the existing read-only adapter. The documented `dev:web` watcher then failed its broader TypeScript watch with six existing test typing errors; during that attempt the Desktop page became blank and its 3080 Host stopped responding. Do not treat the transient live render as a stable final Desktop acceptance. Restore the normal Host session before further visual acceptance; no App bundle or user data was changed.

The user later confirmed the V1.1.3 homepage visual direction as PASS. The homepage now distinguishes hot-list `sourceCount`, Story-detail `sourceCount`, and Story-detail `reportCount`; its evidence rows remain limited to two from `reports[]`. During final closeout, the existing Desktop displayed a live Story with 16 sources and 17 reports after ordinary navigation. A separate read-only browser viewport check at 1280×800 and 1100×800 showed no horizontal page overflow; the focus and evidence stacked at 1100px. Focused tests passed 12/12, package typecheck passed, and the Client bundle passed. No `dev:web` or restart was run; the active Desktop showed the new field labels after navigation following the package build, and the exact resource reload mechanism was not verified. Historical WKWebView blank-screen root cause remains NOT VERIFIED.
