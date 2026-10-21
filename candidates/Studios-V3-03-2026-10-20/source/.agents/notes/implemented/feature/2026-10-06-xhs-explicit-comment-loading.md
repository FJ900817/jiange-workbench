# Agent Note: Explicit XHS Comment Loading

Status: implemented

English | [中文](2026-10-06-xhs-explicit-comment-loading.zh.md)

## Problem

The default Xiaohongshu detail response can omit comments even when the note reports a positive comment count, leaving the user unable to inspect them.

## Decision

The Workbench reads default detail through the fixed MCP tool. When the user explicitly selects **Load comments**, the same product Remote posts to the fixed loopback detail API with reply expansion disabled, a ten-comment cap, and a dedicated 120-second timeout. The Host validates the successful response envelope, reads note data from `response.data.data.note` and comments from `response.data.data.comments.list`, and maps `userInfo` into nullable comment fields. An empty list is a ready result; an invalid envelope or failed HTTP request is an error. The Client distinguishes a zero-comment note, an unloaded positive-comment note, a pending request, returned comments, and a failed request.

## Alternatives considered

- **Load comments with every note detail**: this makes a costly browser scroll part of ordinary detail viewing, even when users only need the note itself.
- **Treat an empty default response as an empty note**: this hides the difference between a note with no comments and a source response that did not load its comments.
- **Expose a generic source request to the Client**: this would let the Renderer choose local endpoints or request options outside the fixed read-only product method.

## Consequences

Opening a note does not trigger comment scrolling. A user gesture is required for the bounded comment request; the UI displays at most ten returned top-level comments and never asks the source to expand replies. Notes reporting zero comments show an empty state, while a positive count with no loaded comments offers an explicit load action and reports request failure separately.

## Testing

Adapter tests pin the fixed endpoint, POST body, 120-second timeout, double-`data` envelope, `comments.list` mapping, empty-list success, optional-field nulls, and exclusion of source-only fields. Client tests verify that the explicit request occurs only after the user selects the load action and that returned comment text, author, and likes render.
