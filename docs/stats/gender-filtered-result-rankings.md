# Gender-filtered result rankings

Status: **Lazy**

## What it ranks

This statistic applies a gender filter to Single or Average result rankings. The
supported normalized values are `m`, `f`, and `o`. The filter changes the
cohort being ranked. It does not change the official result value or tie rules.

## Source data

The old design built separate eager tables for each result type and gender set.
Those tables read `result_facts`, `persons`, and a six-row gender membership
map. The current design removes the eager gender ranking SQL from the active
deployment group. The list worker and ranking service apply gender through the
lazy result-ranking path, using normalized gender stored on the base ranking.

The deleted eager SQL files are not active schema. Generation-aware cache and
in-flight query coalescing are covered by the ranking cache tests.

## Indexes

The lazy path must use a score-oriented index on the base result ranking. The
current Single table includes:

`(gender, event_id, country_id, competition_start_date, result_value,
competition_id, result_id, attempt_number)`.

The retained index supports the measured Single fallback. Future changes must
still be confirmed by `EXPLAIN ANALYZE` for World, continent, country, and all
three gender values. The query must use equality predicates. `FIND_IN_SET` is
not acceptable.

## EXPLAIN summary

The former gender query used a non-sargable membership expression. The review
found a join buffer and repeated work. Equality membership removed that specific
problem, but the eager design still paid for large gender tables during every
projection build.

The old query shape also ranked the full filtered set before the request page.
The lazy design must filter indexed base rows, rank only the bounded window,
join display data after paging, and cache the result.

## Build evidence

The old eager build cost was:

- Single: `1,402.442 s` (`23:22.44`) for `19,742,919` rows;
- Average: `1,309.549 s` (`21:49.55`) for `17,716,161` rows;
- gender counts: `97.258 s` (`01:37.26`) for `22,934` rows.

The two ranking tables consumed about `45:12`, or roughly 57% of the old
result-ranking group. The lazy replacement must report request latency, cache
hit rate, rows examined, and build time removed.

## Request policy

Gender-filtered windows are lazy. The cache key must include generation, event,
result type, scope, region, gender, order, and window start. Concurrent requests
for the same key must share one in-flight query. A request must not create one
database connection per adjacent page.
