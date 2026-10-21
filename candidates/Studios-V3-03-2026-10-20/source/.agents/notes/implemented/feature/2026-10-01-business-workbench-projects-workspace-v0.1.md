# Agent Note: Business Workbench Projects Workspace Projection

Status: implemented

English | [中文](2026-10-01-business-workbench-projects-workspace-v0.1.zh.md)

## Problem

The Projects surface needs to connect to existing XHS business evidence without implying a Project registry or treating one production sample as an entire Project.

## Decision

Projects uses a read-only `xhs` projection from the existing `XhsRealContext`. Its client `ProjectContext` carries `projectId: null`, the existing project discriminator, display metadata, and the exact sample identity split into account, period, week, and note. The account2 Swiss sample remains evidence within that projection rather than a registered Project. Fixture projects remain visibly separate; Project creation is unavailable while the Host has no Project registry.

Project detail reads current Job, Review, Validation, Artifact, cover, asset, and Workspace facts from the shared Host projection. A one-shot in-memory navigation request opens the same sample's Work detail, Image Studio, or Cover Studio; the destination reads its own view from the shared projection. Navigation does not persist business records or copy source truth.

## Alternatives considered

- **Create a Project registry or synthetic Project ID for the page** — this would claim a durable object and Workspace relation that the Host does not have.
- **Keep the production sample as a Project fixture** — this would hide current Job and Artifact truth and permit accidental confusion with the account4 example.
- **Put project identity in a URL or persistent store** — this would add route persistence and a second owner for identity when the selected projection already supplies it.

## Consequences

Users can inspect the existing XHS work context and move directly among Projects, Work, and the two real Studio surfaces. The page cannot yet create, edit, or independently enumerate formal Projects, and its Project name and key identify a read-only projection rather than a registered entity. Formal Desktop visual acceptance requires the running Web Runtime to serve this build; an old served bundle is not valid screenshot evidence.

## Testing

Focused client tests cover the read-only ProjectContext, disabled creation entry, separation of fixture rows, real Review / Validation status, and direct navigation to the same Work and Studio sample. The output package records the Desktop screenshot acceptance result separately from the build and test results.
