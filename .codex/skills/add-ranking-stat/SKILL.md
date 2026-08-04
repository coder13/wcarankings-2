---
name: add-ranking-stat
description: Design, implement, measure, document, and activate a new WCA Rankings statistic, ranking, metric, or leaderboard. Use when adding a new stat, projection, ranking endpoint, SQL build, filter cohort, or related cache path.
---

# Add Ranking Stat

This workflow makes a new statistic a complete product change. It covers the
stat definition, SQL projection, indexes, API, cache, release readiness, tests,
performance evidence, and the matching file in `docs/stats/`.

## Read first

Read these files before changing code:

- `docs/statistics-performance-guidelines.md` for latency, build, caching, and
  release rules;
- `docs/projection-architecture.md` for list rows, stat rows, rank semantics, source-table
  rules, and active projection contracts;
- `docs/stats/README.md` and the closest existing stat file;
- `scripts/projection-groups.mjs` and `scripts/mysql-schema.mjs` for build
  registration and deployment ownership.

Work in the dedicated branch and worktree. Preserve unrelated worktree changes.

## Workflow

### 1. Define the product contract

Write down these answers before writing SQL:

- What does the stat rank?
- What does one row represent?
- What are the result types, events, scopes, regions, genders, and date rules?
- What is the source of truth for each value?
- How are ties ranked and ordered?
- Which fields are public, and which fields exist only for stable paging?
- What count and empty-state behavior does the API need?

Keep internal positions out of user-facing labels and copy. Do not add
compatibility URLs or data shapes unless the user requests compatibility.

### 2. Choose the computation policy

Use the least precomputation that meets the product target:

- Prefer a request under 200 ms after the page window is bounded.
- Eagerly build common, high-use cohorts when the build cost is justified by
  usage.
- Use lazy ranking for narrow, uncommon, gender-filtered, date-filtered, or
  combinatorial cohorts when eager output would waste build time.
- Use a 400-row server-side window for lazy pages when it fits the query shape.
- Cache by generation, stat version, filters, order, and window start.
- Coalesce concurrent requests for the same cache key. Do not debounce the
  user interface as a substitute for server-side in-flight coalescing.

Record the decision in the stat's documentation. If evidence is missing, mark
the result as pending instead of calling it optimized.

### 3. Design the data path

Use a narrow, staged build:

1. Reuse an existing canonical fact or ranking projection.
2. Materialize a shared expensive stage once for related outputs.
3. Add only the columns needed for ranking, filtering, tie-breaking, and page
   selection.
4. Join names, countries, competitions, and other display data after paging.
5. Store counts with the ranking build or in a keyed count projection.
6. Drop import-only temporary stages after the build.

Do not rank from raw tables in a normal page request. Do not repeat a large CTE
or raw-result scan for every scope when one indexed stage can serve all scopes.
Use historical represented-region fields for historical statistics.

### 4. Measure before selecting indexes

For every main build query and request query:

- run `EXPLAIN` or `EXPLAIN FORMAT=JSON`;
- run bounded `EXPLAIN ANALYZE` when the local data supports it;
- record rows examined, access type, join order, filesorts, temporary tables,
  join buffers, and the reason for any full scan;
- add an index only when it matches a real filter, join, grouping, or page key;
- rerun the plan and benchmark after the index.

Full scans and window sorts can be correct during a full rebuild. The question
is whether they happen once on a compact stage or repeatedly at request time.
Review index storage and build time as part of the cost.

Do not import WCA data, rebuild raw tables, refresh rankings, or recreate the
local database without explicit authorization for that operation. Use existing
local data for read-only profiling when possible.

### 5. Integrate the projection

Update the smallest correct set of integration points:

- add SQL under `sql/ranking-projections/`;
- register the projection and dependencies in `scripts/mysql-schema.mjs`;
- assign it to the correct deployment group in `scripts/projection-groups.mjs`;
- add feature and readiness checks when the product needs gated activation;
- add the API query, validation, page contract, and count path;
- add generation-aware caching and in-flight request coalescing for lazy work;
- update release, transfer, activation, and retired-table handling if needed.

Do not put an unproven or planned stat in the active deployment group. Do not
leave a retired table in the published-table contract.

### 6. Add the stat record

Create `docs/stats/<stat-slug>.md` in the same change. Include:

- status: active, lazy, planned, or foundation;
- what it ranks and what one row represents;
- source tables and historical-region rules;
- public rank and stable page-order rules;
- required persistent and temporary indexes;
- `EXPLAIN` findings and why each full scan or filesort is acceptable;
- measured build and request timings, with dates and row counts;
- cache key and eager-versus-lazy policy;
- open measurements or activation blockers.

Use “measured” and “pending” labels. Never turn a handoff, estimate, or static
review into measured evidence.

### 7. Validate the change

Run the narrowest relevant checks first:

- `node --check` on every changed JavaScript or module file that still exists;
- projection architecture and result-projection tests;
- API, cache, feature-switch, release-plan, and activation tests when touched;
- `git diff --check`;
- the relevant `EXPLAIN ANALYZE` and request benchmark;
- a projection build timing that includes row counts and phase durations.

The projection runner must emit a heartbeat at least once per minute during a
long stat build. Keep completion and failure timing in the log.

Verify both the common path and the least common supported filter. Check tie
ordering, empty results, counts, cache misses, concurrent duplicate requests,
new-generation invalidation, and failure recovery.

## Completion checklist

Do not call a stat complete until all applicable items are true:

- [ ] Product definition and rank rules are documented.
- [ ] The source of truth and historical-region behavior are correct.
- [ ] Eager versus lazy policy is justified by measured or explicitly pending
      evidence.
- [ ] Build SQL uses shared stages and has no avoidable repeated scans.
- [ ] Query plans and indexes are recorded.
- [ ] Page, count, cache, and generation behavior are implemented.
- [ ] The stat is registered in the correct build and release groups.
- [ ] The stat file exists under `docs/stats/`.
- [ ] Focused tests and syntax checks pass.
- [ ] Build and request timings are recorded.
- [ ] Remaining uncertainty is listed as an open task, not hidden.
