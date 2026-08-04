# Sum of Ranks and Kinch

Status: **Active with lazy filtered cohorts**

## What it ranks

Sum of Ranks ranks people by the sum of their event ranks. It keeps separate
Single and Average rankings. Kinch ranks people by the combined event score. The
current metric set contains 17 events.

A metric row represents a metric, metric version, event-set version, result
type plus scope plus region plus person. Missing events use the scope event
fallback rank for Sum of Ranks. Kinch uses event reference ratios and its
event-specific rules. Equal totals use public competition ranks. Position gives
stable page order.

## Source data

The build uses temporary import stages from `result_facts` for historical
Single and Average bests and represented region, and `ranks_single` and
`ranks_average` for World event values. It also uses temporary historical-best,
cohort, event-value, penalty, and Kinch tables.

The only published score table is
[person_sum_of_ranks_scores.sql](../../sql/ranking-projections/person_sum_of_ranks_scores.sql).
The event-value stages are dropped after the build.

## Indexes

The published score table needs a primary key over metric versions, result type,
scope, region, and person, page indexes for Sum of Ranks and Kinch order, and a
normalized gender filter index for lazy cohorts.

Temporary tables need compact numeric cohort IDs and indexes on event values by
cohort, event, result value, and person. This avoids repeating long scope and
region strings in every temporary row.

## EXPLAIN summary

The old design repeated large historical and regional stages. The current
design aggregates historical bests once, reuses World rank values, and
materializes regional event values before the final score. This reduces repeated
scans and keeps expensive window work in import time.

A pre-change `ANALYZE FORMAT=JSON` for a female World Single cohort read
`291,958` score rows and spent about `1.00 s` in person lookups. The lazy
design stores normalized gender, filters score rows first, and joins people after
the 400-row window.

## Build evidence

Earlier eager build:

- complete group: `1,061.216 s` (`17:41.22`);
- historical results: `95.390 s`;
- event values: `538.591 s`;
- Kinch values: `169.231 s`;
- final scores: `220.641 s`.

The current common-cohort and lazy-gender design needs a fresh full-export
benchmark. The benchmark must report common build time, filtered request time,
cache hit rate, and score-table size.

## Request policy

World, continent, and country common windows are stored and deployment-warmed
for default World Single, Average, and Kinch views. Gender and uncommon region
windows are lazy and cached by generation, metric version, result type, scope,
region, gender, order, and window start.
