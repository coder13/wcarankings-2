# Provisional live results

The provisional-results worker reads live competition results and rebuilds the
published ranking projections from the official export plus active live rows.
It never changes the official export tables.

The first version has two readers:

- `wca-live` uses WCA Live's public results endpoint. A competition ID is enough.
- `cubing-china` follows the existing Cubing China reader: it lists competitors
  and then reads each competitor's result rows. Its remote ID is normally the
  Cubing China live alias.

Register an active current-year competition after the app migration has run:

```sh
bun scripts/register-live-results-source.ts wca-live ExampleOpen2026
bun scripts/register-live-results-source.ts cubing-china ExampleOpen2026 example-open-2026
```

The worker hashes a canonical result snapshot. An unchanged snapshot does not
write rows or rebuild rankings. A changed snapshot replaces only that source's
rows and queues one full projection refresh. The refresh reads the shared
`results_with_live` and `result_attempts_with_live` inputs, so person rankings,
result rankings, Sum of Ranks, Kinch, medals, person metrics, competition
statistics, and city statistics all use the same live data.

Active live rows replace the published derived statistics until the next
official export. When that export arrives, disable or remove the source; the
official pipeline remains authoritative.

Only current-year competition IDs can be registered. Historical results must
continue to use the official export and its source-manifest rebuild path.
