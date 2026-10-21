# Agent Note: Radar reviewability is a current-content projection

Status: implemented

English | [中文](2026-10-04-radar-reviewability-gate.zh.md)

## Problem

An Article without a usable current Analysis was previously presented as if it were ready for a human verdict, even when the user could not inspect enough persisted content.

## Decision

The AIHOT private projection owns reviewability and intelligence state. An Article is reviewable only when its latest Analysis matches the Article revision, relevance passes, the summary is non-empty, and persisted body text or a feed excerpt exists. A verdict changes the projected state to `kept`, `maybe`, or `dropped`; it does not make an otherwise incomplete Article reviewable. The write endpoint rechecks the same conditions while holding the Article row lock and returns `ARTICLE_NOT_REVIEWABLE` when they no longer hold.

List responses contain only a bounded excerpt preview. Detail responses contain bounded body or excerpt text and the existing persisted Analysis facts. Raw HTML, provider payloads, prompts, and receipts are not part of the projection.

## Alternatives considered

**Infer readiness in Radar from the absence of a human verdict.** Rejected because the UI cannot authoritatively determine Analysis freshness, relevance, summary completeness, or available source content.

**Allow a human verdict to make missing analysis reviewable.** Rejected because review labels must describe inspectable evidence, not replace it.

## Consequences

Radar can separate pending analysis from pending review and hide review controls for non-reviewable Articles. Detail pages can present persisted source content with an explicit body-versus-feed-excerpt label. Existing Articles and Analyses are projected read-only; this change does not run analysis or modify source content.

## Verification

Projection tests cover current and stale Analysis revisions, relevance pass/block, summary presence, body/excerpt availability, list/detail limits, and verdict projection. API tests cover rejection of non-reviewable writes. Radar tests cover state filtering, source excerpts, and hiding review controls for pending-analysis Articles. Production Desktop and unchanged-count verification remain required before this change is declared fully accepted.
