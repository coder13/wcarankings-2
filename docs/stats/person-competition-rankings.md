# Person-competition rankings

Status: **Active**

## What it ranks

This statistic ranks people by the number of distinct competitions in which
they have a result. It supports World, continent, and country cohorts and the
normalized gender values `m`, `f`, and `o`.

A list row represents a scope, region, gender, and person.

## Source data

The build reads `result_facts` and `persons`, then counts distinct
`competition_id` values per person. It expands compact person counts into
supported geographic and gender cohorts.

The SQL is in
[person_competition_rankings.sql](../../sql/ranking-projections/person_competition_rankings.sql).

## Indexes

The source needs `(person_id, competition_id)` on `result_facts` for the
distinct-competition count. The published tables need:

- primary key `(person_id)` on the count table;
- primary key `(scope, region_id, gender, person_id)` on the ranking table;
- page index `(scope, region_id, gender, position, person_id)`;
- matching primary key on the ranking-count table.

## EXPLAIN summary

The original plan used a reversed person-first index path for the distinct
count. The review identified the missing person-first index. The new index
supports the count without scanning the full fact set for each person. Cohort
expansion is small compared with the source count.

## Build evidence

Earlier full export:

- person counts: `580.756 s` (`09:40.76`), `293,533` rows;
- rankings: `26.755 s` (`00:26.76`), `1,761,198` rows;
- counts: `0.868 s`;
- complete group: `608.885 s` (`10:08.89`).

The count stage remains the main build target. A new benchmark must compare rows
examined and index use after result-facts changes.

## Request policy

Use the count table for totals and the page index for ranking pages. Join person
display data after selecting the bounded page.
