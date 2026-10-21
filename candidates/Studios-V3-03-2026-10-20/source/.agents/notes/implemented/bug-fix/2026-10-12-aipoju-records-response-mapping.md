# Agent Note: Aipoju records response mapping

Status: implemented

English | [中文](2026-10-12-aipoju-records-response-mapping.zh.md)

## Problem

The authenticated Breakout CLI returned valid topic-list JSON, but Radar treated the response as invalid because the adapter did not recognize the actual list field.

## Decision

The adapter reads list rows from the observed `records` field and validates required topic identifiers while allowing empty titles and absent optional fields. It maps the observed source URL, author, image, and interaction-count fields into the existing topic projection. Errors retain separate safe codes for process, timeout, output limit, JSON parsing, and schema mapping; the temporary structure diagnostic is not part of the Host response or Renderer UI.

## Alternatives considered

**Accept arbitrary arrays found recursively in the response.** Rejected because a response may contain unrelated arrays; list extraction uses the observed, named `records` field and the existing known list envelopes.

**Treat every absent source field as an invalid topic.** Rejected because author, images, and interaction counts are optional; only the topic identifier and title field type are required, and an empty title remains valid.

**Keep structure diagnostics in the private bridge.** Rejected because the real schema was established from the authenticated Desktop request; the shipped bridge only needs normalized topic data and safe error codes.

## Consequences

The verified paged response can now populate latest and keyword results without changing the CLI invocation or private IPC protocol. A future source schema change still fails as `SCHEMA_MAPPING_ERROR` rather than exposing raw output or inventing fields.

## Verification

The formal Desktop Host returned exit code zero, valid object JSON, and the list under `$.records`; the prior adapter failed at list extraction before topic normalization. After mapping `records`, the formal Desktop loaded real latest topics and completed a real `AI工作流` search. Focused tests cover the observed envelope, optional fields, empty titles, safe projection, and distinct process/timeout/output/parse/schema failures.
