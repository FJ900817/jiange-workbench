# Agent Note: Xiaohongshu Radar Cover Resolution

Status: implemented

English | [中文](2026-10-06-xhs-radar-cover-resolution.zh.md)

## Problem

Xiaohongshu feed cards could receive a cover from only one of several upstream cover fields, and a remote image failure left the browser's broken-image rendering visible.

## Decision

The Host adapter resolves the first valid HTTP(S) cover from `urlDefault`, `url`, `urlPre`, then the first usable `infoList[].url`, normalizing protocol-relative URLs to HTTPS. The Renderer always reserves a 16:10 cover area and replaces missing or failed images with a neutral placeholder. No image proxy or image-byte persistence is used.

## Alternatives considered

- **Keep a single cover field and hide only missing values**: this misses valid upstream fallbacks and still exposes broken-image rendering when a remote request fails.
- **Add a Host image proxy**: no existing safe image proxy is available, and a new generic proxy would expand this narrow rendering fix and its network-security surface.

## Consequences

More upstream cover variants can render without changing the feed contract, and unavailable images no longer show browser error chrome or collapse card geometry. Direct remote loading remains subject to the source CDN and WebView policy; failed loads remain visibly but quietly unavailable.

## Testing

Adapter tests cover priority, HTTP(S) validation, protocol-relative normalization, `infoList` fallback, and no valid candidate. Client tests verify missing and failed covers use the placeholder and remove the failed `<img>` element.
