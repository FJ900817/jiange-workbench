# Agent Note: Radar controlled pending analysis

Status: implemented

English | [中文](2026-10-04-radar-pending-analysis-controlled-action.zh.md)

## Problem

Users needed a bounded, explicit action for existing AIHOT Articles in `pending_analysis`; the V1.3 validation runner was not product code.

## Decision

Radar submits only user-selected Article IDs to a dedicated Host-mediated AIHOT private action. The server rechecks state, caps the batch at three Articles, derives a maximum of fifteen paid attempts from the Article count, serializes execution, acquires database advisory locks, blocks protected Receipts 20 and 26, and compares canonical V2 fingerprints after processing. Normal model access remains disabled; only the action's async request scope receives permission. Human Review remains separate.

Runs, items, idempotency keys, request fingerprints, and PRE/POST safety snapshots use two separate technical tables that are not part of the canonical eight-table V2 business fingerprint. API startup marks unfinished runs interrupted without resuming them. Request attempts persist before provider transport and fail closed if persistence fails. The migration has not been applied, so database persistence remains unverified.

## Consequences

The UI can show selection, persisted progress, and reconnect queries without calling a shell runner or starting a Worker. Deployment requires a separate `WORKBENCH_PROCESS_TOKEN`; the Host does not reuse read or review credentials. The live production action remains a separate explicit authorization and was not run as part of implementation.

## Verification

See the V1.4 output report for Harness focused-test and full-build results. AIHOT dependencies are not installed, so server tests and typecheck could not run; migration static test and Node syntax checks pass, but the migration is not deployed. Formal Desktop UI acceptance, API deployment, token configuration, and a live run remain pending.
