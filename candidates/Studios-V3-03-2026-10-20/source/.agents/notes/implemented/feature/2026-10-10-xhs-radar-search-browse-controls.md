# Agent Note: Xiaohongshu search browse controls

Status: implemented

English | [中文](2026-10-10-xhs-radar-search-browse-controls.zh.md)

## Problem

Xiaohongshu search results need a compact browse layout and an explicit way to select the source's supported ordering.

## Decision

The search form defaults to the source's `综合` ordering and passes the selected `sort_by` value through the fixed Host search request. Changing ordering after a search starts a new request; the Client never reorders results to imitate source sorting. Cards use three columns at ordinary desktop widths, four at wide widths, two at narrow widths, and one on very narrow screens. Covers use a 3:4 frame with `object-fit: contain`. The Renderer displays every mapped row returned for the current request; the Host caps a response at 40 rows, and the source schema exposes no pagination input. Search failures retain their existing business status and carry only a closed error code, failure stage, elapsed milliseconds, and optional HTTP status. The Client maps carrier failures to `REMOTE_TRANSPORT_ERROR`; the carrier does not safely distinguish an unreachable Host from other Remote transport failures. Cover diagnostics render only in development builds.

## Alternatives considered

**Sort results in the Client.** Rejected because interaction counts or timestamps would not reproduce the source's supported ordering.

**Add a “load more” action by repeating the same search.** Rejected because the source schema has no page or cursor field, and repeated requests could duplicate the first batch while implying pagination.

**Keep a fixed two-column layout.** Rejected because it wastes space on desktop and does not adapt to the available viewport.

## Consequences

Search ordering is source-defined and costs one new search request when the user changes the selected ordering after a prior result. The first response remains bounded; pagination is not presented until the source exposes a real paging parameter. At widths below the two-column breakpoint, cards become a single column. Search UI errors identify the safe failure stage without rendering raw exception or source response text.

## Testing

Host adapter tests assert the exact `filters.sort_by` request, verify that 25 returned rows are not silently truncated to 20, and cover source timeout, unavailable, upstream, and response-mapping diagnostics. Client tests verify the default and selected sort, a new request on sort change, safe failure details for Host and Remote errors, responsive CSS breakpoints, the 3:4 contain frame, and the production diagnostic-panel exclusion.
