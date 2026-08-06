import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DEFAULT_PROJECTION_NAMES } from "@/data-tools/projection-catalog/tables";
import { PROJECTION_REGISTRY } from "@/data-tools/projections/build/registry";
import {
  formatPrStreak,
  parsePersonPrStreakInput,
} from "@/services/rankings/person-pr-streak";
import { buildLazyPersonPrStreakQueryPlan } from "@/services/rankings/queries/person-pr-streak";

type CompetitionOutcome = {
  competitionId: string;
  date: string;
  setPr: boolean;
};

test("registers the active PR Streak projection and owned tables", () => {
  const projection = PROJECTION_REGISTRY.find(
    ({ name }) => name === "person-pr-streak-rankings",
  );
  assert.ok(projection);
  assert.deepEqual(projection.dependencies, ["result-facts"]);
  assert.deepEqual(projection.tables, [
    "person_pr_streak_counts",
    "person_pr_streak_year_counts",
    "person_pr_streak_rankings",
    "person_pr_streak_ranking_counts",
  ]);
  assert.ok(DEFAULT_PROJECTION_NAMES.includes("person-pr-streak-rankings"));
});

function baselineLongestStreak(outcomes: CompetitionOutcome[], year?: number) {
  const byDate = Map.groupBy(
    outcomes.filter(
      ({ date }) => year === undefined || Number(date.slice(0, 4)) === year,
    ),
    ({ date }) => date,
  );
  let longest = 0;
  let current = 0;
  for (const [, competitions] of [...byDate].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    if (competitions.every(({ setPr }) => setPr)) {
      current += new Set(competitions.map(({ competitionId }) => competitionId))
        .size;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest >= 2 ? longest : 0;
}

test("the baseline counts all qualifying same-day competitions and breaks the whole date", () => {
  const history: CompetitionOutcome[] = [
    { competitionId: "a", date: "2022-12-31", setPr: true },
    { competitionId: "b", date: "2023-01-02", setPr: true },
    { competitionId: "c", date: "2023-01-02", setPr: true },
    { competitionId: "d", date: "2023-02-01", setPr: true },
    { competitionId: "e", date: "2023-03-01", setPr: true },
    { competitionId: "f", date: "2023-03-01", setPr: false },
    { competitionId: "g", date: "2023-04-01", setPr: true },
  ];
  assert.equal(baselineLongestStreak(history), 4);
  assert.equal(baselineLongestStreak(history, 2023), 3);
  assert.equal(
    baselineLongestStreak([
      { competitionId: "a", date: "2023-01-01", setPr: true },
    ]),
    0,
  );
});

test("parses PR Streak cohorts and rejects invalid locate IDs", () => {
  assert.deepEqual(
    parsePersonPrStreakInput(
      new URLSearchParams({
        region: "Canada",
        gender: "f,o",
        year: "2023",
        start: "51",
        limit: "50",
      }),
    ),
    {
      scope: "country",
      regionId: "Canada",
      gender: ["f", "o"],
      year: 2023,
      start: 51,
      limit: 50,
      locate: "",
      search: "",
      regexSearch: false,
      searchLimit: 500,
    },
  );
  assert.throws(
    () =>
      parsePersonPrStreakInput(new URLSearchParams({ locate: "not-a-wca-id" })),
    /valid WCA ID/,
  );
});

test("formats PR Streak as a bare number", () => {
  assert.equal(formatPrStreak(1_234), "1,234");
});

test("lazy cohorts filter compact score rows before ranking", () => {
  const plan = buildLazyPersonPrStreakQueryPlan({
    scope: "continent",
    regionId: "_Europe",
    gender: ["f", "o"],
    year: 2024,
    start: 1,
    limit: 50,
    locate: "",
    search: "",
    regexSearch: false,
    searchLimit: 500,
  });
  assert.match(plan.rowsQuery, /person_pr_streak_year_counts score/);
  assert.match(plan.rowsQuery, /score\.year = \?/);
  assert.match(plan.rowsQuery, /score\.continent_id = \?/);
  assert.match(plan.rowsQuery, /score\.person_gender IN \(\?, \?\)/);
  assert.match(plan.rowsQuery, /RANK\(\) OVER/);
  assert.match(plan.rowsQuery, /position >= \?/);
  assert.doesNotMatch(plan.rowsQuery, /result_facts|\bresults\b/);
  assert.deepEqual(plan.values, [2024, "_Europe", "f", "o"]);
});

test("projection derives prior-date PRs, same-day outcomes, and longest streaks", async () => {
  const sql = await readFile(
    new URL(
      "../data-tools/projection-catalog/people/pr-streak-rankings/person_pr_streak_rankings.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(sql, /FROM\s+result_facts/);
  assert.doesNotMatch(sql, /FROM\s+results\b/);
  assert.match(sql, /LAG\(running_single\)/);
  assert.match(sql, /LAG\(running_average\)/);
  assert.match(sql, /best_single <= history\.prior_single/);
  assert.match(sql, /best_average <= history\.prior_average/);
  assert.match(sql, /MIN\(set_pr\) AS all_competitions_set_pr/);
  assert.match(sql, /SUM\(competition_count\) AS pr_streak/);
  assert.match(sql, /HAVING\s+MAX\(streak\.pr_streak\) >= 2/);
  assert.match(sql, /ROW_NUMBER\(\) OVER/);
  assert.match(sql, /DROP TEMPORARY TABLE pr_streak_day_segments/);
});
