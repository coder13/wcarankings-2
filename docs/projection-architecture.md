# Projection Architecture

This document is the permanent schema and naming contract for CubeRanks
projection work. Implemented core projections are listed separately from
planned extension grains. Changes to a documented grain, identifier, metric
version, or publication guarantee require an explicit migration and a
corresponding update here.

## Goals

- Build one projection per row grain, not one table per sorting option.
- Keep high-cardinality ordering tables narrow.
- Build downstream statistics from shared facts instead of repeatedly scanning
  raw WCA export tables.
- Preserve the result IDs and component rows needed to explain every statistic.
- Add indexes only for product-supported filtering, ordering, and keyset paging.
- Publish each active projection group from one export generation atomically.
- Keep names predictable as yearly, weekly, competition, city, cohort, and
  metric features are added.

## Naming convention

Use plural snake-case table names:

```text
{subject}_{time_dimension?}_{qualifier?}_{kind}
```

Kinds have specific meanings:

| Suffix | Meaning |
| --- | --- |
| `_facts` | Reusable normalized rows close to source data |
| `_rankings` | Rows with a displayed rank and deterministic internal position |
| `_scores` | One aggregate score per ranked entity |
| `_values` | Auditable component values contributing to a score |
| `_stats` | Aggregate attributes that may support several sorts |
| `_members` | Child or membership rows belonging to another entity |
| `_counts` | Precomputed totals for a defined leaderboard scope |

Use these column names consistently:

| Concept | Name |
| --- | --- |
| Public tied rank | `rank` or `{scope}_rank` |
| Internal deterministic position | `position` or `{scope}_position` |
| Result mode | `result_type` with `single` or `average` |
| Geographic ranking level | `scope` with `world`, `continent`, or `country` |
| Scope identity | `region_id`, with an empty value for World |
| Source result | `result_id` |
| Projection generation | `generation_id` if generation identity becomes explicit |
| Metric definition version | `metric_version` |
| Product event-set version | `event_set_version` |

`sub_rank` is an existing internal name, but new schemas should prefer
`position`. If existing tables are renamed, perform that change as an explicit
migration rather than exposing either name in the UI.

Do not include `_entries` in new table names. It does not identify a grain or
purpose. Existing `_entries` tables can remain temporarily for compatibility.

## Active projection graph

The default import currently activates one new product projection:

```text
ranks_single + ranks_average + historical results
└── temporary historical bests and ranked event values
    └── person_sum_of_ranks_scores
```

The result, general person-metric, competition, city, and time-based grains
documented below remain registered or planned extensions. Registration does
not activate a projection: inactive projections are not built, published,
required by readiness checks, or exposed through public route handlers.

## Core fact table

### `result_facts`

Grain:

```text
one row per official WCA result
```

Columns:

```text
result_id
event_id
person_id
person_country_id
person_continent_id
competition_id
competition_start_date
round_type_id
is_final_round
position
best
average
attempt_count
regional_single_record
regional_average_record
```

The current public export v2 omits the five attempt values from `results`.
They are therefore not repeated as always-NULL columns in `result_facts`;
`attempt_count` uses `formats.expected_solve_count`. Consumers must not treat
the absent source values as failed or unattempted solves. Competition city,
country, end-date, year, and week attributes remain in `competitions` until a
current projection needs to repeat them.

This should be the only new general-purpose downstream layer that directly
scans raw `results`. Event-aware validity and comparison semantics should be
centralized in this layer or in reusable SQL helpers built immediately above it.

Indexes should initially cover:

```text
PRIMARY KEY (result_id)
(person_id, event_id, competition_start_date, result_id)
(competition_id, event_id, result_id)
(event_id, best, competition_start_date, competition_id, person_id, result_id, round_type_id, person_country_id, person_continent_id)
(event_id, average, competition_start_date, competition_id, person_id, result_id, round_type_id, person_country_id, person_continent_id)
```

The two wider ranking-cover indexes are benchmark candidates for
`result_rankings`. They match its World ordering and cover the scope and round
columns selected while calculating all six window positions. Retain them only
if the full-import benchmark improvement justifies their build time and storage.
Their `(event_id, result value)` prefixes also replace the narrower event/value
indexes; do not maintain both pairs unless another measured query requires the
different tie ordering.

Yearly indexes are intentionally absent while time-based projections are
planned. Add them only if benchmarks show that the yearly projections benefit
enough to justify their size:

```text
(competition_year, event_id, best, result_id)
(competition_year, event_id, average, result_id)
```

## Person-event rankings

### `person_event_rankings`

Grain:

```text
person + event + result type
```

Columns:

```text
person_id
event_id
result_type
result_id
result_value
country_id
continent_id
world_rank
world_position
continent_rank
continent_position
country_rank
country_position
previous_world_rank
previous_continent_rank
previous_country_rank
world_rank_delta
continent_rank_delta
country_rank_delta
rank_delta_state
```

Physically splitting this into `person_event_single_rankings` and
`person_event_average_rankings` remains acceptable if benchmarks show a
meaningful storage or query advantage. If split, both tables must retain the
same column vocabulary.

Display names and competition names should normally be joined after paging.

Person search is deliberately a two-step lookup. Search `persons` first, using
its `(wca_id, sub_id)` and `name` indexes for exact WCA IDs and prefix names.
Regex name searches may scan `persons`, but must not scan this projection.
After resolving the selected `person_id`, query this projection through:

```text
(person_id, event_id)
```

`person_id` is the canonical WCA identifier in projections; do not duplicate it
as a separate `wca_id` column.

### `person_ranking_counts`

Grain:

```text
event + result type + scope + region
```

Columns:

```text
event_id
result_type
scope
region_id
count
```

## Individual-result rankings

### `result_rankings`

Grain:

```text
official result + result type
```

Columns:

```text
result_id
result_type
event_id
person_id
competition_id
result_value
country_id
continent_id
record_code
world_rank
world_position
continent_rank
continent_position
country_rank
country_position
```

The logical projection is stored as two physical tables:

```text
result_rankings_single
result_rankings_average
```

Result type is part of the logical grain, but separating it physically halves
peak window-sort size and avoids repeating `result_type` in every row and browse
index. Both tables have the same columns and API contract.

Their ordering should be deterministic:

```text
result_value
result_id
```

Result rankings expose the same position-addressable page contract as the other
list surfaces. Tied rank and stable position are separate: rank is calculated
with `RANK()` from `result_value`, so it equals one plus the number of official
result rows with a strictly better value and skips ranks after ties. Position
uses `ROW_NUMBER()` over `result_value, result_id` to give every row a stable
address. The World, continent, and country position columns support direct page
windows, backward loading, and jumps without large offsets.

The projection deliberately omits competition dates, round metadata, person
names, competition names, and country display names. After selecting at most
one page from the narrow ordering table, the API joins those display fields
from the source tables. This avoids millions of competition lookups during
generation and keeps the published table and indexes narrower.

Person search uses the same `persons`-first lookup described for person-event
rankings. Once a `person_id` is selected, use projection indexes matching the
two exposed result views:

```text
(person_id, event_id, result_type, world_position, result_id)
```

The compatibility result projection retains its equivalent ranked access path:

```text
(person_id, event_id, world_sub_rank, result_id)
```

No result-ranking query should apply `LIKE`, `REGEXP`, or another name search to
projection display columns.

### `result_ranking_counts`

Grain:

```text
event + result type + scope + region
```

Columns:

```text
event_id
result_type
scope
region_id
count
```

## Person metrics

### Active Sum of Ranks and Kinch projections

Sum of Ranks uses temporary, import-only tables for historical bests, cohorts,
ranked event values, and event penalties. Single and Average historical bests
are aggregated in one scan of `results`, then unpivoted. World inputs come from
the narrow canonical `ranks_single` and `ranks_average` tables. The temporary
tables use explicit compact types and numeric cohort IDs so window sorts do not
repeat scope and region strings across millions of rows.

World values reuse the canonical person-event World ranks. Country and
continent values are derived from `results.person_country_id`, which records
the region represented when the result occurred. They must not be reassigned
through the person's current country. This historical-region rule prevents
country changes from corrupting regional totals; see issue #50.

`person_sum_of_ranks_scores` has one row per metric version, event-set version,
result type, scope, region, and person. It stores the Sum of Ranks total,
coverage, required coverage, public competition `rank`, and deterministic
internal `position`, plus nullable Kinch score/rank/position columns. Missing
events contribute a fallback rank equal to the number of ranked competitors
for that event and region plus one. A person enters the
World cohort after recording a result in any included event, and enters a
regional cohort after representing that historical region in any included
event. Equal totals use competition ranking (`1, 1, 3`), while positions break
ties by WCA ID for stable positional paging.

Kinch combines the current 17-event set into one score. Each normal event uses
`100 × scope reference result ÷ personal result`, while FMC, 3BLD, 4BLD, and
5BLD use the better of the Single and Average ratios. Multi-Blind uses the
special points-and-time formula. A missing event contributes zero. The
user-facing overall score divides that sum by all 17 events and therefore
ranges from 0 to 100, with higher scores ranking first. Kinch is exposed as a
single combined ranking; Sum of Ranks retains separate Single and Average
rankings.

The event-value intermediate is dropped after the score build. It is not a
published schema or readiness dependency because the product currently shows
only overall rankings; event-level values remain available from the existing
person-event ranking projections. Names and countries are joined only after
selecting a score page. Counts use the score browse index rather than another
persisted count grain.

### Legacy local Sum of Ranks refresh benchmark

Before event values became temporary, the targeted persistent-database refresh
on 2026-07-28 completed in 738.9
seconds. It published 5,699,074 event-value rows and 1,735,888 score rows. The
score projection occupied approximately 201 MiB of table data and 95 MiB of
indexes; event values occupied approximately 433 MiB.

After publication, uncached local HTTP checks returned the first 50-row World
Single page in 21 ms, a page around position 250,000 in 18 ms, and an exact
WCA-ID search in 5 ms. These are single local observations rather than a
capacity benchmark, but they confirm that incomplete coverage increases build
and storage cost without changing the indexed read path.

The targeted Kinch extension refresh on 2026-07-28 completed in 738.6 seconds
and retained the same 5,699,074 event-value rows and 1,735,888 score rows.
Adding `result_value` increased the event-value table from approximately 433
MiB to 457 MiB. The score table remained approximately 201 MiB; its indexes
increased from approximately 95 MiB to 179 MiB after adding the Kinch paging
index. Local HTTP observations returned the first World Single Kinch page in
21 ms, the final page in 7 ms, and a name search in 5 ms. The published
complete-coverage subset contained 809 World Single people and 165 World
Average people before missing events were changed to contribute zero.

The former score-only refresh for zero-valued missing Kinch events completed in 247.6
seconds without rebuilding event values or scanning raw results. It published
Kinch positions for all 1,735,888 score rows, including 291,763 World Single
people and 286,535 World Average people. These measurements are retained as the
baseline for benchmarking the temporary-intermediate implementation.

### Temporary-intermediate Sum of Ranks benchmark

The targeted local rebuild on 2026-07-28 completed in 317.3 seconds and
published the same 1,735,888 score rows. This reduced build time by 57.1%
compared with the 738.9-second persistent-event-value baseline.

Measured phases were:

| Phase | Duration |
| --- | ---: |
| Aggregate historical Single and Average bests | 86.8 s |
| Unpivot historical bests | 1.3 s |
| Load World Single event values | 1.5 s |
| Load World Average event values | 1.4 s |
| Rank country event values | 11.1 s |
| Rank continent event values | 63.8 s |
| Calculate event penalties and Kinch references | 3.6 s |
| Aggregate and rank person scores | 132.6 s |
| Index person scores | 12.3 s |

### GitHub Actions transfer experiment

On 2026-07-29, a GitHub-hosted runner restored the dated WCA export archive,
imported it into fresh MariaDB, and built the complete active projection
generation for transfer to production. Cold generation did not beat the
20-minute VPS-side comparison threshold, but moving it off the VPS removed the
SSH idle timeout and made the completed artifact reusable.

The raw export import took approximately 2 minutes 54 seconds. Required raw
indexes took approximately 1 minute 23 seconds. The optimized Sum of Ranks
projection itself took 317.8 seconds and produced 1,737,062 rows. Competition
podium members, event statistics, and competition statistics took 52.3, 42.0,
and 59.9 seconds respectively. Compatibility projection work accounted for
most of the remaining time. The first generation reached validation after
approximately 25 minutes 16 seconds. A later complete build and dump took
22 minutes 23 seconds; a repeat took 23 minutes 38 seconds and produced a
432 MB compressed workflow artifact.

Logical SQL replay on the VPS was worse. It exceeded 42 minutes before the
experiment was canceled, so no transfer tables were published. The dump
included secondary indexes in each table definition, causing MariaDB to
maintain those indexes while loading millions of rows.

Caching only the compressed WCA archive therefore does not remove the dominant
cost: importing raw data and rebuilding compatibility projections and indexes
inside a cold MariaDB instance. Transfer artifacts are now cached by export
date and projection-schema hash so unchanged deploys can reuse a validated
generation. New artifacts omit secondary indexes during logical import and
rebuild all indexes for a table together after its bulk data load. A future
runner experiment may still benefit from caching a validated imported database
snapshot or building only the projection group being deployed.

The first successful production publication used a 432,325,262-byte artifact.
The cold Actions build and dump took 2,547 seconds; transfer, bulk import,
deferred index construction, validation, and atomic publication took 407
seconds. A subsequent cache-hit deployment skipped the cold build and completed
the whole deployment in 10 minutes 34 seconds, including a 423-second transfer
and publication phase.

The 22 deferred indexes took approximately 171 seconds on the successful
cache-hit run. The five `result_entries_single` indexes accounted for 125.6
seconds; Sum of Ranks indexes took 15.6 seconds, person-event single and average
indexes took 14.4 and 12.3 seconds, and competition indexes took less than three
seconds. No application query used the compatibility result table's five
secondary indexes; result browsing uses `result_rankings`. The unused indexes
were subsequently removed, leaving the compatibility table's primary key. The
next cold build and dump completed in 24 minutes 15 seconds, a 42.9% reduction,
and production transfer and publication completed in 5 minutes 08 seconds, a
27.2% reduction. Deferred-index work fell to 17 indexes and approximately 43
seconds.

Deployment projection builds use the export date already published on
production, not the newest export advertised by the WCA API. This keeps raw
tables, display joins, and transferred projections on one generation. On a
cache miss, Actions streams that exact dated archive from production's
persistent WCA export cache.

The published score table uses approximately 139.8 MiB of data and 117.3 MiB
of indexes. Removing the 457 MiB published event-value table and narrowing the
score schema reduced persistent SOR/Kinch storage from approximately 910.7 MiB
to 257.1 MiB, a 71.8% reduction.

Pre- and post-build fingerprints matched exactly: total rows, total SOR score,
total Kinch score, coverage, maximum positions, and the first ten World Single
people under both SOR and Kinch ordering. Local HTTP observations returned the
first 50-row SOR page in 6 ms, a page around position 250,000 in 21 ms, and the
first Kinch page in 8 ms.

### Inactive general metric projections

### `person_metric_values`

Grain:

```text
metric version + event-set version + result type + scope + region + person + event
```

Columns:

```text
metric_version
event_set_version
result_type
scope
region_id
person_id
event_id
event_rank
personal_result
reference_result
sum_of_ranks_value
kinch_value
```

The shared input and reference values are stored once per scope/person/event.
Metric values use separate columns rather than duplicating the row once per
metric. This keeps the components auditable while halving the largest metric
table. Its primary key already supports person-detail lookup, so no duplicate
secondary index is maintained. Metric scores aggregate both value columns in
one pass before expanding the much smaller person totals by metric.

Initial metrics:

```text
sum_of_ranks
kinch
```

### `person_metric_scores`

Grain:

```text
metric + metric version + result type + scope + region + person
```

Columns:

```text
metric
metric_version
event_set_version
result_type
scope
region_id
person_id
score
coverage
required_coverage
rank
position
```

Sum of Ranks v1 includes people with partial coverage. Missing results use the
event-specific fallback rank for the selected scope and region. Kinch must have
an explicit, versioned missing-event and Overall aggregation policy.

The v1 policy is:

- Sum of Ranks Single includes all 17 current Single events.
- Sum of Ranks Average includes all 16 current Average events.
- If an event has 10 ranked competitors, a missing result contributes rank 11.
- Fallbacks are calculated independently for World, continent, and country.
- Kinch combines all 17 current events, chooses the better Single/Average ratio
  for FMC and blindfolded events, uses the special Multi-Blind score, and
  assigns zero percent to each missing event.

Any event-set or missing-event policy change increments `metric_version` or
`event_set_version`; it does not silently reinterpret stored v1 rows.

## Time-based rankings

### `person_year_rankings_single` and `person_year_rankings_average`

Grain:

```text
year + person + event + result type
```

These physical projections represent each person's best valid result during a
competition start year. Country bests are selected first using the country on
the result, then continent and World bests are derived from those rows. The
compact `person_year_ranking_cohorts` table maps World, continent, and country
cohorts to numeric IDs; `person_year_ranking_counts` supplies available years
and page totals without scanning raw results. Public rank uses `RANK()` and
the deterministic internal position is never exposed in the UI.

### `result_year_rankings`

Grain:

```text
year + official result + result type
```

This represents every valid result during a year.

### `person_event_weekly_bests`

Grain:

```text
competition week + person + event + result type
```

Columns should include the retained `result_id` and `result_value`.

### `person_event_rank_changes`

Grain:

```text
latest competition week + person + event + result type
```

This stores current and pre-week ranks or deltas for World, continent, and
country scopes. It must reconstruct prior standings after excluding the entire
latest week for every person.

### `record_week_streaks`

Grain:

```text
result type + event + scope + region + record holder
```

This should remain separate from rank changes because record possession and
ranking movement have different semantics.

## Competition and city statistics

### `competition_stats`

Grain:

```text
competition
```

Columns:

```text
competition_id
start_date
latitude
longitude
competitor_count
competitor_count_rank
competitor_count_position
northernmost_rank
northernmost_position
southernmost_rank
southernmost_position
```

The activated version contains the coordinate fields needed by latitude and
one distinct-person aggregate for the Competitor Count product. Other activity
aggregates remain planned and should be added only when their products are
activated. Stable competitor-count, north, and south position indexes support
the shared paging engine.

### `competition_event_stats`

Grain:

```text
competition + event
```

Columns:

```text
competition_id
event_id
start_date
fastest_single
fastest_single_result_id
fastest_single_rank
fastest_single_position
fastest_average
fastest_average_result_id
fastest_average_rank
fastest_average_position
```

The fastest-result subset is active. Its positions are internal page keys,
ordered by result value, competition date, and competition ID. They let the
shared list engine load arbitrary windows and jump to the end without large
offsets. Only the public tied rank is rendered.

The active podium subset adds:

```text
winning_single
winning_single_result_id
winning_average
winning_average_result_id
podium_score
podium_rank
podium_position
```

Every displayed best or winner must retain its source `result_id`. The active
fastest-result build aggregates directly from the raw export once and joins
the selected result, person, competition, and country display data only after
the bounded page has been selected.

Podium membership comes only from official final or combined-final rows whose
official position is at most three. Each competition-event has one podium
ranking based on the result that determines the official final standings:
Single (`best`) for 3BLD, 4BLD, and 5BLD, and Average for every other supported
event. There is no result-type toggle. Ties are retained, so one competition
may have more than three displayed members. The score is the mean of the
distinct valid component values: an additional finisher tied on the exact same
ranked result is visible but does not skew the score. Multi-Blind is excluded
because its packed result representation cannot be averaged meaningfully.
Public tied ranks and deterministic internal positions support the same
positional paging as fastest-result rankings.

The remaining competition-event statistics are planned:

```text
winning_single
winning_single_result_id
winning_average
winning_average_result_id
```

### `competition_podium_members`

Grain:

```text
competition + event + result type + podium position
```

Columns:

```text
competition_id
event_id
result_type
podium_position
person_id
result_id
result_value
```

The score belongs in `competition_event_stats`; all auditable final-round
components, including tied finishers at positions up to three, belong here.

### `city_event_stats`

Grain:

```text
exact city name + country + event
```

Columns:

```text
city_name
country_id
event_id
fastest_single
fastest_single_result_id
fastest_single_rank
fastest_average
fastest_average_result_id
fastest_average_rank
```

The first version must not merge aliases, metro areas, or identically named
cities in different countries.

### `entity_ranking_counts`

Grain:

```text
ranking kind + event + result type
```

This small metadata projection stores totals for competition-result, podium,
city, competition-size, and latitude leaderboards. It avoids counting a full
leaderboard during page requests and is published with the same generation as
the projections it describes.

## Cohorts and persisted lists

Do not precompute every ranking for every arbitrary cohort or user list.

Store membership separately:

```text
competitor_lists
competitor_list_members
system_cohorts
system_cohort_members
```

Small lists can join membership to global projections at request time. Only
large, frequently used, operator-defined cohorts should be considered for
materialized cohort rankings after measurement.

## Features that should reuse these projections

- Percentiles use displayed rank plus the appropriate count projection.
- Person profiles batch person-event rankings and metric values by `person_id`.
- Competitor comparisons batch the same tables for two to four WCA IDs.
- Hypothetical-result lookup uses ranking indexes and counts; it does not need a
  projection per hypothetical value.
- CSV and JSON exports use the same bounded query definitions as their source
  leaderboards.
- Social previews read the first three rows from an existing ranked projection.
- Offline snapshots and generation-aware caches identify one atomically
  published export generation.

## Ranking API contract

The active semantic surface is exposed through:

```text
GET /api/people/search
GET /api/rankings
```

Sum of Ranks is represented as the synthetic event `eventId=SOR` on the same
ranking resource used by official WCA events. It returns the same bounded
ranking-page shape, uses the same person search and navigation flow, and feeds
the same virtualized infinite-scroll list. Only the overall Sum of Ranks score
is returned; per-event component values are build inputs, not a published
browse surface.

Person searches resolve matching IDs from `persons` before applying an indexed
`person_id` filter to the selected projection. No request applies a name search
to a projection table. Display names and countries are joined only after the
score page has been selected.

## Publication

Default full-import build order:

```text
1. Import raw WCA tables
2. Build compatibility person and result projections
3. Build Sum of Ranks event values and scores
4. Add browse indexes and validate row counts
5. Atomically publish the active generation
6. Remove the previous generation
```

The declarative registry should define:

```js
{
  name,
  dependencies,
  tables,
  build,
  validate,
}
```

The registry supports dependency ordering, selective backfills, per-projection
timing, row counts, validation, and controlled concurrency. Its explicit
default set is the activation boundary. A targeted Sum of Ranks backfill
stages and swaps only its two tables; failures leave the previously published
group intact.

Projection builds log a start and finish record for every physical table,
including temporary build tables, with elapsed milliseconds. Compatibility
tables include their indexes in the table duration. Registered projections
also retain their projection-level duration and validated row counts. A failed
table and its containing projection both log their elapsed time before the
error aborts publication.

### Local result-ranking backfill benchmark

The first targeted all-results backfill ran on 2026-07-29 against 6,750,045 raw
`results` rows. The logical projection was split into physical Single and
Average tables to bound peak window-sort space:

| Table | Rows | Data | Indexes | Build time |
| --- | ---: | ---: | ---: | ---: |
| `result_rankings_single` | 6,564,373 | 911.0 MiB | 888.8 MiB | about 4m 15s observed |
| `result_rankings_average` | 5,890,382 | 818.0 MiB | 797.8 MiB | 3m 40.4s |
| `result_ranking_counts` | scope counts | 0.3 MiB | negligible | 8.2s |

The first Single timer wrapper exited after the SQL succeeded because it used a
reserved zsh variable, so its duration is an observed approximation; subsequent
registry builds use the tested JavaScript timing logger. The complete published
projection occupies approximately 3.416 GiB. MariaDB shared rank and position
calculation into three scope sorts per physical table. Omitting competition
dates and round metadata from the projection avoided millions of competition
lookups; the API joins competition display data only after selecting a page.

Local API checks for first, middle, final, Average, continent, and person-search
windows completed in approximately 9–23ms end to end. The first-page database
work reported 1.8ms for 50 rows.

## Future architecture decisions

These decisions affect future migrations or planned projection layers; they do
not make the current contract provisional:

1. When compatibility `_entries` tables can be retired after consumers move to
   unified semantic ranking tables. `result_entries_single` is the highest
   priority because it repeats millions of result rows and a full index set.
2. Whether a future metric version should use different event sets or Kinch
   aggregation semantics.
3. Whether yearly source indexes justify their storage cost.
4. Whether competition-wide pages need another event-normalized grain.
5. Which system cohorts are large or frequent enough to materialize.
6. Whether explicit `generation_id` columns add value beyond atomic table
   publication and export metadata.

## Related roadmap issues

- #1: Kinch Rankings
- #2: Sum of Ranks
- #4: competitor profiles
- #5: percentile context
- #6: competitor comparisons
- #7 and #11: lists and cohorts
- #9: hypothetical result lookup
- #10: CSV and JSON exports
- #13: result details
- #16: social previews
- #17: competition-wide leaderboards
- #18: all-time result leaderboards
- #19: yearly rankings
- #25: caching and resilience
- #39: weekly deltas and record streaks
- #43: competition, podium, city, and geographic rankings
