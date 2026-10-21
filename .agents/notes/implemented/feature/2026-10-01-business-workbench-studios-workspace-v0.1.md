# Agent Note: Business Workbench Studios Workspace

Status: implemented

English | [中文](2026-10-01-business-workbench-studios-workspace-v0.1.zh.md)

## Problem

The Studios workspace needs to expose existing image and cover production evidence without implying unsupported Provider or approval capabilities.

## Decision

Studios renders the shared read-only `XhsRealContext` for the account2 Swiss sample. Image Studio displays the existing P5 candidates and manifest state; Cover Studio displays the frozen P1–P8 framework and renderer framework evidence. Candidate preview focus remains local UI state. Studio routes navigate to Project Detail and Work Detail through the existing in-memory context request.

Video, Avatar, and Voice Studio are unavailable labels without interactive routes. The production surface does not render the old fixture generation or approval flow.

## Alternatives considered

- **Keep the fixture generator and approval prototype reachable in the production route** — it would present simulated candidate creation or approval as available capability.
- **Create a Studio Registry or persistent Studio context** — no registry or independent Studio object is present in the current runtime data.
- **Link Studios routes directly to guessed Project or Work IDs** — the sample is a read-only aggregate and has no formal Project or Work registry ID.

## Consequences

Users can inspect the same production sample across Studios, Project, and Work without changing its business state. Generation, approval, final asset binding, final cover rendering, and formal Studio discovery remain outside this workspace implementation.

## Testing

Focused client tests cover the real sample, unavailable future studios, read-only candidate state, framework state, and Project/Work context navigation. Formal Desktop screenshots are recorded in the Studios Workspace V0.1 output package.
