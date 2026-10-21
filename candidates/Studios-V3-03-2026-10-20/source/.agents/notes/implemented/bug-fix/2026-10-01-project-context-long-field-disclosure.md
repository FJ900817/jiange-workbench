# Agent Note: Project Context Long-Field Disclosure

Status: implemented

English | [中文](2026-10-01-project-context-long-field-disclosure.zh.md)

## Problem

The read-only Project projection contains source identifiers and integrity values that can exceed the available detail-column width and compete with Review status.

## Decision

Project detail shows short identifiers in the normal view and keeps complete source identifiers, relative source paths, and hashes in native disclosure details. Review and Validation status remains the primary text; source Job and Artifact identifiers are secondary. The Project Context aside contains the projection identity, the explicit missing Project ID, the unbound Workspace explanation, and lightweight navigation links.

## Alternatives considered

- **Render every identifier inline with wrapping**: this preserves full values at a glance but lets implementation metadata dominate the business status and lengthen every row.
- **Remove identifiers and hashes from the page**: this reduces visual density but discards real provenance needed for inspection.
- **Persist a second formatted projection for the UI**: this adds a parallel copy of source truth when short display values can be derived from the existing projection.

## Consequences

The ordinary view stays within the detail grid and foregrounds Review / Validation results. Complete source values remain accessible without changing the Host projection or its business data. Users must expand the disclosure to inspect full provenance.

## Testing

The Project surface test verifies concise statuses and Project context, then opens disclosures to confirm full Artifact IDs, Job IDs, and source paths remain available.
