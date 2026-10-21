# Agent Note: AIHOT evidence analysis protocol

Status: implemented

English | [中文](2026-10-17-aihot-evidence-analysis-protocol.zh.md)

## Problem

AIHOT public Items and Stories need a bounded, source-traceable representation before structured model analysis can be added without confusing official facts, weak associations, and model inference.

## Decision

`business-workbench/src/aihot-evidence-analysis.ts` accepts A3-02 normalized Item and Story records, creates a pack limited to one of each and five reports, retains field-level API provenance, keeps Item and Story metrics separate, and accepts confirmed links only when the stated report-ID or exact-URL evidence exists in the included records. Possible links and source conflicts remain unverified. Text and total UTF-8 input size are bounded.

`AihotAnalysisRunner` snapshots the complete pack and calls the existing tool-free `HarnessRestrictedAgentRuntime` with a new Agent Session. It requires `SessionPersistence`, records the system prompt and model route in `request/header`, records the serialized task and Evidence Pack in `user/message`, flushes the completed Session, and returns the Session ID. The existing base `session-checkpoint-policy` persists the request prefix before Provider dispatch. Ambient runtime context and tools remain excluded. Caller cancellation and timeout use the Agent's native cancel path, so `turn/end` distinguishes an aborted turn from a Provider failure. The runner validates the recorded response against the exact pack snapshot and returns only allowlisted failure codes.

The Session log contains the model-visible input, response chunks, and turn outcome. The structured validation verdict is deterministically recomputed from the stored response and pack; it is not written as a separate Session event. No Remote, UI, automatic caller, or real Provider execution is wired.

## Alternatives considered

- **Call `ctx.llm.stream()` without a Session** — rejected because model-visible input must be reconstructable from the Session log; the existing XHS exception does not automatically authorize a second stateless exception.
- **Reuse the current Session** — rejected because it would mix public AIHOT evidence with private conversation history and create misleading ownership.
- **Add a new Remote, Agent framework, or persistence layer** — rejected because the existing Agent Registry, Session log, and configured persistence provide the execution path; the internal runner is not exposed to a product caller.

## Consequences

The evidence protocol and Session replay path are testable without provider credentials, network calls, or user data. Real public AIHOT records can be packed locally, while fixture-model tests verify that request inputs and outputs survive Session reload. A real Provider request and Desktop execution are not performed; invoking the internal runner against a configured Provider can incur ordinary usage charges and requires explicit user confirmation.
