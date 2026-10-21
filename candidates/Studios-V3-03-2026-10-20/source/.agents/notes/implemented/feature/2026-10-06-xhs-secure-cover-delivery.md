# Agent Note: Host-mediated Xiaohongshu cover delivery

Status: implemented

English | [中文](2026-10-06-xhs-secure-cover-delivery.zh.md)

## Problem

Xiaohongshu cover URLs use HTTP and WKWebView blocks those image requests under macOS App Transport Security. Returning the signed source URL to the Renderer also exposes source request material beyond the Host.

## Decision

The Business Workbench Host registers each accepted search-cover or detail-image URL behind a random process-local reference during feed mapping. The Client receives only that reference and requests `getXhsCoverAsset`; it cannot provide a URL. The Host accepts HTTP or HTTPS only for the exact `sns-webpic-qc.xhscdn.com`, `sns-img-qc.xhscdn.com`, `sns-img-hw.xhscdn.com`, `sns-img-bd.xhscdn.com`, and `sns-img-qn.xhscdn.com` hostnames, rejects credentials and non-default ports, and manually revalidates every redirect before following it. Redirects must remain on the original hostname. It sends only an image `Accept` header with credentials omitted, applies one ten-second deadline across queueing, redirects, and body reading, rejects bodies over 2 MiB, and accepts JPEG, PNG, WebP, and AVIF only.

Successful bytes stay in a 50-entry process-memory LRU cache. Failed fetches are not cached, duplicate in-flight requests share one fetch, and a Host semaphore limits image downloads to four at once. The Remote returns the allowed MIME type, Base64 image bytes, an opaque cache key, and cache-hit status; it never returns the source URL. The Renderer creates a Blob URL and revokes it when the payload changes or the image component unmounts. Missing references and rejected fetches render neutral placeholders without a broken-image icon. Search covers use a fixed 3:4 frame with `object-fit: contain`; detail images retain their intrinsic ratio.

## Alternatives considered

**Load the remote source URL in the Renderer.** Rejected because WKWebView blocks the HTTP covers and the full signed URL would cross into Client memory.

**Add a generic URL image proxy.** Rejected because arbitrary URLs would create an unnecessary network-fetch capability and widen the SSRF surface.

**Change ATS or rewrite HTTP as HTTPS.** Rejected because the observed CDN does not serve the same signed cover over HTTPS, and a global transport exception would weaken unrelated WebView requests.

## Consequences

Image references are valid only in the Host process that mapped the feed or detail; a Host restart makes old references resolve to the neutral fallback. Image bytes use Base64 because the existing Remote transports structured JSON-compatible values. The byte cap limits each fetch, while the 50-entry LRU bounds entry count rather than total cache bytes. A source image on an unlisted hostname remains unavailable rather than widening the fetch policy.

## Testing

Host tests cover allowlist and local-address rejection, redirect revalidation, content type, declared and streamed byte limits, timeout budget, credential omission, cache reuse, and four-request concurrency. Client tests verify Blob URL rendering, neutral fallback, and URL revocation. Formal Desktop live-cover acceptance remains deployment verification.
