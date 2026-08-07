# Provisional live results

The provisional-results worker reads live competition results and builds a
separate current-year ranking overlay. It never writes to the official WCA
export tables or the normal ranking projections.

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
rows and queues only its changed event IDs. Each queued job rebuilds that one
event's current-year world, continent, and country rows.

`provisional_current_year_rankings` is intentionally separate from official
ranking tables. It is an operator-visible overlay until an API response can
clearly label results as provisional. When the next official export arrives,
disable or remove the source; the official pipeline remains authoritative.

Only current-year competition IDs can be registered. Historical results must
continue to use the official export and its source-manifest rebuild path.
