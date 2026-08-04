# Performance Guidelines for Rankings and Statistics

This document defines the performance requirements for new rankings, metrics,
statistics, and leaderboard views.

Use this document for every new statistic. Use it also when a change adds a
new scope, event set, gender filter, date filter, sort order, or result type.

The goal is simple:

- Serve common pages quickly.
- Do not spend large amounts of time building data that users rarely read.
- Build only the data that the product needs for its latency target.
- Use lazy loading for uncommon or expensive combinations.
- Keep every result correct, explainable, and versioned.

These limits are engineering targets. They are not absolute gates. A small
deviation can be acceptable when the usage is high and the measured trade-off
is clear.

## Performance targets

Measure both build time and request time on the reference WCA export and the
reference MariaDB version.

### Request time

Use these targets for a page request:

| Request type | Target | Required behavior when it is slower |
| --- | ---: | --- |
| Warm, precomputed page | p95 below 200 ms | Improve the query or add a measured index. |
| First lazy page | Preferably below 200 ms | Cache the result and coalesce equal requests. |
| Repeated lazy page | p95 below 200 ms | Keep the window in the process cache or durable cache. |
| Search or locate request | Preferably below 200 ms | Limit the candidate set before ranking it. |

Use p95 for the decision. Do not use one fast local request as proof that a
query meets the target.

Measure these cases separately:

- A warm buffer pool and a cold application cache.
- The first page and a deep page.
- World, continent, and country scopes.
- Each supported result type.
- Each supported gender set.
- A cache miss and a cache hit.
- Two or more equal requests that arrive at the same time.

If a query needs to rank a large filtered set, load the page window first.
Join names, countries, competitions, and other display data after the page is
small.

### Build time

Use the full reference export for build measurements. Record the time for each
materialization phase, index phase, validation phase, and complete projection.

Use these bands as a starting point:

| Eager build time for one statistic | Default decision |
| --- | --- |
| Below 2 minutes | Eager build is normally acceptable when usage is clear. |
| 2 to 10 minutes | Add usage evidence and compare the lazy design. |
| More than 10 minutes | Use lazy loading or split the statistic into common cohorts. |
| More than 30 minutes | Do not add it to the default eager build without explicit approval. |

The build time is not the only cost. Record these values too:

- Source rows read.
- Output rows written.
- Data size.
- Index size.
- Number of full scans.
- Number of window sorts.
- Number of repeated joins.
- Number of supported cohorts.
- Expected request volume for each cohort.

An eager statistic must earn its build cost through expected use. A statistic
with low usage and a long build belongs in a lazy path, even when its first
query is easy to write.

## Choose the build level

Choose the smallest data level that meets the request target.

Use this order:

1. Reuse an existing published table.
2. Add a narrow index for a measured access path.
3. Add a small aggregate or count table.
4. Add a shared temporary stage for related rankings.
5. Add an eager cohort table for common cohorts.
6. Add a lazy generator for uncommon cohorts.
7. Add a new persistent fact table only when several consumers need the same source rows.

Do not create a persistent table when a temporary stage can serve all build-time
consumers. Do not create one table for every sort option or filter combination.

### Eager data

Eagerly build a statistic when all of these conditions hold:

- The product reads the statistic often.
- The common query meets the 200 ms target after indexing.
- The build cost fits the expected release window.
- The output size has a clear storage limit.
- The statistic has a stable scope and version.
- The statistic reduces repeated work for more than one consumer.

Build common cohorts eagerly when the complete cohort set is too expensive.
Examples include World and common continent views.

### Lazy data

Use lazy loading when any of these conditions hold:

- The query is uncommon.
- The query has a large combination space.
- The full eager build exceeds the build-time bands.
- The query includes a year, country, gender set, or other narrow cohort.
- The query uses a filter that is not part of the common product path.

A lazy query must create a bounded result window. It must not load the full
result set into application memory.

The lazy path must include:

- A stable cache key.
- The data generation in the cache key.
- A single-flight or request-coalescing map.
- A bounded window size. The default ranking window is 400 rows.
- A clear cache miss and cache hit diagnostic.
- A failure path that removes the failed in-flight request.
- Cache invalidation after a new ranking generation becomes active.

## Define the statistic before writing SQL

Write these definitions in the PR before implementation:

- Entity definition. For example, one row per person and event.
- Source definition. For example, one row per official result or attempt.
- Result validity rules.
- Supported result types.
- Supported scopes.
- Supported gender filters.
- Date and year rules.
- Tie rules.
- Display rank rules.
- Deterministic position rules.
- Required coverage.
- Missing-data behavior.
- Data and metric version rules.

Use `rank` for a public tied rank. Use `position` for deterministic ordering.
Do not expose `position` or any sub-rank concept in user-facing text.

Every ranked row must have a deterministic order. Include stable tie columns,
such as `person_id`, `result_id`, and `attempt_number`, in the order clause.

Every score that can change after a source export must include a metric version,
event-set version, or equivalent generation identity.

## SQL and schema rules

### Reuse facts

Build downstream statistics from reusable fact tables. Do not scan raw WCA
tables from several independent projections when one shared fact stage can
serve them.

The usual dependency direction is:

```text
raw WCA tables
  -> reusable facts
    -> scoped values
      -> scores or rankings
        -> counts and page indexes
```

Add a new fact table only when more than one real consumer needs the same source rows.
Keep fact tables narrow. Do not carry columns that no downstream query reads.

### Materialize shared work once

Materialize a repeated source stage when it contains a large scan, repeated
CTE expansion, repeated window input, or repeated dimension join.

Use a temporary InnoDB table for a build-only stage. Add indexes to that stage
only when an `EXPLAIN` plan proves that a downstream step uses them.

Drop temporary stages as soon as the last consumer finishes.

### Window functions

Window functions can require a full scan and sort. Treat each distinct
partition and order as a cost center.

For every window query:

- Run `EXPLAIN FORMAT=JSON`.
- Record filesort, temporary table, and join-buffer use.
- Identify repeated input scans.
- Test whether one shared stage can serve several windows.
- Test whether the request can rank a smaller filtered cohort.
- Preserve rank and tie semantics when changing the query.

Do not add an index only because it contains the `ORDER BY` columns. Confirm
that the index reduces rows read, filesort work, or page lookup time.

### Indexes

Add an index for a supported filter, order, join, or page access path.

For each new index, record:

- The exact query that uses it.
- The leading filter columns.
- The ordering columns.
- The expected row reduction.
- Build time.
- Data and index size.
- The `EXPLAIN FORMAT=JSON` plan before and after.

Do not add several wide indexes when one measured covering index serves the
common path. Do not add an index to a temporary table that every consumer scans
from start to finish.

Batch related index creation in the release build after phase measurements are
complete. Separate `ALTER TABLE` statements can repeat large index work.

### Counts

Create a count table when the count is read often and the count query is costly.

Use a dynamic count when the filtered set is small or the count is part of a
lazy window query.

Keep count scope, region, result type, gender set, and generation identity in
the count key when they affect the result.

## Query cache rules

Use one cache key for one logical window. Include every value that changes the
rows or their order:

```text
data generation
event
result type
scope
region
year
gender set
metric version
event-set version
sort direction
window start
```

Use one in-flight request for equal keys. Requests for adjacent pages can use
the same 400-row window.

Join display data after the window is ranked and limited. This rule prevents a
large person or country join from running once per candidate row.

Pin only a small set of proven common windows. Put all other windows in a
bounded LRU cache.

Clear all generation-scoped caches when the active generation changes.

Do not cache a result without a generation or metric version. A stale ranking
can display a valid-looking but incorrect result.

## Build and release rules

Register each statistic in the projection graph with explicit dependencies.

The projection definition must include:

- A stable group name.
- Its source dependencies.
- Its owned tables.
- Its SQL files.
- Its metric or schema version.
- Its validation checks.
- Its release capability.

The builder must log at least these phases:

- Source materialization.
- Each large table materialization.
- Each large index build.
- Validation.
- Cleanup.

Use `MM:SS.cc` for human-readable duration logs. Keep raw millisecond values
in machine-readable timing data.

A release must not publish a statistic that its readiness checks cannot find.
A release must not require a table that its selected projection group does not
build or restore.

When a table becomes obsolete, add it to the retired-table path. Test that the
active generation removes the old table without changing raw WCA data.

Reuse an exact projection artifact only when its export identity, semantic
fingerprint, schema version, and source fingerprint match the requested build.

## Validation requirements

Every statistic PR must include these checks:

### Correctness

- Compare the new query with a trusted baseline on a fixture dataset.
- Compare World, continent, and country results.
- Compare every supported result type.
- Compare every supported gender set.
- Test ties and deterministic positions.
- Test empty scopes and missing dimension values.
- Test incomplete coverage.
- Test counts and totals.
- Test cache invalidation after a generation change.

### Performance

- Run `EXPLAIN FORMAT=JSON` for every large query.
- Run the full projection on the reference export.
- Record each phase in `MM:SS.cc` format.
- Record output and index sizes.
- Measure warm and cold request latency.
- Measure the first lazy request and the cached request.
- Send concurrent equal requests and confirm one source query.
- Measure a deep page, not only the first page.

### Failure behavior

- Interrupt or fail a lazy build and confirm that later requests can retry.
- Fail a projection phase and confirm that no partial table becomes active.
- Confirm that raw WCA tables remain unchanged.
- Confirm that a failed release does not change the active generation.

## PR template for a new statistic

Copy this list into the PR description:

```text
Statistic name:

Entity definition:
Source definition:
Result types:
Scopes:
Gender filters:
Date or year filters:
Tie and position rules:
Required coverage:
Metric version:
Event-set version:

Common queries:
Expected request volume:
Eager or lazy decision:
If lazy, cache key and window size:

Reference export:
Reference MariaDB version:
Build time by phase:
Total build time:
Output rows and size:
Index rows and size:
EXPLAIN summary:
Warm p50 and p95:
Cold p50 and p95:
Cache-hit p50 and p95:
Concurrent request result:

Baseline comparison:
Correctness tests:
Failure tests:
Release and readiness changes:
Rollback or retirement plan:
```

## Review decision

Approve an eager statistic when its usage supports its build and storage cost.

Approve a lazy statistic when its query is bounded, cached, coalesced, versioned,
and within an acceptable first-load budget.

Reject a statistic when it scans raw data from several projections without a
shared stage, adds unmeasured wide indexes, or has no usage and latency plan.

When the data does not support an eager-build decision, use lazy loading first.
Promote a lazy statistic to eager only after production or benchmark data shows
that the common path justifies the build cost.
