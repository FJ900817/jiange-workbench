# Agent Note: Business Work Workspace Read-only Projection

Status: implemented

English | [中文](2026-10-01-business-workbench-work-workspace-v0.1.zh.md)

## Problem

The Work surface mixed example rows with a real XHS production projection, so job-level facts could be mistaken for formal Work records.

## Decision

Work V0.1 displays the existing account2 Swiss task identity as one read-only aggregate over its real Jobs, Reviews, Validations, Artifact references, and P5 Asset Manifest. It does not create a Work registry, Work ID, lifecycle state, progress, or approval write path. The UI labels completed counts as Job-level results and keeps source status visible.

Work detail uses the shared `XhsRealContext` and one-shot in-memory navigation to the matching Project, Image Studio, and Cover Studio. Destination surfaces keep the same identity and read from their own projection of the shared context.

## Alternatives considered

- **Keep fixture work rows in the production surface** — this would make example state appear to be runtime truth.
- **Synthesize one formal Work record from the seven Jobs** — no Work registry or source Work ID exists.
- **Collapse all Jobs into a single completed state** — this would hide interrupted and failed records and misstate the aggregate.

## Consequences

Users can inspect the real seven-Job aggregate and follow its Project and Studio context without changing business data. Work remains a read-only projection until a formal Work registry and lifecycle source exist. Attention signals do not imply unread state or approval capability.

## Testing

Focused client tests cover the real aggregate, job-level state counts, failure evidence, read-only controls, and context navigation. Formal Desktop screenshots are stored in the Work Workspace V0.1 output package.
