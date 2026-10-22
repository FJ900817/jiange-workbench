# Agent Note: P1 Video Packaging references real aikou library components via libraryRef

Status: implemented

## Problem

The workbench's AI plan ("施工单") only produced coarse `title|highlight|info`
buckets, disconnected from the four component libraries Feng owns. The
libraries' real components — their tested visuals, style discipline, and the
导演手册 decision table — were not addressable by the AI, so every plan needed
manual re-mapping to library assets.

## Decision

`PackagingProposal` gains an optional `libraryRef{lib, componentId, params,
state?}` so a plan names a real library component. P0 wires the first library
only: `AI口播包装库` (aikou), 8 whitelisted overlay components (tag, qa, stat,
months, numlist, strips, counter, tiles); the library source is read-only and
never modified. The `style` field is locked to the `neutral-editorial` preset —
the AI may change text, timing and position only; any invented color/size is
rejected by `validatePackagingPlan`. The library's 导演手册 decision table is
injected into the model system prompt (`AIKOU_SELECT_PROMPT`); a plan-level
lint (`validateAikouLibraryRefs`) ports the library's `lint.py` discipline and
rejects unknown components or illegal params. Rendering is split: preview uses
the HTML renderer (`renderAikouComponent`); the Host PNG export draws with
Canvas 2D (`drawAikouComponent`) because SVG `foreignObject` rasterization
taints the canvas in Chromium and `toBlob` throws. The two renderers share
timing math (progress/out3/io2) and are visually matched, not pixel-identical.

## Alternatives considered

- Route A (per-component Remotion/whole-segment render + transparent overlay)
  for P0: only aikou is HTML-native; talkcraft/shotcraft transparency is still
  unverified — deferred to P1/P2.
- Reusing the aikou `compose.py` full-film engine: wrong granularity for
  timeline widgets.
- Letting the AI fill `style` freely: breaks the library's style discipline;
  locked to the preset instead, with a params-whitelist lint.
- Importing `AIKOU_SELECT_PROMPT` from the client package into
  `video-packaging-model.ts` (Host) bends the client AGENTS.md cross-package
  rule; accepted because the imported value is a pure text constant with no
  browser dependency.

## Consequences

- Plans can now reference real, tested component visuals; Feng adjusts text,
  timing and position without rebuilding visuals.
- Two renderers to maintain (HTML preview + Canvas 2D export); new aikou
  components must be added in both, plus the `AIKOU_COMPONENTS` whitelist and
  the embedded-editor.ts string refresh (currently a hand-rolled Node
  one-liner; a checked-in generator script is the durable fix).
- The model gate stays `VIDEO_PACKAGING_AI_DISABLED` — real-AI naming needs
  Feng's separate authorization.

## Testing

- 23 unit tests pass (client aikou-lint 9 + plan 2; Host video-packaging 9 +
  model 3; 4 files, 23 tests).
- Cloud real-machine verification (`~/workspace/p1-verify/`, 19/19 steps):
  isolated Host + headless Chromium walked AI panel → fixture plan naming
  aikou:tag/qa/numlist → timeline ("AI口播 tag") → preview overlay → save →
  reload → FFmpeg render; the rendered MP4 frame visibly contains the tag
  component. Screenshots in `~/workspace/p1-verify/shots/`.
