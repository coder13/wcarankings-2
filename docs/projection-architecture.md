# Projection Architecture

This document is the permanent schema and naming contract for CubeRanks
projection work. Implemented core projections are listed separately from
planned extension lists and stats. Changes to a documented list or stat, identifier, metric
version, or publication guarantee require an explicit migration and a
corresponding update here.

## Goals

- Build one projection for each supported list or stat, not one table per sorting option.
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

| Suffix      | Meaning                                                        |
| ----------- | -------------------------------------------------------------- |
| `_facts`    | Reusable normalized rows close to source data                  |
| `_rankings` | Rows with a displayed rank and deterministic internal position |
| `_scores`   | One aggregate score per ranked entity                          |
| `_values`   | Auditable component values contributing to a score             |
| `_stats`    | Aggregate attributes that may support several sorts            |
| `_members`  | Child or membership rows belonging to another entity           |
| `_counts`   | Precomputed totals for a defined leaderboard scope             |

Use these column names consistently:

| Concept                         | Name                                                    |
| ------------------------------- | ------------------------------------------------------- |
| Public tied rank                | `rank` or `{scope}_rank`                                |
| Internal deterministic position | `position` or `{scope}_position`                        |
| Result mode                     | `result_type` with `single` or `average`                |
| Geographic ranking level        | `scope` with `world`, `continent`, or `country`         |
| Scope identity                  | `region_id`, with an empty value for World              |
| Source result                   | `result_id`                                             |
| Projection generation           | `generation_id` if generation identity becomes explicit |
| Metric definition version       | `metric_version`                                        |
| Product event-set version       | `event_set_version`                                     |

`sub_rank` is an existing internal name, but new schemas should prefer
`position`. If existing tables are renamed, perform that change as an explicit
migration rather than exposing either name in the UI.

Do not include `_entries` in new table names. It does not identify a list or
stat purpose. A rename of a published table needs an explicit migration in the
same change.

## Active projection graph

The default import activates shared facts and the result, person-event,
competition, city, Sum-of-Ranks, and yearly-person projection groups:

```text
raw results + dimensions
└── result_facts
    ├── temporary solve_facts_stage
    │   ├── result_rankings_single
    │   └── result_rankings_average
    ├── person_event_rankings
    └── city, yearly, competition, and Sum-of-Ranks projections
```

Registration alone does not activate a future projection. Only the explicit
default set is built, published, required by readiness checks, and exposed
through public route handlers.

## Person-competition rankings

### `person_competition_counts` and `person_competition_year_counts`

The all-time count table has one row per person. The yearly count table has one
row per person and competition year. Both tables store normalized gender and
count distinct competition IDs from `result_facts`.

The all-time ranking table stores common scope and single-gender cohorts.
Yearly and multi-gender requests rank the compact count tables in cached,
bounded windows. The public rank uses `RANK()` by competition count. The stable
position orders tied rows by `person_id`.

## Person activity rankings

### `person_activity_counts`, `person_activity_rankings`, and `person_activity_ranking_counts`

The count table has one all-time row per person. It stores host-country count,
competed-round count, and official-solve count. Competition totals remain in
`person_competition_counts` and are not copied into this table.

An official solve is a positive `result_attempts.value`. A competed round is
one stored `result_facts` row. The count table carries current normalized
gender, country, and continent values for lazy cohorts.

The ranking table stores World, all-gender rows for each new activity metric.
Its public rank uses `RANK()` by descending metric value. Its stable position
orders tied rows by `person_id`.

Region and gender combinations rank the compact count table in cached,
bounded windows. The competition metric uses the existing person-competition
ranking tables.

## Core fact table

### `result_facts`

Source row:

```text
one row per official WCA result
```

Columns:

```text
result_id
event_id
person_id
gender
person_country_id
person_continent_id
competition_id
competition_year
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

`gender` is normalized once to `m`, `f`, or `o` at the shared source row.
This removes repeated profile lookups from solve, Average-result,
person-event, and city staging while adding only one compact dimension to the
fact row.

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

Supported yearly Single and Average paths use these fact indexes:

```text
(competition_year, event_id, person_id, person_country_id, best, result_id)
(competition_year, event_id, person_id, person_country_id, average, result_id)
```

## Person-event rankings

### `person_event_rankings`

List row:

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
```

Physically splitting this into `person_event_single_rankings` and
`person_event_average_rankings` remains acceptable if benchmarks show a
meaningful storage or query advantage. If split, both tables must retain the
same column vocabulary.

Display names and competition names should normally be joined after paging.

Generation reads canonical positive personal-best values from `ranks_single`
and `ranks_average`, then probes the person/event fact index only to resolve
the earliest result that achieved each value. This replaces two window passes
over all historical result candidates. The reduced best-result set receives
the required World, continent, and country sorts. Normalized gender is carried
from `result_facts`, so this stage does not repeat the profile join.

Person search is deliberately a two-step lookup. Search `persons` first, using
its `(wca_id, sub_id)` and `name` indexes for exact WCA IDs and prefix names.
Regex name searches may scan `persons`, but must not scan this projection.
After resolving the selected `person_id`, query this projection through:

```text
(person_id, event_id)
```

`person_id` is the canonical WCA identifier in projections; do not duplicate it
as a separate `wca_id` column.

## Individual-result rankings

### `result_rankings`

Logical list row:

```text
Single: official attempt
Average: official result
```

Columns:

```text
result_id
result_type
event_id
person_id
gender
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

Separating result types physically bounds each window build and avoids
repeating `result_type` in every row and browse index. Single additionally
stores `attempt_number` and `competition_start_date`, which are part of its
deterministic attempt order.

Their ordering should be deterministic:

```text
Average: result_value, result_id
Single: result_value, competition_start_date, competition_id, result_id, attempt_number
```

Result rankings expose the same position-addressable page contract as the other
list surfaces. Tied rank and stable position are separate: rank is calculated
with `RANK()` from `result_value`, so it equals one plus the number of official
rows with a strictly better value and skips ranks after ties. Position uses the
deterministic ordering above to give every row a stable address. The World,
continent, and country position columns support direct page windows, backward
loading, and jumps without large offsets.

The projections omit round metadata, person names, competition names, and
country display names. Average competition dates are joined from
`result_facts` only for lazy date-filtered cohorts. Single retains its date
because exact attempt ordering and its measured lazy index require it.

Gender is stored as one normalized base column, not as separately materialized
cohort tables. Unfiltered World, continent, and country positions remain the
common precomputed path. Gender and year combinations are ranked in bounded,
generation-keyed lazy windows. This retires three tables that expanded results
into overlapping gender sets and repeated the same scope sorts.

Person search uses the same `persons`-first lookup described for person-event
rankings. Once a `person_id` is selected, use projection indexes matching the
two exposed result views:

```text
(person_id, event_id, world_position, result_id[, attempt_number])
```

No result-ranking query should apply `LIKE`, `REGEXP`, or another name search to
projection display columns.

### `result_ranking_counts`

Stat row:

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
internal `position`, plus Kinch score/rank/position columns. Country-scope rows
also store the person's continent Kinch score with country-cohort rank and
position, so a national list can be ordered by either NR Kinch or each person's
CR Kinch. Missing events contribute a fallback rank equal to the number of
ranked competitors for that event and region plus one. A person enters the
World cohort after recording a result in any included event, and enters a
regional cohort after representing that historical region in any included
event. Equal totals use competition ranking (`1, 1, 3`), while positions break
ties by WCA ID for stable positional paging.

The stored geographic cohorts are the common path and remain directly pageable.
Each score row also stores the person's normalized current gender. Gender
selections are request-specific cohorts: MariaDB filters them through
score-oriented indexes, computes ranks lazily, and caches a 400-row window so
adjacent pages do not repeat the window calculation. The first unfiltered World
windows for Single Sum of Ranks, Average Sum of Ranks, and Kinch are warmed
during deployment and pinned for the active export generation. Less common
gender/region cache windows are populated only when requested.

A pre-change local `ANALYZE FORMAT=JSON` of the female World Single cohort took
1.50 seconds. It read all 291,958 World score rows and performed the same number
of person lookups; about 1.00 second was spent in that lookup join. Persisting
normalized gender and joining display data only after window paging removes
that fan-out. The next projection build reports the new covering index as its
own phase so its build and storage cost can be reviewed independently.

Kinch combines the current 17-event set into one score. Each normal event uses
`100 × scope reference result ÷ personal result`, while FMC, 3BLD, 4BLD, and
5BLD use the better of the Single and Average ratios. Multi-Blind uses the
special points-and-time formula. A missing event contributes zero. The
user-facing overall score divides that sum by all 17 events and therefore
ranges from 0 to 100, with higher scores ranking first. Kinch is exposed as a
single combined ranking; Sum of Ranks retains separate Single and Average
rankings. Country Kinch pages default to NR Kinch ordering; `kinch=continent`
orders the same country cohort by the stored CR Kinch companion values.

The event-value intermediate is dropped after the score build. It is not a
published schema or readiness dependency because the product currently shows
only overall rankings; event-level values remain available from the existing
person-event ranking projections. Names and countries are joined only after
selecting a score page. Counts use the score browse index rather than another
persisted stat row.

### Earlier persistent-intermediate Sum of Ranks benchmark

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

| Phase                                          | Duration |
| ---------------------------------------------- | -------: |
| Aggregate historical Single and Average bests  |   86.8 s |
| Unpivot historical bests                       |    1.3 s |
| Load World Single event values                 |    1.5 s |
| Load World Average event values                |    1.4 s |
| Rank country event values                      |   11.1 s |
| Rank continent event values                    |   63.8 s |
| Calculate event penalties and Kinch references |    3.6 s |
| Aggregate and rank person scores               |  132.6 s |
| Index person scores                            |   12.3 s |

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
and 59.9 seconds respectively. Ranking projection work accounted for
most of the remaining time. The first generation reached validation after
approximately 25 minutes 16 seconds. A later complete build and dump took
22 minutes 23 seconds; a repeat took 23 minutes 38 seconds and produced a
432 MB compressed workflow artifact.

Logical SQL replay on the VPS was worse. It exceeded 42 minutes before the
experiment was canceled, so no transfer tables were published. The dump
included secondary indexes in each table definition, causing MariaDB to
maintain those indexes while loading millions of rows.

Caching only the compressed WCA archive therefore does not remove the dominant
cost: importing raw data and rebuilding all selected projections and indexes
inside a cold MariaDB instance. Transfer artifacts are now cached by export
date and projection-schema hash so unchanged deploys can reuse a validated
generation. Daily Actions builds omit secondary indexes from leaf projections.
Their exact desired definitions are read from the projection SQL and stored in
transfer metadata, so the importer bulk-loads index-free rows and constructs the
final indexes once. `result_facts` keeps its builder-side indexes because later
projection groups use them. Benchmark builds opt out of deferral and run against
fully indexed canonical tables before packaging. A future runner experiment may
still benefit from caching a validated imported database snapshot or building
only the projection group being deployed.

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
seconds. Result browsing uses `result_rankings`. Removing unused result-table
indexes reduced the next cold build and dump to 24 minutes 15 seconds, a 42.9%
reduction. Production transfer and publication completed in 5 minutes 08
seconds, a 27.2% reduction. Deferred-index work fell to 17 indexes and about 43
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

Overall Sum of Ranks and Kinch pages and profile totals read
`person_sum_of_ranks_scores`. A profile calculates its per-event Kinch details
from indexed rows in `person_event_rankings`.

## Time-based rankings

### `person_year_rankings_single` and `person_year_rankings_average`

List row:

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

## Competition and city statistics

### `competition_stats`

Stat row:

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

Stat row:

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

List row:

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

Stat row:

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

Projection release order:

```text
1. Read the active generation and calculate the semantic plan
2. Calculate the release plan for the selected WCA export
3. Hydrate exact cached dependencies
4. Build the missing groups in dependency waves
5. Prepare transfer tables, export them, and create the release coordinate
6. Validate the deployment plan and import the transfer tables
7. Build deferred indexes and publish the candidate generation
8. Atomically activate and verify the candidate generation
```

Each job in the declarative catalog defines:

```ts
{
  id,
  dependencies,
  sqlFiles,
  tables,
  releaseGroup,
  releaseOrder,
  releaseSchemaVersion,
}
```

The catalog supports dependency ordering, selective builds, per-projection
timing, row counts, validation, and controlled concurrency. The release plan
defines the activation boundary. A group build publishes only its owned tables.
Failures leave the active generation intact.

Projection builds log a start and finish record for every physical table,
including temporary build tables, with elapsed milliseconds. Physical tables
include their indexes in the table duration. Registered projections
also retain their projection-level duration and validated row counts. A failed
table and its containing projection both log their elapsed time before the
error aborts publication.

### Historical local result-ranking backfill benchmark

The first targeted all-results backfill ran on 2026-07-29 against 6,750,045 raw
`results` rows. The logical projection was split into physical Single and
Average tables to bound peak window-sort space:

| Table                     |         Rows |      Data |    Indexes |            Build time |
| ------------------------- | -----------: | --------: | ---------: | --------------------: |
| `result_rankings_single`  |    6,564,373 | 911.0 MiB |  888.8 MiB | about 4m 15s observed |
| `result_rankings_average` |    5,890,382 | 818.0 MiB |  797.8 MiB |              3m 40.4s |
| `result_ranking_counts`   | scope counts |   0.3 MiB | negligible |                  8.2s |

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

These numbers predate attempt-level Single rankings and are not a baseline for
the current projection shape. The next GitHub Actions benchmark is the
authoritative measurement for shared fact gender, facts-first index-free solve
staging, one bulk Single index build, lazy gender cohorts, canonical
person-event best staging, and sort-free metric reference joins.

## Future architecture decisions

These decisions affect future migrations or planned projection layers; they do
not make the current contract provisional:

1. Whether a future metric version should use different event sets or Kinch
   aggregation semantics.
2. Whether yearly source indexes justify their storage cost.
3. Whether competition-wide pages need another event-normalized list.
4. Which system cohorts are large or frequent enough to materialize.
5. Whether explicit `generation_id` columns add value beyond atomic table
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
- #43: competition, podium, city, and geographic rankings
