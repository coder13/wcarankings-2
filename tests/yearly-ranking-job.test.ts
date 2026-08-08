import assert from "node:assert/strict";
import test from "node:test";
import {
  createAllYearlyRankingStageQuery,
  deleteYearlyRankingsQuery,
} from "../packages/projection-jobs/src/queries/yearly-rankings.ts";

test("yearly ranking rebuild combines official and live candidates for every cohort", () => {
  const stage = createAllYearlyRankingStageQuery({
    eventId: "333",
    resultType: "single",
    year: 2026,
  });

  assert.match(stage.sql, /person_event_bests/);
  assert.match(stage.sql, /provisional_live_results/);
  assert.match(stage.sql, /'country' AS scope/);
  assert.match(stage.sql, /'continent'/);
  assert.match(stage.sql, /'world'/);
  assert.match(stage.sql, /person_year_ranking_cohorts/);
  assert.match(stage.sql, /RANK\(\) OVER/);
  assert.deepEqual(stage.values, [
    2026,
    "333",
    "single",
    2026,
    "333",
    2026,
    "333",
  ]);
});

test("yearly ranking rebuild replaces all cohorts for the changed event and year", () => {
  const remove = deleteYearlyRankingsQuery({
    eventId: "333",
    resultType: "average",
    year: 2026,
  });

  assert.match(remove.sql, /person_year_rankings_average/);
  assert.match(remove.sql, /year = \?/);
  assert.match(remove.sql, /event_id = \?/);
  assert.deepEqual(remove.values, [2026, "333"]);
});
