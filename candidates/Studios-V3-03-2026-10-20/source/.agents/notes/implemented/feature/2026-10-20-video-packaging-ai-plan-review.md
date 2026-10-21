# Agent Note: Video Packaging AI plan review

Status: implemented

English | [中文](2026-10-20-video-packaging-ai-plan-review.zh.md)

## Problem

Video Packaging had no controlled path from transcript evidence to editable timeline proposals. The visible model picker also risked implying that any configured chat route could safely analyze video content.

## Decision

The Host exposes a read-only Video Packaging model catalog from the registered LLM providers. It returns provider/model identifiers and names, marks invocation unavailable until a dedicated Video Packaging Agent route exists, and reports authentication as not inspected. It does not resolve credential values or reuse the XHS `restrictedAgent` or `commentAnalysis` routes. The Client keeps real model invocation disabled.

The editor accepts SRT/VTT transcript evidence and labels rule-generated plans as fixtures. Library mode searches only confirmed assets with explicit reuse permission. Free mode emits only the editor's existing title, highlight, and information-card component types. Plans are validated for transcript evidence, component support, unique proposal IDs, timing, and canvas bounds before preview. Users may edit and select proposals; only selected proposals are added, and applying them appends new components without replacing existing work. Draft plans and review status are saved with the packaging project. Rejecting a plan changes review metadata only.

## Alternatives considered

**Reuse the XHS `restrictedAgent` route.** Rejected because that route is scoped to a different business workflow and its approved inputs and instructions do not cover video packaging.

**Call `commentAnalysis` or a media-generation model.** Rejected because neither is a Video Packaging analysis route; media-generation capabilities do not provide transcript planning semantics.

**Expose model names as available based only on registry presence.** Rejected because provider/model registration does not establish credentials, authorization, a dedicated execution route, or safe request controls.

## Consequences

Users can inspect currently registered provider/model metadata and complete the plan-review-to-timeline workflow with clearly labeled fixture output. No real model request is sent. Real model invocation remains unavailable until a dedicated Session-backed route, safe authentication status, bounded input/output controls, and explicit deployment configuration are provided.

## Testing

Focused tests cover empty model registration, plan validation, duplicate proposal rejection, selective application, and preservation of existing timeline components. Host library build, Client contract typecheck, and Client bundle build are run for the isolated candidate.
