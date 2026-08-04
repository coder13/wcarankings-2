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
- materialization time, row count, and a bounded top-100 consumer query for
  medal collection, ranked-event coverage, and yearly top-100 appearances;
- one shared `result_facts` + `result_attempts` attempt stage versus three
  separate scans for solves by competition/year, blindfolded success, and
  Sub-X solves;
- a shared historical result-fact stage versus direct scans for standing World
  records, records in the most events, and three as-of top-100 ranking dates;
- `EXPLAIN FORMAT=JSON` plans for each source and consumer query.

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

The generated JSON report is the durable measurement artifact. It includes the
branch and timestamp so results from a different export or branch are not
mistaken for this experiment's evidence.

## Full-export measurement — 2026-08-04

This run used one repetition against the local export on
`agent/stats-experiment-harness`. The database contained 6,572,230 result facts
and 31,062,285 raw attempts. A concurrent unrelated projection build was
running, so these are directional wall-clock measurements rather than a quiet-
host benchmark; the same run and query plans are preserved in
`proposed-stats-results.json`.

| Candidate                                             | Output rows | Materialization + bounded consumer | Decision                                                                            |
| ----------------------------------------------------- | ----------: | ---------------------------------: | ----------------------------------------------------------------------------------- |
| Medal collection from `competition_podium_members`    |      19,967 |                             211 ms | Low incremental cost; keep as a product-value candidate, not active yet.            |
| Ranked events per person from `person_event_rankings` |     292,207 |                           1,237 ms | Low enough to investigate further; do not add without a defined leaderboard.        |
| World top-100 appearances from yearly Single rankings |       5,423 |                           1,515 ms | Candidate for bounded materialization; do not rebuild yearly rankings for it alone. |

Attempt-based work is materially different:

- three separate scans took `1,044,169 ms` (`17:24.17`) in total;
- one shared 31,138,860-row temporary attempt stage plus three consumers took
  `499,851 ms` (`08:19.85`), about 52% of the separate total;
- the shared stage itself took `101,764 ms` before its consumers.

The shared stage is a useful experiment result, not a production approval. An
eight-minute incremental stage is still too expensive for the daily build
without strong product value and a narrower/materialized solve grain. The
blindfolded and Sub-X queries also need explicit success and threshold
semantics; the run used the configurable raw WCA attempt-value threshold
`--sub-x=10`, which produced zero rows and must not be interpreted as a product
result.

Historical work should be rejected from the daily build in its current shape:

- direct standing-record, records-in-most-events, and three as-of ranking scans
  took `41,947 ms` (`00:41.95`);
- a shared 6,572,854-row historical stage plus consumers took `79,122 ms`
  (`01:19.12`), about 1.89× slower;
- the latest as-of ranking alone took 32.311 s direct and 54.874 s from the
  shared stage.

Conclusion: keep medal collection, ranked-event coverage, and top-100
appearances as measured candidates; reject daily materialization for attempt,
record-history, and as-of ranking statistics until a product decision justifies
the cost and a narrower snapshot/index design is measured. None of these
statistics is registered or exposed by this branch.
