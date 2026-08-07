# Person-year rankings

Status: **Active**

## What it ranks

This statistic ranks each person's best valid Single or Average result during a
competition start year. It supports World, continent, and country cohorts.

A list row represents a year, event, cohort, and person. Public rank uses the
result value. Position is a deterministic page key and is not user-facing.

## Source data

The build reads `result_facts` for historical result values, competition year,
and represented region. `person_year_ranking_cohorts` maps geographic cohorts
to compact IDs. The API derives available totals from the yearly ranking tables.

The SQL files are [Single](../../data-tools/projection-catalog/people/year-rankings/person_year_rankings_single.sql),
[Average](../../data-tools/projection-catalog/people/year-rankings/person_year_rankings_average.sql),
[cohorts](../../data-tools/projection-catalog/people/year-rankings/person_year_ranking_cohorts.sql), and
the yearly ranking tables.

## Indexes

Each ranking table needs:

- primary key `(year, event_id, cohort_id, person_id)`;
- browse `(year, event_id, cohort_id, position, person_id)`;
- value `(year, event_id, cohort_id, result_value, person_id)`;
- person lookup `(year, event_id, cohort_id, person_id)`.

The source fact table has year/event/value covering indexes for Single and
Average selection.

## EXPLAIN summary

The build must first reduce results to one best per person, event, year, and
historical region. The ranking window then sorts the compact candidate set. A
full rebuild still scans year-qualified facts, but it must not join display
tables for every candidate.

The review found geographic joins indexed. Window filesorts are import-time
work and are not request-time work.

## Build evidence

Earlier full export:

- complete group: `865.032 s` (`14:25.03`);
- Single: `429.099 s` (`07:09.10`);
- Average: `371.688 s` (`06:11.69`);
- counts: `35.149 s` (`00:35.15`);
- rows: `6,104,758` Single, `5,284,147` Average, `48,744` counts.

## Request policy

Year, event, cohort, and result type form the page lookup key. Counts come from
the count projection. The request must read a bounded position window.
