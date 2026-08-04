# City-event statistics

Status: **Active**

## What it ranks

This statistic ranks an exact city and country pair for an event. It reports
fastest Single, fastest Average, competitor count, competition count, and
official solve count. It supports normalized gender cohorts and the `all`
cohort.

A stat row represents a city name, country, event, and gender cohort. City
names are not merged across spelling, metro, or country boundaries.

## Source data

The build reads `result_facts`, `competitions`, and `result_attempts`.
Normalized gender comes from `result_facts`. It materializes:

1. official attempt counts;
2. city result facts;
3. gender and all scopes;
4. city-event aggregates;
5. earliest winners for tied best values;
6. the published table.

The SQL is in
[city_event_stats.sql](../../sql/ranking-projections/city_event_stats.sql).

## Indexes

Temporary scoped rows need Single and Average indexes beginning with city,
country, event, gender, value, date, competition, and result ID. Aggregate and
winner stages use full city, country, event, and gender keys.

The published table needs a primary key on city, country, event, and gender,
plus value indexes for fastest Single, fastest Average, competitors, competitions,
and official solves.

## EXPLAIN summary

The old query repeatedly expanded CTEs. The review found 18 filesorts, 14
temporary nodes, and repeated scans of about 31 million `result_attempts`
rows. The current SQL counts attempts once and materializes shared city stages.
That removes repeated expansion and gives each later phase an indexed input.

The full aggregate and winner windows remain import-time work. A request must
read the final table and never repeat the raw attempt count.

## Build evidence

The city build was under active review when this catalog was written. A final
measurement is pending. Record table time, row count, temporary-table sizes, and
the largest `EXPLAIN ANALYZE` input in the next benchmark.

## Request policy

Use final city-event indexes for bounded pages. Cache the 400-row window by event,
gender, city scope, order, generation, and window start.
