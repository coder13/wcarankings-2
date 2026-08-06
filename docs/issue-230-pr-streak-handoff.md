# Issue #230 PR Streak implementation handoff

Implementation commit: `c427f52` (`Implement PR Streak rankings`)

This file is intentionally added in the second commit and reverted in the
third, per the task's requested history shape. Future Codex instances should
inspect the documentation commit immediately after `c427f52` when this file is
absent from the final tree.

## Approach

The implementation reduces full `result_facts` history before running any
streak window:

1. Keep the best positive Single and Average for each
   person/event/competition/start date.
2. Collapse event history to one row per person/event/start date and compute
   the running minima entering the date.
3. Mark each competition when any event/result type improves the pre-date PB.
4. Collapse all competitions on a date with `MIN(set_pr)` and retain their
   distinct competition count.
5. Use cumulative failure counts to identify consecutive qualifying segments.
6. Publish compact all-time/year scores, eager common cohorts, and eager counts.
7. Rank year and multi-gender cohorts from compact scores on demand behind the
   shared 400-row window cache.

The API/UI follow the existing person-competition and medal ranking patterns.
PR Streak has its own page and API route, is feature-gated by its four published
tables, and participates in deployment activation/readiness. Search and locate
operate on selected person IDs. Event-detail expansion is disabled.

## Resolved ambiguities

- Competition chronology means `competition_start_date`; no result timestamps
  exist in `result_facts`.
- Same-date competitions compare against the PB entering the date. They do not
  establish an arbitrary order against each other.
- All same-date competitions must qualify, and each one adds one to the score.
- Year views split streak length at calendar-year boundaries even when the
  all-time streak crosses the boundary.
- Region/gender filters use current primary person data.
- A first positive Single/Average for an event/result type establishes a PR.
- Scores below two are omitted.

If product wants different semantics for any of these, change both the SQL and
the baseline tests; do not add compatibility behavior unless explicitly asked.

## Notable implementation files

- Projection definition/SQL:
  `data-tools/projection-catalog/people/pr-streak-rankings/`
- API service/query:
  `services/rankings/person-pr-streak.ts` and
  `services/rankings/queries/person-pr-streak.ts`
- Page/API routes: `/persons/pr-streak` and
  `/api/rankings/people/pr-streak`
- Feed integration seam: `lib/ranking-stat-sources.ts`
- Build/query-plan runner: `scripts/benchmark-pr-streak-build.ts`
- HTTP scroll runner: `scripts/benchmark-ranking-pr-streak.ts`
- Deterministic visual fixture:
  `components/RankingsExplorer/RankingsExplorer.stories.tsx`, story
  `Pages/RankingsExplorer/PR Streak`

The feed descriptor foundation lives on an unrelated unmerged branch. This
change deliberately did not cherry-pick its eight commits. The small source
registry uses vocabulary coordinated with issue #232:
`sourceId`, `entityType`, `metrics`, `supportedFilters`, `feedEligibility`, and
`paths`. The #230 source is `person-pr-streak` and is eligible for home/person
feeds.

## Verification and evidence

Passed locally:

- `pnpm typecheck`
- `pnpm exec tsc --project tsconfig.data-tools.json --noEmit`
- `pnpm test:unit` (51 suites)
- Bun projection/deployment suite (55 tests)
- ESLint with zero warnings
- `pnpm lint:unused`
- `pnpm build`
- `pnpm build-storybook`
- `git diff --check`

Temporary-table full-history benchmark on MariaDB 11.8.8:

- complete build: 216.607 s;
- all-time score rows: 136,542;
- year score rows: 192,029;
- eager ranking rows: 819,252;
- eager cohort counts: 522;
- eager 20-page query p95: 2.86 ms;
- 2023 `f,o` lazy 20-page query p95: 4.54 ms.

The complete JSON report, including every phase and three
`EXPLAIN FORMAT=JSON` plans, was copied outside the repository to
`~/Desktop/codex-230-evidence/pr-streak-build-benchmark.json`. All build tables
were session `TEMPORARY` tables. No raw import, projection refresh, schema
refresh, or persistent database write ran.

The Storybook evidence URL while the local server is running is:

```text
http://127.0.0.1:6010/iframe.html?id=pages-rankingsexplorer--pr-streak&viewMode=story
```

Chrome screenshot automation was initially unavailable because the active
Chrome profile did not have the ChatGPT browser extension installed/enabled.
Retry Chrome after enabling it in Codex Settings -> Computer use; save captures
under `~/Desktop/codex-230-evidence/` and do not commit them.

## Open checks and risks

- Run `pnpm benchmark:ranking-scroll:pr-streak` against an activated local or
  staging generation. The direct DB evidence is strong, but end-to-end HTTP
  timing and cache headers were not measurable without publishing persistent
  projection tables, which local database policy forbids without exact user
  authorization.
- Confirm the product owner agrees with start-date and same-date semantics.
- Monitor the source scan/window phases on CI-class hardware. The measured
  3m36s build has ample margin below 10 minutes, but those three phases dominate.
- Keep year/region/gender predicates before the lazy rank window. Moving display
  joins or filters after the window would turn millisecond requests into broad
  sorts.
- The local `result_facts` table predated its current `competition_year` column.
  The PR build derives year from `YEAR(competition_start_date)`, so it worked
  against both the old local shape and the current projection definition.
- Person cohort changes can move historical scores because current demographic
  and region values are stored. This matches the other person leaderboards.

## Coordination record

Issue #232 used a separate worktree/temporary branch, ports 3022/6022, and
session temporary tables prefixed `country_232_*`. Issue #230 used ports
3010/6010 and `pr_streak_*`. Each DB profiling session was serialized and both
agents confirmed connection closure before the other began. Issue #232 agreed
not to push or force-update `codex-230`.
