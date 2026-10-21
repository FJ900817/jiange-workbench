# Agent Note: SCYS Saved-Grant Reconnect Cooldown

Status: implemented

English | [中文](2026-10-14-scys-saved-grant-reconnect-cooldown.zh.md)

## Problem

One failed saved-grant reconnect was cached for the entire Host lifetime, so a later source-status request could not recover after a temporary network or service failure without entering the interactive OAuth action.

## Decision

The SCYS adapter keeps single-flight reconnect behavior and retries only classified transient network failures and HTTP 408, 425, 429, or 5xx responses when a later status request arrives after a Host-memory cooldown. Delays increase from two to four to eight minutes and cap at fifteen minutes. A successful reconnect clears the delay state. Missing or invalid credentials, callback registration errors, and authorization failures remain terminal for automatic reconnect; retry never starts OAuth or changes credentials.

## Alternatives considered

- **Keep one attempt per Host lifetime** — this prevents repeated requests but permanently strands a valid saved grant after a transient startup failure.
- **Retry on every status request** — this could create frequent MCP initialization traffic while the UI polls and would not bound load during an outage.
- **Run a background retry timer** — a timer would issue network calls without a later user-visible status check and add lifecycle work that the feed does not need.
- **Use the OAuth connect action for recovery** — that action starts an interactive authorization flow, so it is not a saved-grant reconnect mechanism.

## Consequences

The adapter retries only when the application next asks for source status after the cooldown. It retains safe failure diagnostics during the cooldown and does not infer that a generic unavailable state means authorization expired. Reauthorization remains an explicit user action. Backoff state is process-local and resets when a new Host starts.
