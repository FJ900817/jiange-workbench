# Agent Note: XHS Radar Search REST Contract

Status: implemented

English | [中文](2026-10-05-xhs-radar-search-rest-contract.zh.md)

## Problem

The Host search adapter called the MCP `search_feeds` tool and recursively guessed response list locations, so it did not enforce the Xiaohongshu v2.5.0 HTTP search contract.

## Decision

`searchXhsFeeds` posts `{ keyword, filters: {} }` to the fixed loopback `/api/v1/feeds/search` endpoint and accepts only `success: true` with `data.feeds` and `data.count`. For non-2xx responses, it inspects top-level `code`, `error`, and `details` only in memory and maps recognized timeout, browser, navigation, connection, and upstream patterns to closed diagnostic codes; browser/navigation and explicitly identified upstream-response failures use distinct Client-safe codes. Raw response text never enters logs or crosses the Remote. Search has a dedicated 75-second request timeout; login status and detail use 35 seconds. Feed fields remain nullable, and Host diagnostics record only HTTP status, response key names, success, count, and the closed error category.

## Alternatives considered

- **Keep the MCP search tool and broaden its response parser**: this preserves the wrong transport contract and continues accepting response layouts that the upstream HTTP endpoint does not define.
- **Let the Client call the local HTTP endpoint**: this exposes local source access and endpoint selection to the Renderer, bypassing the Host's fixed adapter.

## Consequences

Search uses one fixed Host-owned HTTP request while login status and note detail continue through their existing MCP tools. Its 75-second timeout allows the upstream browser search to use its documented wait budget with response overhead; a timeout maps to the existing `search_timeout` result without automatic retry. The ready result includes the upstream result count; diagnostics omit keywords, feed identifiers, tokens, response values, and note content.

## Testing

Adapter tests pin the POST URL, method, body, response path, count mapping, optional field handling, non-contract response rejection, safe classification of the upstream error envelope, and timeout handling without exposing its details. Client tests verify that the closed browser-failure code uses the existing search status UI.
