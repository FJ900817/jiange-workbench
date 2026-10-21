# Agent Note: Radar Information Spaces

Status: implemented

English | [中文](2026-10-02-radar-information-spaces-v0.2.zh.md)

## Problem

One Radar list did not provide separate places for public AI intelligence, future source-specific research, and cross-source signals.

## Decision

The Radar surface owns five internal pages: overview, AI intelligence, Xiaohongshu Radar, Shengcai, and cross-source signals. The client has no business-page pathname router, so Radar switches pages using component state and keeps its secondary navigation visible. Proposed path identifiers are DOM metadata, not navigable URLs.

The overview previews up to two records from the existing public AIHOT read adapter and uses explicit empty-source slots for the other spaces. AI intelligence separates public AIHOT data from the local AIHOT status, which remains disconnected. Xiaohongshu, Shengcai, and cross-source pages do not render sample records without a real source or registry.

## Alternatives considered

- **Add source-specific entries to the global Sidebar** — this would promote Radar subsections to top-level workspaces and weaken the existing Workspace hierarchy.
- **Create pathname routes without a current router** — this would introduce a second navigation mechanism for one Workspace.
- **Fill empty spaces with fixture records** — this would make unsupported source data appear current in the formal Desktop.

## Consequences

Radar can grow by source without extending the global Workspace list or mixing public AIHOT, local AIHOT, and unavailable sources. Internal page state is not deep-linkable and resets when the Radar component is recreated. The current public AIHOT adapter remains read-only; source ingestion, saved labels, and cross-source registration remain outside this change.

## Testing

Radar public and fixture surface tests pass, including navigation, public Story detail, honest unavailable source states, and the absence of fixture substitution. The ui-conversation TypeScript project, package bundle, and apps/web production build pass. The formal Harness Desktop was reloaded and all five pages were visually inspected. Window screenshots could not be persisted with the available desktop tooling.
