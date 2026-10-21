# Agent Note: Studios media creation uses independent editor and history scrolling

Status: implemented

English | [中文](2026-10-18-studios-media-creation-independent-scroll.zh.md)

## Problem

The media creation route fills the finite Studios workspace view, but its content root and grid expanded to their content height. The history list declared overflow without a bounded parent height, so long sessions extended the page instead of scrolling independently from the model settings and prompt editor.

## Decision

Image Studio and Video Studio place the model settings and prompt editor in the left column and the continuous history in the right column. The route root fills the available workspace height; the two-column grid receives the remaining height after the header, and the composer and history list scroll within their own columns. The history list contains its scroll chaining so wheel or trackpad input at its edge does not move the workspace page.

At widths up to 720 CSS pixels, the editor and history stack vertically. The route can scroll as a whole, while the history keeps a bounded height and its own scroll region. Existing session, artifact selection, reference, and revision state remains owned by the same React component and Host Remote.

## Alternatives considered

**Keep the page as the only scroll container.** Rejected because long histories would move the settings and prompt out of view, preventing independent review while editing.

**Assign a fixed pixel height to the history.** Rejected because available workspace height varies with the Shell and viewport; the grid can use the route's remaining height without a fixed desktop value.

## Verification

The focused Client test, Client typecheck, and Client bundle build cover the changed route. An isolated real Harness Host and formal Client browser run verify both modalities, independent history scrolling, artifact selection and reference display, revision links, and zero Provider requests. Formal Desktop deployment remains separate and requires a later approved rollout.

## Consequences

On desktop, both columns remain available while history scrolls independently; the settings column also scrolls independently if its controls exceed the available height. At narrow widths the page scrolls vertically and the bounded history remains independently scrollable. No Host API, persisted data, media task behavior, or formal Desktop resource changes.
