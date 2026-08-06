# Average result rankings

Status: **Active**

## What it ranks

This statistic ranks every valid Average by event and by World, continent, and
country scope. Tied values receive the same public rank. A stable position uses
the result ID as the tie-break.

A list row represents one official Average result.

## Source data

The build reads normalized gender and Average values directly from
`result_facts`. Only positive Average values enter the ranking. The SQL is in
[result_rankings_average.sql](../../data-tools/projection-catalog/people/result-rankings/result_rankings_average.sql).

## Indexes

The published table needs:

- primary key `(result_id)`;
- `(event_id, world_position)`;
- `(event_id, continent_id, continent_position)`;
- `(event_id, country_id, country_position)`;
- `(person_id, event_id, world_position, result_id)`.

The source `result_facts` table supplies Average value and region covering
indexes. The API must join display data after page selection.

## EXPLAIN summary

The rebuild scans valid Average facts and sorts each event partition for the
six rank and position values. The full scan and window filesorts are expected
for a complete rebuild. Dimension joins are indexed. No request path may repeat
these window functions.

## Build evidence

Earlier full export:

- table build: `224.032 s` (`03:44.03`);
- output: `5,905,387` rows.

The next benchmark must compare this result with the combined source-stage and
index-publication changes.

## Request policy

Use stored World, continent, or country positions for page navigation. Keep the
page bounded before joining names, countries, competitions, or records.
