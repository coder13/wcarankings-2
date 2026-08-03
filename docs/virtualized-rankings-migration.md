# Virtualized Rankings Migration Plan

This document records the plan for replacing the production rankings scroll
engine with the simpler sliding-window design proven in the `/virtualization`
playground.

## Direction

- Treat the playground as disposable development code. Copy its design into
  production-specific modules instead of turning the playground into a generic
  shared engine.
- Preserve the playground's small surface: one virtual-rankings hook owns the
  physical window, range query, row enrichment, recentering, jumping, and
  expandable-row geometry.
- Keep the existing `RankingsExplorer` context. Do not introduce production
  providers solely for the virtualizer or rankings API.
- Build the replacement alongside the production code, but never mount both
  scroll engines at once. Cut over only after the new path has feature parity.
- Delete the old window, pagination, page-loader, navigation-session, viewport,
  and scroll-motion machinery after the cutover. Delete the playground when it
  is no longer useful.

## Validated playground decisions

The following are no longer open design questions:

- Use TanStack's window virtualizer with a small, recentered physical window.
- Map local virtual indexes to global indexes with `baseIndex`.
- Keep row heights deterministic. The playground currently uses a 65px base
  row and a 248px expanded row.
- Model expansion with at most one expanding transition and one collapsing
  transition, driven by one shared animation clock.
- Use the same expansion math for row size, global offsets, inverse offset
  lookup, recentering, jump targets, and physical window height.
- Use one aligned range query whose response is keyed by global zero-based row
  index. Tables do not know about API pages.
- Keep jump animation and interruption behind
  `useInterruptibleWindowScroll`.
- Let TanStack use its normal window-offset observer. Perform the
  application-specific recenter in a React effect with current `baseIndex`
  state; do not put recenter side effects inside `observeElementOffset`.

The playground values—500 physical rows, a 50-row cache bucket, a 100-row
recenter edge, and a 250-row recenter target—should begin as explicit production
constants and can be tuned without changing the architecture.

## Production API

The production integration should be centered on one hook:

```ts
const rankings = useVirtualRankings({
  datasetKey,
  filters,
  initialData,
  listOffset,
  api,
  expandableRows,
});
```

Its page-facing result should remain small:

```ts
{
  items,
  totalHeight,
  currentIndex,
  expandedIndex,
  jumpToIndex,
  toggleExpanded,
}
```

`jumpBy`, `jumpToStart`, and `jumpToEnd` are trivial commands built on
`currentIndex`, `total`, and `jumpToIndex`; they do not need separate navigation
engines.

Put this result into the existing `RankingsExplorer` context so the table,
footer, search, Vim controls, and keyboard shortcuts can consume it directly.
`baseIndex`, raw virtualizer state, and animation refs stay private unless a
development-only debug view needs them.

## Production range adapter

Keep the playground's swappable API shape:

```ts
type RankingsApi = {
  cacheKey: string;
  fetchRange(request, signal): Promise<{
    total: number;
    dataVersion: string;
    rows: Record<number, RankingEntry>;
  }>;
};
```

The record key is the global zero-based ordering index. Consumers should be
able to retrieve a row with `range.rows[globalIndex]` without calculating its
source page.

For the first production implementation, adapt the existing 50-row page
queries rather than changing the server API:

1. Align `rangeStart` down to a 50-row boundary.
2. Request enough existing cached pages to cover the 500-row physical window
   plus at most 49 rows of alignment slack.
3. Merge those pages into one `rows` record keyed by global index.
4. Return `total` and the dataset/cache version with that record.

This adapter may internally use `queryClient.fetchQuery`, preserving the
existing page cache and request deduplication. A native range endpoint can
replace it later without changing the scroll engine.

At the hook level, use one `useQuery` for the aligned range. Its key must include
the complete dataset/filter key, aligned start, count, API cache key, and any
saved-list version. Carry previous range data only while moving within the same
dataset. A filter change must never reinterpret rows from the previous dataset
at the same global indexes.

The initial production version should fetch the whole bounded physical window,
matching the playground. Narrowing requests to only mounted rows can be
considered later if measurements show it is necessary; it is not worth
reintroducing page/range orchestration before the simpler version is proven.

## Sliding window and scrolling

- Set the virtualizer count to `min(windowRows, totalRows)`.
- Use `getItemKey(localIndex) => baseIndex + localIndex`.
- Convert every local item into a global item before exposing it.
- Recenter near either physical-window edge by calculating the current global
  pixel offset, selecting a new `baseIndex`, synchronously committing the new
  base, and restoring the equivalent physical scroll offset.
- Finish any row-height transition before rebasing the physical window.
- Preserve fractional pixel offsets; round only debug text.
- Route top, end, relative jumps, WCA ID jumps, search matches, Vim commands,
  and platform keyboard shortcuts through `jumpToIndex`.
- For distant jumps, place the target near one-third of the viewport, replace
  the physical window immediately, and animate at most a bounded number of rows
  toward the target.
- Cancel a jump animation on direct user scrolling or another navigation
  command.

The default TanStack window observer should continue supplying scroll position
to the virtualizer. The separate recenter effect exists only for the sliding
window and deliberately receives fresh React state rather than relying on
long-lived observer closures.

## Expandable person row

The fixed-height, single-row expansion strategy is now proven in the
playground and should be copied into production.

`useSingleExpandedVirtualRow` owns:

```ts
{
  expandedIndex,
  rowSize,
  offsetForIndex,
  indexAtOffset,
  toggle,
  finish,
}
```

Its model is intentionally bounded:

- `expandingRef` tracks the current extra height of the incoming row.
- `collapsingRef` tracks the current extra height of the outgoing row.
- One Motion progress value drives both transitions.
- A settled expanded row contributes the full fixed extra height.
- Row size adds contributions belonging to that row.
- Row offset adds contributions from earlier rows.
- Inverse offset lookup handles four explicit regions: before the first
  animated row, inside/after the first row, inside/after the second row, and the
  remaining normal rows.
- Rapid retargeting starts from the two current transition heights. A third
  stale partial row may snap closed; the product only guarantees one expanding
  and one collapsing row.

The virtual ranking item should expose expansion rendering data, preferably
named `expandedContentHeight` and `expansionProgress`, rather than exposing the
transition refs. The row uses that height for its details container and derives
opacity from the same progress.

Do not use `ResizeObserver` or `measureElement` for this fixed-height path.
`resizeItem` is the single authority for animated row geometry. If details ever
become variable-height, reassess this contract instead of layering measurement
onto the fixed-height engine.

## Ranking identity and navigation

- Treat the API's internal ordering position as the virtual index.
- Translate it to a zero-based index at the production range-adapter boundary.
- Keep tied public ranking numbers as display data only. Never use them as
  unique virtual indexes.
- Keep sub-rank/internal ordering completely out of user-facing text, labels,
  URLs, and search output.
- Make WCA ID locate and search responses include the internal target position.
  Pass that position directly to `jumpToIndex`.

The new range loader eliminates most special navigation-window requests. After
a locate or search match produces a target index, rebasing the sliding window
causes the ordinary range query to load the destination. The old
`getNavigationWindow`, `getPersonWindow`, `getDistantSearchWindow`, and
`getEndWindow` paths should not move into the new engine unless a demonstrated
API limitation requires one of them. Search and locate remain distinct because
they discover indexes rather than load visible rows.

## Dynamic list offset

The production header, notices, list controls, and membership-request content
can change the list's document offset, so the playground's hard-coded
`LIST_OFFSET` cannot move into production.

- Extract the useful measurement from the current `useRankingViewport` into a
  small `useRankingListOffset` hook.
- Keep list offset as local layout state, not ranking-window data.
- Observe only changes that can move the list: viewport resize/orientation and
  the relevant header or pre-list layout changes.
- Feed the measured value into TanStack's `scrollMargin` and every physical
  jump/recenter calculation.
- Preserve the same global row anchor when the offset changes while scrolled.

This measurement concern stays separate from range loading, filter state, and
row expansion.

## Filter and dataset changes

When any dataset-defining value changes:

1. Cancel the active jump animation.
2. Finish or clear the active row expansion.
3. Reset `baseIndex` to zero.
4. Scroll the physical page to the new list offset.
5. Resolve rows through the new dataset-specific range key.

The reset should be keyed from one stable `datasetKey`, not recreated through
several effects watching individual filters. Previous data may remain visible
only when it is explicitly marked as belonging to the old dataset. Do not use
unconditional `keepPreviousData`, because rows at the same global indexes could
otherwise momentarily display competitors from the previous filters.

## Hydration and loading

The production page has server-provided initial data, unlike the playground.
Define the hydration behavior before removing `useRankingViewport`:

- Seed the range/page cache from `initialData` using the same dataset key.
- Render a deterministic initial slice whose keys and geometry match the first
  client virtual range.
- Switch to TanStack virtualization after hydration without moving the first
  visible row.
- Preserve overlapping cached rows while a new range loads.
- Render an explicit lightweight loading row only where the requested global
  index is genuinely absent. Do not restore the old skeleton-overlay engine.

## Production cutover

1. Add the production `RankingsApi` range adapter over existing 50-row queries.
2. Copy `useSingleExpandedVirtualRow` and
   `useInterruptibleWindowScroll` into production-local modules.
3. Build `useVirtualRankings` with the bounded window, range query, enriched
   items, recenter effect, and jump controller.
4. Extract and connect `useRankingListOffset`.
5. Adapt `ResultsTable` to render the enriched global virtual items, including
   fixed-height person expansion and list-member interactions.
6. Replace navigation planning with direct index commands. Connect the footer,
   search, WCA ID locator, Vim mode, focus behavior, and keyboard shortcuts to
   `jumpToIndex`.
7. Implement dataset-key reset and hydration behavior.
8. Verify feature parity for people, results, competitions, cities, saved
   lists, list-owner selection, notices, empty states, and loading/error states.
9. Switch `RankingsExplorer` to the new runtime in one cutover.
10. Remove `useRankingWindow`, `useRankingPagination`,
    `useRankingPageLoader`, `useRankingNavigationSession`,
    `useRankingViewport`, obsolete page-load/navigation-motion helpers, and the
    superseded `scrollEngine` code.
11. Delete special window-fetch helpers that no longer have callers.
12. Delete the playground after the production path is stable.

`useRankingDataRuntime` should become a thin composition of the production data
source, `useVirtualRankings`, and list-member management—or disappear if those
pieces read more clearly at the `RankingsExplorer` level.

## Verification

- Continuous manual scrolling in both directions across repeated recentering.
- Repeated `+5000` and `-5000` jumps followed immediately by manual scrolling.
- Top, end, WCA ID, search, Vim, and platform keyboard navigation.
- Tied ranking groups spanning multiple 50-row API pages.
- Cached, uncached, overlapping, and interrupted range loads.
- Filter changes while both the current and destination ranges are cached or
  uncached; no old-dataset row flashes.
- Expand, collapse, direct switching, rapid retargeting, and interruption.
- Expansion above, inside, and below a recenter boundary.
- Jumping and manual scrolling while a row is expanded.
- Header expansion/collapse, notices, list-management controls, orientation
  changes, and virtual-keyboard viewport changes.
- Hydration with server initial data and a cold client cache.
- Empty, short, and exact-page-size datasets, including end-of-list behavior.
- Mobile Safari, desktop Safari, Chromium, reduced motion, and dynamic header
  height changes.
