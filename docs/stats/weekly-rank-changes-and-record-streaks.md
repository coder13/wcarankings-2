# Weekly rank changes and record streaks

Status: **Planned**

## What it ranks

These are separate time-based statistics:

- weekly rank changes compare a current ranking with the ranking before the latest competition week;
- record streaks rank periods of record ownership by event, result type, scope, and region.

The two products must remain separate. A rank change measures movement. A record
streak measures ownership duration.

## Source data

No SQL for these statistics exists in the active projection catalog. A future
implementation will read historical result facts, ranking inputs, and
competition dates.

## Indexes

The planned tables need keys for event, person, competition week, result type,
scope, region, and record or rank position. The exact index set must follow a
bounded request shape. Do not add wide indexes before measuring the candidate
query.

## EXPLAIN summary

The review found that the weekly-delta queries use 11 filesorts, 7 temporary
nodes, repeated raw-result scans, and a join buffer. The record-streak queries
have the same structure at smaller scale. The next design must materialize
weekly or scoped inputs once, add equality joins, and rank the reduced stage.

## Build evidence

No trusted full-build timing is recorded. These statistics must remain planned
until the team measures source rows, temporary-stage size, build time, and
request latency.

## Activation rule

Before adding either statistic to a deployment group, update its stat file,
request tests, count contract, cache key, and `EXPLAIN ANALYZE` record. The
request must meet the shared 200 ms target or use lazy loading with a bounded
cached window.
