# Agent Note: Stateless XHS Comment Analysis

Status: implemented

English | [中文](2026-10-06-xhs-radar-stateless-comment-analysis.zh.md)

## Problem

XHS Radar needs to derive reviewable demand insights from a user-selected note's loaded comments, but restricted Agent execution creates a persistent Session containing prompt and response events. Storing external-user comments in those Session logs conflicts with the approved data-minimization requirement for this feature.

## Decision

`analyzeXhsComments` is a scoped exception for XHS Radar V0.4 comment-demand analysis only. The Host calls the existing `ctx.llm.stream()` route directly with the independent `business-workbench.commentAnalysis` configuration, fixed to `deepseek-official` / `deepseek-v4-flash` in the Web profile. It never reads or falls back to the Agent default selection. Each request explicitly sets `reasoningEffort` to `off` and `maxTokens` to `4096`; the finite output cap is shared by reasoning and final text, so the explicit effort prevents deployment defaults from consuming it before a JSON answer. The rationale and isolated-provider evidence are in the [reasoning-budget experiment](../../../../docs/experiments/business-layer-v0.1-phase4c1t-reasoning-budget.md). Missing, invalid, and unregistered routes return distinct content-free error codes. It creates no Agent or Session and supplies neither `sessionId` nor tools. The model request contains only note title, note text, and at most ten non-empty comment texts assigned temporary evidence references. Prompt and Host validation cap insights at three per category, fifteen total, and 120 characters per insight. The Host validates output categories, insight lengths, and evidence references before returning sanitized insights and Host-computed confidence.

Response collection appends `text-delta` chunks and uses a completed text `block-end` only for indexes that emitted no non-empty text delta. Reasoning, tool, usage, and finish chunks are not response text. A successful empty completion returns `EMPTY_RESPONSE`; a Provider finish error with that code returns `PROVIDER_EMPTY_RESPONSE`; max-token finish and oversized output have distinct provider-response codes; and only non-empty unparseable text returns `ANALYSIS_PARSE_ERROR`.

Raw comments, prompt, and provider response remain transient in the request's memory. A 50-entry process-local LRU stores only validated insights under a SHA-256 fingerprint of note identity and normalized content. The feature writes no comment text, prompt, raw response, or credential to Session logs, workspaces, files, or ordinary logs. On failure, the Host returns and logs only the configured route, error code, failure stage, whether `llm.stream()` ran, request/response observations, HTTP status, duration, and stream/response counts; the existing analysis panel displays those fields without exposing model or comment content. Comment text is still sent to the configured model provider; the no-persistence guarantee applies to Harness-local storage, not provider-side processing.

This exception does not change the Session-reconstructability rule for any other model request.

## Alternatives considered

**Use `restrictedAgent` and dispose its Session after the run.** Rejected because disposal does not remove the persistent Session event log containing prompt and response.

**Add an independent model SDK or provider endpoint.** Rejected because it would duplicate route and credential management instead of using the existing Harness provider.

**Persist comments in a new analysis record.** Rejected because the first release needs only an in-memory result and must not retain raw external comments.

## Consequences

The feature can analyze one note without creating Session history and can cache only validated results for the current Host process. The XHS route is independent from the Agent default and must resolve in the active Provider registry. Request status is `confirmed` only when a provider HTTP status or stream event was observed, `not_started` when `llm.stream()` was not called, and otherwise `unknown`. Cache loss on Runtime exit is intentional. Operators must explain that comments are sent to the configured provider even though Harness does not persist them locally. Evidence references are valid only for the current loaded comment set and are resolved back to the displayed comments in the Client.
