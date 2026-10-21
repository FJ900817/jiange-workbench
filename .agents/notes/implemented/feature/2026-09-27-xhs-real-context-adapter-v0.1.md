# Agent Note: Read-only XHS Swiss Context Projection

Status: implemented

English | [中文](2026-09-27-xhs-real-context-adapter-v0.1.zh.md)

## Problem

The Business Workbench Projects, Work, and Studio views need to display the same production sample without introducing parallel Project, Work, or Asset records.

## Decision

The Business Workbench Host exposes `readXhsSwissContext` as a read-only projection for Account 2, August 2026, Week 2, `note001`. It reads the configured XHS source root, fixed immutable cover evidence under the Business Artifact root, existing Business Workbench Jobs, and their referenced Review and Validation Artifacts. The projection represents Work as an aggregate keyed by the sample identity; it does not claim that a formal Project or Work registry exists.

The reader pins known evidence paths, checks resolved paths remain inside their configured roots, and verifies candidate image bytes against manifest SHA-256 values before returning data URLs. It returns logical source references rather than Host filesystem paths. Inconsistent evidence is marked partial; a missing or malformed required file fails closed instead of producing a partial projection. The projection preserves Job states, Review and Validation provenance, Swiss page order, renderer framework evidence, and the unapproved P5 candidate state. It does not create records, approve an asset, or render a final cover.

The assembled conversation client injects `remote.businessWorkbench`, fetches the projection once per page assembly, and publishes it through a local read-only store. Projects, Work, Image Studio, and Cover Studio consume this same projection; unrelated fixture projects remain separate.

## Alternatives considered

- **Create a Project and Work registry for the screen** — this would duplicate existing Workspace and Job truth and imply durable business objects that are not present.
- **Keep the XHS sample as UI fixtures** — fixtures cannot prove that the same production Jobs, Artifacts, and Cover evidence stay aligned across views.
- **Scan the entire source vault** — directory discovery would widen filesystem access and make the selected sample ambiguous; the adapter reads a fixed sample and fixed evidence paths.
- **Treat P5 candidates as approved assets** — generation candidates have no human selection or approval state, so promotion would fabricate approval.

## Consequences

The Host performs bounded reads only and the client does not own business truth. The UI can show the real sample consistently while accurately identifying absent Project registration, absent Workspace binding, unapproved candidates, and the lack of a final cover composite. Adding another sample requires an explicit projection change rather than implicit discovery.

## Testing

Focused projection tests verify the seven-Job aggregate, source-linked Reviews and Validations, Swiss page order, renderer evidence, unapproved candidates, artifact hash checks, and symlink containment. Client tests verify the real sample remains separate from project fixtures. The assembled web replay verifies the Remote contribution and client injection together.
