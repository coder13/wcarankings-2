# PR Streak rankings

Status: **Active** with lazy filtered cohorts

## Product contract

PR Streak ranks people by their longest run of consecutive competitions in
which every competition contained at least one new personal record. Higher is
better. A score must contain at least two competitions to appear.

A competition qualifies when the person improves a positive official Single
or Average in any event compared with that person's best result on every
earlier competition start date. A person's first positive result for an
event/result type establishes a PR. The metric uses the complete result
history, not the person's current event set.

Competitions sharing a start date form one atomic date:

- every competition on that date must independently improve at least one
  Single or Average relative to the pre-date PB;
- every qualifying competition on the date adds one to the streak length;
- one non-qualifying competition breaks the streak for the whole date.

This avoids ordering same-day competitions with no reliable time information.
It also implements the issue requirement that two competitions on one day only
count when both contain a PR.

All-time scores may cross year boundaries. A year filter returns the longest
portion of a streak contained inside that calendar year, so December
competitions do not increase the selected year's displayed number. Region and
gender cohorts use the person's current primary record (`persons.sub_id = 1`),
country, continent, and normalized gender.

The product has one number per person across all events. It does not expose an
event or result-type filter. Supported filters are World/continent/country,
year, and one or more genders.

## Projection and source data

The active projection group is `person-pr-streak-rankings`. It depends only on
`result-facts` and publishes:

- `person_pr_streak_counts`: longest all-time streak per person;
- `person_pr_streak_year_counts`: longest within-year streak per person/year;
- `person_pr_streak_rankings`: eager all-time World, continent, country, and
  single-gender ranking pages;
- `person_pr_streak_ranking_counts`: totals for eager cohorts.

The build first reduces `result_facts` to one best Single/Average per person,
event, competition, and start date. Windowed running minima establish the PB
entering each date. Competition outcomes collapse to one boolean, same-date
outcomes collapse with `MIN(set_pr)`, and a cumulative count of failed dates
identifies streak groups. Published count tables retain only scores of two or
more.

The SQL is in
[person_pr_streak_rankings.sql](../../data-tools/projection-catalog/people/pr-streak-rankings/person_pr_streak_rankings.sql).

## Index and plan findings

Temporary history tables use person/event/date primary keys. The streak stage
indexes `(person_id, streak_group, all_competitions_set_pr)` plus the matching
year-first key. Published count indexes place year/region/gender before
`pr_streak` and `person_id`. Eager pages use
`(scope, region_id, gender, position, person_id)`.

On MariaDB 11.8.8 with 6,757,068 `result_facts` rows, the source aggregation
plan intentionally scanned the fact table once and performed a grouped
filesort. The eager page plan used
`idx_person_pr_streak_rankings_page` as a 50-row range. The 2023 World `f,o`
lazy plan used `idx_person_pr_streak_year_counts_world`, reading an estimated
2,336 compact score rows before its rank window. Neither request plan read raw
results.

## Measured build evidence

Measured on 2026-08-06 against the existing local WCA export with MariaDB
11.8.8. The benchmark converted all four outputs to session `TEMPORARY` tables
and closed the connection afterward; it did not change raw or persistent
projection state.

- Complete build: **216.607 s** (3m 36.6s), below the 10-minute target.
- Competition/event reduction: 51.103 s.
- PB-entering-date history window: 67.217 s.
- Competition PR outcomes: 36.599 s.
- All-time scores: 10.488 s.
- Year scores: 13.992 s.
- Eager cohort rankings plus page index: 4.099 s.
- Output rows: 136,542 all-time scores; 192,029 year scores; 819,252 eager
  ranking rows; 522 eager cohort counts.

The reproducible runner is `scripts/benchmark-pr-streak-build.ts`. It emits
phase timings, output counts, runtime measurements, warnings, and JSON query
plans. It exits nonzero if the build exceeds 10 minutes or a measured p95
exceeds 2.5 seconds.

## Request policy and runtime evidence

The API is `/api/rankings/people/pr-streak`. All-time requests with no gender
or one gender use the eager ranking and count tables. Year requests and
multi-gender requests filter a compact score table before calculating `RANK()`
and deterministic `ROW_NUMBER()`. Display names and country data join only
after the bounded page is selected.

Both paths use the shared 400-row rankings window cache. Its key contains the
active data version, scope, region, normalized gender set, year, and window
start. Search resolves a bounded person-ID set first; locate and search then
read ranking rows without scanning result history.

The temporary-table benchmark executed 20 consecutive 50-row page queries per
scenario:

| Scenario              |  Median |     p95 | Maximum |
| --------------------- | ------: | ------: | ------: |
| World/all eager       | 0.92 ms | 2.86 ms | 3.20 ms |
| World/2023/`f,o` lazy | 2.23 ms | 4.54 ms | 8.84 ms |

These database timings are far below the 2.5-second scrolling target. An
end-to-end HTTP scroll benchmark remains an activation check because the local
persistent PR Streak tables were deliberately not published without explicit
authorization. The checked-in HTTP benchmark suite covers eager region/gender
and lazy year/multi-gender scenarios for that follow-up.

## UI and registry

The page is `/persons/pr-streak`. It appears in the People ranking picker,
keeps period/region/gender controls, hides event/result controls, and disables
event-detail expansion. The Storybook story
`Pages/RankingsExplorer/PR Streak` supplies 10,000 deterministic rows for
desktop/mobile visual and infinite-scroll checks.

`lib/ranking-stat-sources.ts` registers the source as `person-pr-streak`, with
home and person feed eligibility. This small registry is an integration seam
for the separate feed foundation branch; the implementation does not import
that unrelated branch.

## Open questions and edge cases

- The metric uses competition start dates because `result_facts` has no
  per-result timestamp. If the product intends the last competition date or
  chronological venue time, the contract and history partition must change.
- Same-date improvements compare with the PB entering the date, not with one
  another. This is deliberate; no deterministic ordering exists within the
  date.
- Current demographic/region data means historical scores move cohorts when a
  person's primary profile data changes.
- The first positive result for an event/result type counts as a PR. Invalid,
  DNF, DNS, and missing averages do not.
- A production-like activation should run the HTTP scroll suite and record
  server timing/cache-hit evidence before launch.
