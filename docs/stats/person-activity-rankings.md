# Person activity rankings

Status: **Planned**

## What it ranks

This statistic ranks people by four all-time activity values.

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
`person_activity_rankings` stores the common World, all-gender ranking for
each new metric. `person_activity_ranking_counts` stores its row totals.

## Request policy

The API is `/api/rankings/people/activity`. Its `metric` value is one of
`competitions`, `countries`, `rounds`, or `solves`.

The `competitions` metric delegates to the existing person-competition ranking
service. It reuses `person_competition_counts` and its stored World ranking.

The common World, all-gender pages for the new metrics use stored positions.
Region and gender requests rank `person_activity_counts` in a 400-row cached
window. The cache key includes the generation, metric, scope, region, gender
set, and window start. Equal cache misses use the shared in-flight cache.

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

### Measured

No build or request measurement exists for this projection yet.

### Pending

- Run `EXPLAIN FORMAT=JSON` for a World gender page and a continent page.
- Measure cache miss, cache hit, and coalesced 400-row windows.
- Measure the temporary attempt-count phase, aggregate phase, ranking phase,
  and complete group duration on the reference export.
- Record source rows, output rows, table size, and index size.

No local import, refresh, or projection build ran for this change.
