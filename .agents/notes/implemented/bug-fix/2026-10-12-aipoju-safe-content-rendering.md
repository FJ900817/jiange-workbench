# Agent Note: Aipoju safe content rendering

Status: implemented

English | [中文](2026-10-12-aipoju-safe-content-rendering.zh.md)

## Problem

Breakout topic bodies may contain HTML markup, while Radar must keep untrusted content readable without executing it.

## Decision

The Aipoju Renderer converts topic content to plain text, preserves paragraph and line breaks, decodes common text entities, and removes markup before React renders the value. Images come from the separately projected `images` field and use a neutral fallback when loading fails.

## Alternatives considered

**Render the source HTML after sanitization.** Rejected because it adds an HTML execution surface and is unnecessary for readable text and images.

**Use image URLs parsed from body markup.** Rejected because the observed topic detail supplies images separately; the Renderer accepts only the Host-projected image list.

## Consequences

Body text remains readable without rendering source markup, and images remain independent of body formatting. HTML-specific styling is not preserved; unavailable or failed images do not create fabricated content.

## Verification

The public Radar test checks HTML-to-text rendering, inert script and image markup, and separate image display. Formal Desktop inspection confirmed a real topic image loaded from the projected image list and confirmed that HTML tags in another real topic body were previously visible as text.
