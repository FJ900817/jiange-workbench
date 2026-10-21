# Agent Note: Studios media creation sessions

Status: implemented

English | [中文](2026-10-18-studios-media-creation-sessions.zh.md)

## Problem

The isolated Studios P2.1 flow demonstrated continuous Mock creation and revision history, but its JSON files were not a suitable formal Harness data authority and its preview server was not a Host integration.

## Decision

The Business Workbench owns a separate `business_workbench_media_studio` Domain schema v1 and fixed Host Remotes for declared model discovery, session reads, turn creation, task polling, and cancellation. The store persists each creative session as an aggregate record containing immutable turns, tasks, artifacts, and revision edges. It does not modify the XHS `business_workbench` schema or import isolated P2 files.

The first provider implementation is a fixed Mock. It validates the declared model controls, creates opaque `mock-result://` references without media bytes, and reports zero provider network requests. Image count requests are split by each model's declared per-task cap while retaining one turn. Selecting an old artifact records its parent and modification intent; video lineage is labeled prompted regeneration, not precise editing.

The Client accesses only fixed `remote.businessWorkbench` operations. It does not accept a provider URL, arbitrary tool name, credential, or remote generation command. The XHS sample projection gates sample-backed production routes; the independent media creation routes require only the injected media Remote. Formal Desktop and live Provider execution remain unverified.

## Alternatives considered

- Reuse the P2.1 JSON file as the formal store: rejected because it was an isolated prototype store, not Harness Host persistence.
- Add a new standalone media service: rejected because Business Workbench already owns Host storage and bounded business Remotes.
- Add real model adapters in this stage: rejected because credential reuse, upload permissions, and generation costs require a separate approval and verification stage.
- Reuse or copy Obsidian plugin implementation: rejected because its package is marked private/unlicensed and its reuse rights are not established.

## Consequences

- Host persistence survives Client route unmounts and is independent of the isolated PoC directory.
- Existing P2 JSON is left untouched and remains readable by the old PoC; automatic import is not implemented.
- The current UI can validate session switching, parent selection, Mock version creation, and Host task polling, but it cannot show generated media.
- The service is available in source and test Host builds only; the already-running formal Host has not been restarted, and Desktop integration is not runtime-verified.
- Publication or distribution must not include private Obsidian code or third-party assets without rights clearance.
