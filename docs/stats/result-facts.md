# Result facts

Status: **Foundation**

## What it represents

`result_facts` is one narrow, derived row for each official result. It carries
the fields needed by result rankings, person rankings, yearly rankings, city
statistics, and metric builds.

It is not a public ranking. It prevents each downstream query from repeating
the same joins to results, competitions, persons, countries, formats, and round
types.

## Source data

The build reads `results` for result values, IDs, and represented country;
`competitions` for the start date and year; `persons` for normalized gender;
and `countries` for the historical represented continent. It also reads
formats and round types for result metadata.

Metric builds must use the historical region on the result when the statistic
is historical. They must not replace that region with the person's current
country.

## Indexes

The current definition creates:

- primary key `(result_id)`;
- `(person_id, event_id, competition_start_date, result_id)`;
- `(person_id, competition_id)`;
- `(competition_id, event_id, result_id)`;
- year/event/person indexes for yearly Single and Average bests;
- covering Single and Average ranking indexes.

The index list is in
[result_facts.sql](../../sql/ranking-projections/result_facts.sql).

## EXPLAIN summary

The full scan of `results` is expected. The build publishes almost every raw
result, so an index cannot remove the main scan. The important plan requirement
is indexed dimension lookup after the fact row is selected. The review found
those joins indexed.

The person-competition review found that a person-first access path was needed
for `COUNT(DISTINCT competition_id)`. The `(person_id, competition_id)` index
now provides that path.

## Build evidence

Measured export:

- table build: `273.586 s` (`04:33.59`);
- projection total: `274.910 s` (`04:34.91`);
- output: `6,766,989` rows.

Changes to this table must include a fresh build measurement and a storage
review.

## Request policy

Requests must read a bounded page from a downstream projection. They must not
rank directly from `result_facts` during a normal list request.
