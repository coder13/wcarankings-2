# Person-competition rankings

Status: **Active**

## What it ranks

This statistic ranks people by the number of distinct competitions in which
they have a result. It supports World, continent, and country cohorts. It also
supports one or more normalized gender values: `m`, `f`, and `o`.

The all-time view counts every official competition for a person. A yearly view
counts only competitions with results in the selected calendar year. For
example, the 2023 view ranks each person by the number of distinct competitions
that person attended in 2023.

A list row represents a scope, region, gender, and person.

## Source data

The build reads `result_facts` and `persons`, then counts distinct
`competition_id` values per person. Both count tables store the current
normalized person gender. It stores all-time counts in
`person_competition_counts` and yearly counts in
`person_competition_year_counts`.

The all-time projection expands common World, continent, country, and
single-gender cohorts. The yearly and multi-gender paths rank the compact count
tables when a request needs them.

The SQL is in
[person_competition_rankings.sql](../../data-tools/projection-catalog/people/competition-rankings/person_competition_rankings.sql).

## Indexes

The source needs `(person_id, competition_id)` on `result_facts` for the
distinct-competition count. The published tables need:

- primary key `(person_id)` on the all-time count table;
- gender page index `(person_gender, competition_count, person_id)` on the
  all-time count table;
- primary key `(year, person_id)` on the yearly count table;
- gender page index `(year, person_gender, competition_count, person_id)` on
  the yearly count table;
- primary key `(scope, region_id, gender, person_id)` on the ranking table;
- page index `(scope, region_id, gender, position, person_id)`;
- matching primary key on the ranking-count table.

## EXPLAIN summary

The original plan used a reversed person-first index path for the distinct
count. The review identified the missing person-first index. The new index
supports the count without scanning the full fact set for each person. Cohort
expansion is small compared with the source count.

On 2026-08-05, a direct 2023 request for genders `f,o` read approximately
908,541 fact rows and took `23.136 s`. That query is not used by the API. The
yearly count table reduces the request input to one row per person and year.
It also stores normalized gender, so a multi-gender World query filters before
its rank window.

On the same dataset, `EXPLAIN` for the 2023 World `f,o` window used
`idx_person_competition_year_counts_gender` with a range scan. MariaDB estimated
11,113 index rows. The rank window uses a temporary table and filesort. This is
acceptable because it ranks the compact gender cohort, not raw result facts.

## Build evidence

Earlier full export:

- person counts: `580.756 s` (`09:40.76`), `293,533` rows;
- rankings: `26.755 s` (`00:26.76`), `1,761,198` rows;
- counts: `0.868 s`;
- complete group: `608.885 s` (`10:08.89`).

The count stage remains the main build target. A new benchmark must compare rows
examined and index use after result-facts changes.

Targeted Bespin build on 2026-08-05:

- all-time count table: `14.454 s`;
- all-time count rows: approximately `292,875`;
- yearly count rows: approximately `521,220`;
- all-time count table: `15.3 MB` data and `10.0 MB` indexes;
- yearly count table: `27.9 MB` data and `18.4 MB` indexes.

The build runner did not emit a final duration after it created all four tables.
The observed complete build took less than six minutes. Record an exact phase
duration during the next release build.

## Request policy

Use the count table for totals and the page index for ranking pages. Join person
display data after selecting the bounded page.

All-time requests with no gender filter or one gender filter use the eager
ranking table. Yearly requests and requests with two or more genders use a
400-row lazy window from the compact count table.

The lazy cache key contains the data version, scope, region, sorted gender set,
year, and window start. The shared rankings cache coalesces equal requests and
clears when a new data generation becomes active.

On 2026-08-05, the 2023 World `f,o` endpoint returned 5,735 people. Across 13
uncached 400-row windows, cache-miss p95 was `189.2 ms`. Across the same cached
windows, p95 was `6.2 ms`. Three equal uncached requests coalesced into one
database load.

## Pending activation evidence

Record an exact duration for the complete targeted build during the next release
build. The table rows, query plan, cache-miss time, cache-hit time, and
concurrent-request behavior are measured above.
