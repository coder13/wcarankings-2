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
rows and queues granular projection jobs. The refresh reads the official
`results` and `result_attempts` inputs. It updates the supported provisional
result, person-event, regional competition, medal, city, and competition
statistic projections from the same live data.

For person-event and result rankings, the worker rebuilds only the affected
continent and country slices. It keeps the World rank and World position from
the official export. A live-only row uses zero for those two fields. The
`is_provisional` flag identifies rows that contain a live result.

Person-stat ranking jobs use these metric keys: `country-count`, `round-count`,
and `solve-count`. Each job rebuilds one period, scope, region, gender, and
metric slice from `person_period_metrics`.

The worker rebuilds all-time (`period_year = 0`) and current-year slices. It
rebuilds World, continent, and country scopes for `all`, `m`, `f`, and `o`.

The generated serving table remains `person_activity_rankings`. Its stored
metric values remain `countries`, `rounds`, and `solves` until the web API can
rename them consistently.

Active live rows replace the published derived statistics until the next
official export. When that export arrives, disable or remove the source; the
official pipeline remains authoritative.

Only current-year competition IDs can be registered. Historical results must
continue to use the official export and its source-manifest rebuild path.
