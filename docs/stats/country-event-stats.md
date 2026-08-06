# Country-event statistics

Status: **Active**

Issue: [#232](https://github.com/coder13/wcarankings-2/issues/232)

## Product contract

Country rankings compare the countries that **hosted** official WCA results.
They do not group competitors by nationality. This matches the existing city
statistic: selecting a country asks where the competition occurred, while the
gender cohort describes the competitors whose results contribute to that
country's value.

The five public modes are:

- fastest Single;
- fastest Average;
- unique competitors;
- hosted competitions; and
- official solves.

Every mode supports an event, all-time or competition-start year, any of the
seven non-empty `m`/`f`/`o` cohorts, and World or continent scope. A country
scope is deliberately not supported because country is the ranked entity.

The canonical routes are:

```text
/countries/{fastest-single|fastest-average|competitors|competitions|solves}
/api/rankings/countries
```

The source is registered as `country-event-stats` in
`lib/ranking-stat-sources.ts`. It is eligible for a future home feed, but not a
person-profile feed.

## Projection

`country_event_stats` has one compact row per:

```text
host country + event + stat year + gender mask
```

`stat_year = 0` means all-time. The masks are `1=m`, `2=f`, `4=o`, plus the
three two-gender unions and mask `7` for all genders. The build aggregates the
three base genders first, then expands only those compact values to seven
cohorts. It does not duplicate every raw result seven times.

The row stores the fastest Single and Average values and their source result
IDs, plus competitor, competition, and official-solve counts. Fastest-result
keys sort by value, competition start date, competition ID, and result ID so
the provenance result is deterministic. Requests calculate public ties with
`RANK()` and use country ID only for the stable internal position.

Competitions are counted once if at least one competitor in the selected
cohort recorded a result for the event at that competition. Competitors are
distinct WCA IDs. An official solve is an attempt whose stored value is
positive; DNF and DNS attempts do not count.

The projection is an enabled-by-default `country-rankings` release group and
depends on `result-facts`. `result_facts` schema version 3 adds
`official_solve_count`, calculated once from `result_attempts`. City stats and
person activity stats now consume the same field instead of independently
rescanning attempts. A result-facts semantic change therefore rebuilds all
three downstream groups through the existing dependency fingerprint closure.

## Request path

The service ranks the compact cohort rows on demand. At most the host-country
cardinality participates in a window function, rather than raw result rows.
It executes the page query, total-count query, and event-specific available-year
query in parallel. Page cursors are zero-based offsets internally; a request
selects `position > start`, and the final displayed position becomes the next
cursor. This preserves tied public ranks across pages while retaining a stable
country-ID order.

Fastest rows display the country as the ranked entity and the result holder as
secondary provenance. Count rows display the metric label. Fake `country:*`
identity keys are internal React/list identities and are hidden from the UI.

## Full-data benchmark

The implementation was profiled on the existing local MariaDB WCA export,
without refreshing or mutating persistent tables. The export contained about
6.76 million result rows and 31.07 million attempt rows. One MariaDB session
used only `TEMPORARY` tables prefixed `country_232_*`; all disappeared when the
session closed.

Measured build stages:

| Stage                                                    |      Time |
| -------------------------------------------------------- | --------: |
| Shared positive-attempt count scan                       | 40.6467 s |
| Compact result-fact preparation in the benchmark harness | 31.2289 s |
| Country-event projection                                 | 77.7088 s |

The country projection produced 121,800 rows covering 131 host countries, 21
events, and 25 result years. The all-gender United States 3x3x3 competitor
count was 63,486 and exactly matched the sum of its disjoint `m`, `f`, and `o`
base-gender counts.

Representative direct SQL page-plus-count pairs took 0.325-0.542 ms after
precomputation:

| Scenario                                     |     Time |
| -------------------------------------------- | -------: |
| World fastest Single                         | 0.542 ms |
| Europe 2023 fastest Average, `f+o`           | 0.503 ms |
| World 2023 official solves, `m+f`, deep page | 0.325 ms |
| North America competitor count               | 0.482 ms |

These are database statement measurements, not end-to-end HTTP timings. They
exclude the lightweight event-year lookup added to the final service and the
response envelope. Run `pnpm benchmark:ranking-scroll:countries` against an
activated generation for the release-gate HTTP measurement. The country
ranking statements are several orders of magnitude below the issue's 2.5 s
scroll target, but the full HTTP gate still belongs in deployment verification.

The benchmark exposed a mixed-collation failure in temporary aggregate keys.
The production SQL therefore declares country and event identifiers with
`utf8mb4_unicode_ci` explicitly.

## Verification performed

- application and data-tool TypeScript checks;
- all 50 Node unit tests;
- all 54 projection, release, transfer, and activation tests;
- ranking-scroll scenario tests;
- ESLint with zero warnings, projection-table usage lint, and Knip;
- production application build and production Storybook build;
- responsive Storybook inspection at 1440 px, 759 px, and 390 px.

At 759 px all top controls shared one row and were 52 px high. At 390 px the
event, gender, continent, and year controls shared one row and were 48 px high,
meeting the 40 px touch-target requirement. Evidence is intentionally outside
Git in `~/Desktop/codex-232/`.

## Handoff notes and open questions

- Confirm the host-country interpretation with product before launch if
  "country ranking" was intended to mean competitor nationality. Changing
  this later changes every count and fastest-result provenance row.
- The country year picker is event-aware after the first response. Its loading
  fallback lists every year from the current year through 1982, so an empty
  event/year combination can briefly be selectable before data arrives.
- The shared explorer search remains person-oriented, as it is on the existing
  city and competition views. Country rows do not expose fake IDs, but a future
  country-name search or an explicit decision to hide search on location views
  would be clearer.
- Visual verification used fixture data because no persistent projection
  refresh was authorized. The next normal release build will create the active
  table because the job is enabled by default.
- Issue #230 independently introduced the same `lib/ranking-stat-sources.ts`
  seam with a `person-pr-streak` entry. Merge the two array entries; do not
  choose one file wholesale if Git reports an add/add conflict. When the
  proposed `RankingListDescriptor` foundation lands, add matching descriptor
  families instead of copying its unmerged implementation into this branch.
- Remote branch `codex-230` belongs to issue #230 and was already published at
  `2413f7d`. Publish this issue under a distinct branch (normally `codex-232`)
  unless the owner explicitly requests a combined history.
