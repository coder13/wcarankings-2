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

The build reads all-time, historical-country rows from `person_event_bests`.
That shared grain supplies Single and Average bests, represented country, and
represented continent. The build calculates World, continent, and country
event ranks from these rows. It does not scan `result_facts` or ranking tables.

The build uses temporary cohort, event-value, penalty, and Kinch tables. It
drops these tables after the score table is complete.

The only published score table is
[person_sum_of_ranks_scores.sql](../../data-tools/projection-catalog/people/sum-of-ranks/person_sum_of_ranks_scores.sql).
The event-value stages are dropped after the build.

## Indexes

The published score table needs a primary key over metric versions, result type,
scope, region, and person, page indexes for Sum of Ranks and Kinch order, and a
normalized gender filter index for lazy cohorts.

Temporary tables need compact numeric cohort IDs and indexes on event values by
cohort, event, result value, and person. This avoids repeating long scope and
region strings in every temporary row.

`person_event_bests` has a scoped source index on period, country, result type,
event, result value, and person. Regional live rebuilds use this index before
they sort event ranks.

## EXPLAIN summary

The previous design scanned `result_facts`, stored temporary historical bests,
and read the World ranking tables. The shared-grain design reads
`person_event_bests` instead. It keeps the event-ranking window work in the
projection build.

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

The shared-grain design needs a fresh full-export benchmark. The benchmark must
report the person-event-best build, the Sum-of-Ranks build, score-table size,
and result equivalence against the prior result.

### Live worker measurement

Measured on the local full-export MariaDB database on 2026-08-07:

- the prior combined USA and North America job took `41.471 s`;
- the split North America coordinator took `26.841 s` and queued the USA job;
- the USA child job took `16.683 s`.

The coordinator removes the country-before-continent race. These jobs do not
yet meet the target of a few seconds. Keep World out of the live path. Measure
event-level SoR partitions before expanding live scope.

## Request policy

World, continent, and country common windows are stored and deployment-warmed
for default World Single, Average, and Kinch views. Gender and uncommon region
windows are lazy and cached by generation, metric version, result type, scope,
region, gender, order, and window start.

## Live-update policy

The projection worker can rebuild a provisional all-time country or continent
scope. The live importer queues each affected continent scope. After the
continent job commits, it creates or updates the affected country jobs. This
supplies the country Kinch continent comparison from the same source snapshot.

The worker deletes only the affected scope rows. It then inserts the current
calculation with `is_provisional = 1`. The daily official-export build replaces
these rows with official rows.

World Sum of Ranks and World Kinch do not rebuild from live input. The daily
official-export build remains their source until the wider partition benchmark
is complete.

## Profile summary

The profile summary reads the all-time World Single Kinch row directly from
`person_sum_of_ranks_scores`. It divides the stored combined score by the
17-event metric set before display. This is a primary-key lookup and does not
need another projection or a scroll path.
