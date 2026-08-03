# Issue #179 attempt-ranking benchmark

Run on 2026-08-02 in an isolated MariaDB 11.8 database on Bespin, using the
latest public WCA v2 export. The measurements cover 29.2M valid attempts.
They are benchmark artifacts only; no production projection or API routing is
included in this branch.

## Measured layouts

| Layout | Build time | Ranking data | Ranking indexes | Ranking total |
| --- | ---: | ---: | ---: | ---: |
| One table: World, continent, country, and personal windows | 47m 52s | 4.86 GB | 4.23 GB | 9.09 GB |
| Staged: World, continent, country table plus personal table | 25m 29s | 6.21 GB | 5.41 GB | 11.62 GB |
| Common-path: World and continent table only | 15m 13s | 3.88 GB | 3.21 GB | 7.09 GB |

`solve_facts`, shared by every layout, took 4.60 GB (2.87 GB data and
1.74 GB indexes). The independently measured personal companion table is
2.97 GB, so the complete common-path layout is expected to use about 10.05 GB
of ranking tables and take roughly 20 minutes after `solve_facts` exists.

## Query checks

On warm data, first 101-row pages were effectively tied between the one-table
and staged layouts:

| Query | One table | Staged regional table |
| --- | ---: | ---: |
| Female 3x3 World | 16.4 ms | 17.5 ms |
| Male 3x3 Canada | 19.9 ms | 21.7 ms |

## Current conclusion

Keep `solve_facts` as the canonical attempt grain and keep personal history in
a compact companion table. Eagerly materialize the common World/continent
singleton-gender paths; leave country, multi-gender, and year cohorts lazy
until their indexed-query and cache-warming behavior is measured. This avoids
the 48-minute monolithic build while preserving indexed first pages for the
common paths.

The next measurements are the lazy country/year query plan and cache-fill time,
then a separate average-result benchmark using the same personal-history
pattern.

## Lazy country/year check

For `m / 333 / Canada / 2023`, the unindexed source filter scanned all 29.2M
solves and took 7.60 seconds. A benchmark-only covering index on
`(gender, event_id, country_id, competition_start_date, solve_value,
competition_id, result_id, attempt_number)` built in 1m 27s and reduced the
same filter to 25.8 ms. Ranking the 43,174 matching solves and returning the
first 101 rows took 66.8 ms.

This makes indexed lazy country/year ranking a viable fallback. It should use a
date range rather than `YEAR(competition_start_date)` so the index remains
sargable, and its index/storage cost still needs to be measured on the final
`solve_facts` artifact before production adoption.
