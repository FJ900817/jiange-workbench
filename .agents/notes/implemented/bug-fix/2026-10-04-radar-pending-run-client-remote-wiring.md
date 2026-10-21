# Agent Note: Radar Pending-Run Client Remote Wiring

Status: implemented

English | [中文](2026-10-04-radar-pending-run-client-remote-wiring.zh.md)

## Problem

Radar's pending-analysis surface could not use the Host's authenticated pending-run Remotes because the conversation Client projection passed only the intelligence and review methods.

## Decision

The `ui-conversation` Client projection forwards `processLocalAIHOTPending`, `readLocalAIHOTPendingRun`, and `listLocalAIHOTPendingRuns` through the existing `localAIHOT` callback. Each callback preserves the Host Remote result on success and maps a Remote error to `unavailable`. The UI remains the only caller of the start operation, behind its explicit confirmation action.

## Alternatives considered

- **Call the Process API directly from the Web Client**: this would expose the process credential to the browser and bypass the existing Host credential provider.
- **Keep the pending-run controls unavailable**: this preserves a read-only UI but leaves the already-deployed Host operations unreachable from Radar.

## Consequences

Radar can read pending-run history and detail and can submit only the request explicitly confirmed by the user. The Client does not receive the process credential. The integration tests pin all three callback routes; production acceptance must still stop before the confirmation dialog's start button.

## Testing

`apply-inject.client.spec.tsx` verifies the Client callback projection against a fake Host Remote. Radar surface tests continue to verify the selection and confirmation behavior without invoking the production Process API.
