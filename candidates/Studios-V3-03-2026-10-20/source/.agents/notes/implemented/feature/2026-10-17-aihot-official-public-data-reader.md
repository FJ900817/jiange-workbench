# Agent Note: AIHOT Official Public Data Reader

Status: implemented

English | [中文](2026-10-17-aihot-official-public-data-reader.zh.md)

## Problem

The Radar hotspot projection could not read the public news archive, report issues, or selected-data synchronization pages, while the local Article/Analysis database was unavailable and remained a separate user-owned source.

## Decision

The client package owns a separate GET-only reader for AIHOT's official `/api/v1` publication layer. It validates the fields it consumes, binds item cursors to normalized query parameters, caps multi-page reads, and keeps selected snapshot and change pages as explicit bounded operations rather than running a mirror. The reader shares the existing conditional-GET cache, suppresses duplicate concurrent requests, and honors `Retry-After` by withholding the same request until the server's interval ends. It does not modify the local AIHOT Article, Analysis, or human-review path. The formal AI 情报中心 consumes this reader through the existing Radar AI section; its home, library, report-index fallback, and Item-detail limits are recorded in the [AIHOT Radar intelligence center note](2026-10-17-aihot-radar-intelligence-center.md).

## Alternatives considered

- **Expand the local AIHOT database path to include public records** — rejected because public publication data and private Article/Analysis records have different ownership, availability, and provenance.
- **Automatically crawl or mirror the entire selected archive** — rejected because the current internal preview needs bounded reads, not background ingestion or bulk redistribution.
- **Add parallel MCP, Skill, and REST ingestion** — rejected because the official channels overlap in published data and duplicate synchronization work is unnecessary for this client reader.

## Consequences

Public news, Story detail, and periodic reports can be queried independently of the local database, with explicit empty, schema, HTTP, timeout, offline, and rate-limit outcomes. The official Item response has no tags array or separate Item-detail route, so this reader does not invent tags, article body text, or local analysis. The integrated Radar UI consumes these methods without introducing a public proxy; formal Desktop and visual acceptance remain separate from live adapter checks.
