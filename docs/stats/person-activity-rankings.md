# Person activity rankings

Status: **Active**

## What it ranks

This statistic ranks people by four activity values. The API supports all-time
and yearly values. Rounds and solves also support event filters.

- `competitions` counts distinct competition IDs.
- `countries` counts distinct host-country IDs for competitions with a stored result.
- `rounds` counts official WCA result rows.
- `solves` counts positive values in `result_attempts`.

One list row represents one person, one metric, one scope, one region, and one
gender cohort. The public rank uses `RANK()` by metric value. The stable
position orders tied values by `person_id`.

The `solves` definition matches the profile header. A positive attempt counts
as one official solve. A DNF or an empty attempt slot does not count.

One `result_facts` row represents one competitor result for one event round.
This rule counts a stored DNF round, even when it adds no solves. It does not
use `round_type_id` as an identity because that value alone is not a
competition-round key.

## Source data

The projection reuses `person_competition_counts` for competition totals. It
does not count competitions again. It reads `result_facts`, `competitions`,
`persons`, `countries`, and `result_attempts` for the other values.

`person_activity_attempt_counts` is a temporary table. It scans
`result_attempts` once and counts positive values for each result ID. The
projection drops this table after it creates `person_activity_counts`.

`person_activity_counts` stores one compact all-time row for each person. It
contains the three new values plus current gender, country, and continent fields.
`person_activity_year_counts` stores the same values by competition year.
`person_activity_event_counts` stores round and solve values by event and year.
The event table uses year `0` for all-time event totals.
`person_activity_rankings` stores the common World, all-gender ranking for
each new metric. `person_activity_ranking_counts` stores its row totals.

## Request policy

The API is `/api/rankings/people/activity`. Its `metric` value is one of
`competitions`, `countries`, `rounds`, or `solves`.

The `year` parameter selects a yearly row. The `eventId` parameter is valid
for `rounds` and `solves`.

The `competitions` metric delegates to the existing person-competition ranking
service. It reuses `person_competition_counts` and its stored World ranking.

The common World, all-gender pages for the new metrics use stored positions.
Region and gender requests rank `person_activity_counts` in a 400-row cached
window. The cache key includes the generation, metric, scope, region, gender
set, and window start. Equal cache misses use the shared in-flight cache.

The default build includes this projection. The common World lists serve the
API and profile highlights. The measured ranking phase adds 12.7 seconds to
the count-table build.

This layout also supports profile highlights. A highlight can query the
stored World ranking by metric and person ID. It does not scan result facts.

## Indexes

The temporary attempt table has primary key `result_id`. The compact count
table has primary key `person_id` for profile lookup. The common ranking table
has primary key `(metric, scope, region_id, gender, person_id)` and page index
`(metric, scope, region_id, gender, position, person_id)`.

No additional count-table index is included before a measured request plan
needs one. The lazy path reads one row per person, not raw result rows.

## Performance evidence

### Measured build

The 2026-08-05 build used MariaDB 11.8.8 and the existing local full dataset.
The source contained 6,758,694 result facts and 29,601,524 positive attempts.

| Phase                                  |       Time |
| -------------------------------------- | ---------: |
| Temporary solve counts and primary key | 198,310 ms |
| Person activity counts                 | 339,986 ms |
| Common World rankings and indexes      |  12,710 ms |
| Ranking counts and primary key         |     306 ms |
| Complete projection                    | 552,105 ms |

The build created 293,298 count rows, 878,803 ranking rows, and three ranking-count rows.
The output totals equal the source totals. Three high-value sample people also
matched raw country, round, and solve counts.

### Measured storage

| Table                            |      Data |  Indexes |
| -------------------------------- | --------: | -------: |
| `person_activity_counts`         |  29.6 MiB |    0 MiB |
| `person_activity_rankings`       |  80.7 MiB | 41.6 MiB |
| `person_activity_ranking_counts` |  0.02 MiB |    0 MiB |
| Total                            | 110.3 MiB | 41.6 MiB |

### Measured requests

The request measurements used 20 iterations and a warm database buffer pool.

| Request                      | Database p95 | HTTP p95 | Cache  |
| ---------------------------- | -----------: | -------: | ------ |
| Countries, World, first page |       1.7 ms |  11.6 ms | Bypass |
| Rounds, World, women         |      83.7 ms | 104.6 ms | Miss   |
| Solves, Europe               |     154.9 ms | 167.3 ms | Miss   |
| Rounds, World, women         |            — |   6.8 ms | Hit    |

Two equal uncached requests used one database load. One response reported
`miss`, and the other response reported `coalesced`. Both finished in 84.5 ms.

### Measured plans

The solve-count phase scans 31,062,285 estimated `result_attempts` rows. It
uses one filesort and one temporary table. This full scan occurs once per build.

The person aggregate scans 294,476 estimated `persons` rows. It reads
`result_facts` by person with `ref` access and 23 estimated rows per person.
Competition and solve-count joins use `eq_ref` access. The group operation
uses one filesort and one temporary table.

The eager request uses `idx_person_activity_rankings_page` with `range`
access. It sorts only the 51-row page and does not use a temporary table.

The lazy requests scan 293,646 estimated compact count rows. Each plan uses
two filesorts and one temporary table. Their measured p95 values meet the
200 ms target, so no additional count-table index is justified.

### Pending

- Rebuild the projection before activating the year and event filters.
- Measure the new year and event query plans and request times.

- Measure a cold database buffer pool on the release environment.
- Record the first production projection build and request measurements.

No import, raw-table refresh, or database recreation ran for these measurements.
