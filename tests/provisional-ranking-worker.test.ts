import assert from "node:assert/strict";
import test from "node:test";
import { provisionalCurrentYearRankingSql } from "../scripts/live-results/ranking-sql.ts";

test("the provisional rebuild reads shared yearly grains and only one event", () => {
  assert.match(provisionalCurrentYearRankingSql, /FROM person_event_bests/);
  assert.match(provisionalCurrentYearRankingSql, /provisional_live_results/);
  assert.match(provisionalCurrentYearRankingSql, /period_year = \? AND event_id = \?/);
  assert.doesNotMatch(provisionalCurrentYearRankingSql, /FROM results\b/);
});

test("the provisional rebuild keeps world, continent, and country scopes", () => {
  for (const scope of ["'world'", "'continent'", "'country'"]) {
    assert.match(provisionalCurrentYearRankingSql, new RegExp(scope));
  }
  assert.match(provisionalCurrentYearRankingSql, /RANK\(\) OVER/);
});
