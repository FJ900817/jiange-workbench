# Agent Note: Video Packaging restricted AI plan entry (V3-03R)

Status: implemented

English | [中文](2026-10-22-video-packaging-restricted-ai-plan.zh.md)

## Problem

V3-03 shipped the Video Packaging editor with a dangling AI plan call: the client
dispatches `/api/ai/plan` to `bridge.runPlan()`, but no Host Remote implements it and
the `RunVideoPackagingPlanRequest` type was never defined. The model directory listing
(`listVideoPackagingAiModels`) exposes only a free-text `status`, giving the operator
no honest signal for whether a model is registered, credentialed, routable, or
blocked — and by what named reason. Any future model invocation needs a bounded,
default-off entry whose retry and cost envelope can be proven before it runs.

## Decision

The Business Workbench owns a restricted AI plan entry for Video Packaging.
`requestVideoPackagingAiPlan` accepts a frozen input (authorized video reference,
SRT/VTT transcript, requirements text, library/free mode, canvas size, approved
material summaries) and returns structured packaging-plan suggestions only. The
model never writes the project, never renders, never batches materials. In this
stage the entry always rejects with `VIDEO_PACKAGING_AI_DISABLED`; the invocation
switch defaults to off and zero provider requests are sent.

Model readiness is a four-grade ladder, not a free-text status:
`registered` (visible in the registry) → `configured` (credential `describe()`
confirms a usable credential; the secret is never read) → `routable` (a dedicated
restricted route exists, is enabled, and retry is proven bounded) → `not-callable`
with a named reason (`no-credential`, `route-disabled`, `retry-unbounded`,
`unknown-provider`, `unregistered`). The current stage grades every listed model
`not-callable` with its reason; this is the honest product state.

Retry/cost evidence is produced by `proveVideoPackagingRetryBounds`, which reads
only the public `ctx.llm.providerRetryPolicy(provider)` and names the inspected
layers (`dsh-llm-retry`, direct-fetch adapter, restricted-agent single turn).
An `'always'` retry policy is unbounded and keeps the route not ready; a provider
that cannot be inspected reports `unknown` rather than a fabricated bound.

The client bridge gains the missing `runPlan` method, wired to the new Host
Remote; the editor's dangling call now resolves to an honest rejection instead
of a type error. No real model invocation, no Desktop deployment, and no
credential plaintext anywhere in this stage.

## Alternatives considered

- Leave `runPlan` dangling and ship V3-03R as Host-only: rejected because the
  editor already calls it; an unimplemented bridge method is a latent runtime
  failure, not a clean seam.
- Grade readiness as a boolean: rejected because a boolean hides the reason a
  model cannot run; the operator needs the named blocker to act on it.
- Read the credential to "verify" it: rejected; `describe()` confirms usability
  without ever touching the secret, which is the entire point of the red line.
- Enable the route with a fixture model: rejected; a fixture behind the real
  entry would let callers believe invocation works. The entry rejects loudly
  until a real, bounded, user-authorized route exists.

## Consequences

- The `/api/ai/plan` editor route now reaches a real Host Remote and receives a
  structured `VIDEO_PACKAGING_AI_DISABLED` rejection; the UI can surface the
  named reason instead of failing silently.
- `listVideoPackagingAiModels` returns the four-grade ladder; every model is
  `not-callable` until credentials, route, and retry evidence exist.
- Retry evidence is inspectable without credentials or network; uninspectable
  providers report `unknown`, never a fabricated bound.
- Enabling real invocation is a separate, user-authorized stage (P1); this stage
  sends zero provider requests by construction.
- The Typert remote-client types must be regenerated (host build) after adding
  the new Remotes; the client typechecks against the generated namespace.
