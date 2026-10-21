# Agent Note: XHS Monitored Intelligence Projection

Status: implemented

English | [中文](2026-10-06-xhs-monitored-intelligence-projection.zh.md)

## Problem

Xiaohongshu Radar previously showed individual search results and sorted a mixed set without preserving which monitored keyword produced each result or separating observations from platform-wide claims.

## Decision

The Client keeps the five manually configured default keywords in component state and accepts at most five distinct values. An explicit refresh searches keywords sequentially once each, records each outcome independently, and retains only successful result batches in memory. `deriveXhsIntelligence` deduplicates exact feed identities and normalized duplicate titles, records matched keywords and signal types, and computes `likes + saves × 2 + comments × 3`. It emits at most eight one-card-per-feed candidates, choosing the primary type in cross-keyword, comment, collect, and engagement priority order; real candidates receive type coverage before remaining slots are filled by keyword coverage, score, and evidence count. The hot-observation view reads only those monitored batches; free-form search remains a separate on-demand exploration path. Comment-demand model analysis remains unavailable until a Host-owned path can preserve model-visible session evidence and bind every demand claim to returned comment references.

## Alternatives considered

- **Fetch all monitored keywords concurrently**: rejected because one bounded user refresh should not fan out browser-driven MCP calls at once.
- **Merge free-form search results into monitored observations**: rejected because those results do not share the configured monitoring scope.
- **Generate signals from historical growth or inferred trends**: rejected because the current source path has no historical observation series.
- **Sort all signal candidates only by engagement score**: rejected because the score can crowd out a real cross-keyword candidate or other signal category.
- **Render one card for every matched rule**: rejected because repeated cards for one feed obscure the distinct evidence types rather than adding information.
- **Call a model directly from the Renderer for comment analysis**: rejected because it would bypass Host ownership and could send source access identifiers or untraceable inputs.

## Consequences

Keyword refresh is bounded, sequential, user-initiated, and partially useful when one keyword fails. Signal cards describe only the current sample, merge matched types per feed, and do not imply a platform-wide ranking or temporal trend. Normalized title deduplication is exact after Unicode compatibility normalization, case folding, and punctuation/symbol/space removal; it does not infer semantic similarity. Results are in-memory and are not restored after the component unmounts. AI comment-demand extraction and evidence navigation remain deferred until an auditable Host analysis method exists.

## Testing

Projection tests cover exact-identity and normalized-title deduplication, matched keywords and signal types, primary-type priority, type coverage, the eight-card limit, null metrics, the weighted score, relative current-sample candidates, and the absence of trend language. Client tests cover five-keyword sequential refresh, distinct failed and empty outcomes, visible signal merging, hot-observation metadata, and rejection of more than five keywords.
