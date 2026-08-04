# Proposed statistics experiment harness

This branch is an experiment only. It is based on the head of the PR 182
branch, `feature/issue-179-lazy-cohort-rankings`, and does not register any of
these statistics for production builds.

Run it with a read-only production-shaped database connection:

```bash
DATABASE_URL='mysql://user:password@host:3306/database' \
  node scripts/benchmark-proposed-stats.mjs \
  --output=docs/benchmarks/proposed-stats-results.json
```

For local MariaDB, use the existing container credentials without printing
them. Do not run a ranking refresh or import for this experiment. The script
only creates and drops connection-local temporary tables; it does not alter
the persistent schema.

The harness records:

- source table row and byte estimates, columns, and current indexes;
- pre-computation/materialization time, output row count, and a bounded
  consumer query for medal collection overall/by event, ranked-event coverage,
  most competitions, and yearly top-100 appearances;
- one shared `result_facts` + `result_attempts` attempt stage versus separate
  consumers for solves by competition and year, blindfolded success, and one
  six-column Sub-X scan (`<3s` through `<8s`);
- a shared historical result-fact stage versus direct scans for oldest records,
  World records per event, World records in most events by person/competition/
  country, and three as-of top-100 ranking dates;
- `EXPLAIN FORMAT=JSON` plans for each source and consumer query.

Use `--section=aggregations`, `--section=attempts`, or
`--section=historical` to rerun one area. Materialization time is the
incremental pre-computation cost. Bounded consumer time is a separate
query-runtime signal; it is not included in the persistent daily build cost
unless the product design chooses to materialize that aggregate.

## Interpretation rules

The experiment is not a product recommendation by itself. A candidate should
not enter the daily projection registry unless its product value is explicit
and its incremental build cost is acceptable. In particular:

- the shared attempt stage must beat the separate scans after including stage
  materialization and all consumers; a large temporary stage with no total-time
  win is a rejection for the daily build;
- historical/as-of ranking and record stages should remain lazy or batch-only
  when they require repeated full result-fact scans;
- active projections are evidence of source support, not evidence that another
  leaderboard is free to add.

The generated JSON reports are the durable measurement artifacts. Each includes
the branch and timestamp so results from a different export or branch are not
mistaken for this experiment's evidence.

## Scoped full-export measurements — 2026-08-04

These runs used one repetition against the local export on
`agent/stats-experiment-harness`. The database contained 6,572,230 result facts
and 31,062,285 raw attempts. They are directional wall-clock measurements; the
exact inventory, plans, and timings are preserved in the scoped JSON artifacts.

### Materialized aggregations

| Candidate                          | Output rows | Materialization | Consumer |    Total |
| ---------------------------------- | ----------: | --------------: | -------: | -------: |
| Medal collection, overall          |      19,967 |          212 ms |     7 ms |   219 ms |
| Medal collection, grouped by event |      66,915 |          553 ms |    14 ms |   567 ms |
| Ranked events per person           |     292,207 |        1,231 ms |    73 ms | 1,304 ms |
| Most competitions per person       |     293,298 |        7,536 ms |    71 ms | 7,607 ms |
| Top-100 Single appearances         |       5,423 |        1,541 ms |     2 ms | 1,543 ms |
| Top-100 Average appearances        |       4,693 |        1,341 ms |     2 ms | 1,343 ms |

The medal queries use `competition_podium_members`, including gold, silver,
bronze, and total counts at the person grain. The top-100 queries are
intentionally separate Single and Average aggregates, matching the two tables
in the reference UI. Most competitions scans all result facts even though the
existing person/competition index is present; this is a candidate for a lazy or
batch projection, not a free daily addition.

### Attempt-based work

The exact scoped attempt run is preserved in
`proposed-stats-scoped-attempts.json`. It compares separate competition/year
solve counts, blindfolded counts, and one conditional-count consumer for
`<3s`, `<4s`, `<5s`, `<6s`, `<7s`, and `<8s`. Attempt values are WCA
centiseconds, so the thresholds are 300, 400, 500, 600, 700, and 800.

| Attempt consumer              | Separate scan | Shared consumer |
| ----------------------------- | ------------: | --------------: |
| Most solves, one competition  |    499,571 ms |      347,319 ms |
| Most solves, one year         |    391,374 ms |      344,131 ms |
| Blindfolded success aggregate |     11,944 ms |       23,192 ms |
| Sub-X six-column aggregate    |    657,032 ms |      344,050 ms |
| Shared attempt stage          |             — |      108,222 ms |
| Total                         |  1,559,921 ms |    1,166,914 ms |

The earlier baseline run in `proposed-stats-results.json` measured three
attempt consumers at 1,044,169 ms separately versus 499,851 ms with a shared
31,138,860-row stage. The scoped run is authoritative for the clarified UI
definitions. The shared shape is about 25% faster overall, but its 19-minute
27-second total and 31M-row solve grain still reject daily materialization
without clear product value and a narrower design.

### Historical records and as-of rankings

The expanded run measured 62,855 ms for direct scans and 94,361 ms for the
shared 6,572,854-row stage plus eight consumers. The shared stage was about
1.50× slower. Direct outputs included 307 person scopes, 799 competition
scopes, 39 country scopes, and 21 event rows for World-record aggregates. The
latest as-of ranking took 32,777 ms direct and 55,730 ms from the shared stage.

Conclusion: medal collection and top-100 appearances have low enough
pre-computation cost to remain product candidates. Most competitions is
measurable but materially more expensive. Reject daily materialization for
attempt, record-history, and as-of ranking statistics in this shape; a product
decision must justify the cost and a narrower snapshot/index design must be
measured first. None of these statistics is registered or exposed by this
branch.
