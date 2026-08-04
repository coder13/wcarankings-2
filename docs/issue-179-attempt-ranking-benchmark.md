# Issue #179 attempt-ranking benchmark

Run on 2026-08-02 in an isolated MariaDB 11.8 database on Bespin, using the
latest public WCA v2 export. The measurements cover 29.2M valid attempts.
The original measurements were benchmark artifacts. The follow-up plan review
below records the projection design selected from them.

## Measured layouts

| Layout | Build time | Ranking data | Ranking indexes | Ranking total |
| --- | ---: | ---: | ---: | ---: |
| One table: World, continent, country, and personal windows | 47m 52s | 4.86 GB | 4.23 GB | 9.09 GB |
| Staged: World, continent, country table plus personal table | 25m 29s | 6.21 GB | 5.41 GB | 11.62 GB |
| Common-path: World and continent table only | 15m 13s | 3.88 GB | 3.21 GB | 7.09 GB |

The original benchmark recorded 4.60 GB for its `solve_facts` variant. The
follow-up local review of the production-shaped table measured about 2.9 GB of
data plus 4.8 GB of indexes, so that earlier total is not a reliable storage
estimate for the implemented projection.

## Query checks

On warm data, first 101-row pages were effectively tied between the one-table
and staged layouts:

| Query | One table | Staged regional table |
| --- | ---: | ---: |
| Female 3x3 World | 16.4 ms | 17.5 ms |
| Male 3x3 Canada | 19.9 ms | 21.7 ms |

## Follow-up plan review

The 55-minute `solve_facts` build observed in GitHub Actions combined the CTAS,
primary key, and three wide secondary indexes. On the current local dataset,
the persistent table contains about 29.2M attempts, 2.9 GB of data, and 4.8 GB
of secondary indexes. That aggregate duration cannot be split retroactively.

A bounded `ANALYZE` of 500K source rows measured the forced facts-first join at
1.08 seconds versus 16.07 seconds for the optimizer's persons-first plan. The
projection therefore materializes one minimal temporary stage with
`STRAIGHT_JOIN` in `result_facts -> result_attempts` order, builds
`result_rankings_single` and `result_rankings_average` from it, and drops it.
Normalized gender is materialized once on `result_facts`, so the solve stage no
longer repeats the profile lookup. The stage has no primary or secondary
indexes because both consumers scan it.

`person_id` and `competition_id` are functionally determined by `result_id`.
Removing them would make the temporary row narrower, but both consumers need
those dimensions for partitions and deterministic ordering. That normalized
variant would trade temporary disk for tens of millions of fact lookups. It is
an A/B candidate, not an evidence-backed production change.

The uncached Single fallback now reads the already-persistent
`result_rankings_single` table. Full-row JSON plans selected the former
gender/country index for gender-only and gender/country filters, but did not
select either event-region/value index for the year/continent case. Only the
gender/country index is retained on the persistent ranking table. All proven
Single indexes are built in one `ALTER TABLE` so MariaDB does not repeatedly
scan or rebuild the 29M-row output. The next projection build separately times
the temporary CTAS, result materialization, and bulk index phase.

## Lazy country/year check

For `m / 333 / Canada / 2023`, the unindexed source filter scanned all 29.2M
solves and took 7.60 seconds. A benchmark-only covering index on
`(gender, event_id, country_id, competition_start_date, solve_value,
competition_id, result_id, attempt_number)` built in 1m 27s and reduced the
same filter to 25.8 ms. Ranking the 43,174 matching solves and returning the
first 101 rows took 66.8 ms.

This makes indexed lazy country/year ranking a viable fallback. It should use a
date range rather than `YEAR(competition_start_date)` so the index remains
sargable. The retained copy now belongs to `result_rankings_single`, and its
build phase reports an independent duration for the next storage review.
