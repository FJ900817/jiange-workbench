# Agent Note: Host-mediated Xiaohongshu login

Status: implemented

English | [中文](2026-10-05-xhs-host-login-bridge.zh.md)

## Problem

The Xiaohongshu MCP login endpoint requires a local bearer credential and returns an authentication QR image, so a browser-facing component must not call the MCP service directly or retain credentials.

## Decision

`business-workbench` owns two fixed Host Remotes for login status and QR retrieval. The Host reads the shared owner-only `DSH_HOME/secrets/xhs-mcp-token` file and rejects non-regular, symlinked, non-owner, or non-`0600` files. The status Remote returns only the logged-in boolean; the QR Remote accepts only a bounded inline PNG and expiry. The Client has no generic MCP or HTTP proxy and keeps the QR only in component memory.

The Radar polls login status every 15 seconds while a QR is shown. The pinned upstream implementation creates a browser for each status call, so the prior three-second suggestion would repeatedly launch browser work. Client cancellation clears the QR and stops polling but cannot cancel the upstream four-minute QR browser session because no cancel endpoint exists.

The LaunchAgent configuration and credential have not been applied. The local wrapper and loopback binding remain a separate authorized deployment step.

## Alternatives considered

**Renderer-to-MCP HTTP** — rejected because it would expose a bearer token and local service port to browser code, and the MCP tool surface includes operations beyond the approved login pair.

**Use the MCP tool endpoint for QR and status** — rejected because the REST login endpoints return a bounded projection that the Host can validate without exposing generic tool invocation.

**Three-second status polling** — rejected because the pinned implementation creates a browser and page for every status check; a 15-second interval reduces repeated browser launches while preserving bounded login feedback.

## Consequences

The Host owns credential access and response filtering, while the UI can display the QR without disk or browser storage. The upstream QR browser may remain alive until its four-minute timeout after a user cancels the UI, and successful-login detection may lag by up to one polling interval. Applying the LaunchAgent still requires a wrapper and an MCP restart; loading the new Remote may require a Host Runtime reload.
