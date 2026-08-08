import assert from "node:assert/strict";
import test from "node:test";
import {
  genderPersonRankingCountQuery,
  genderPersonRankingLocateQuery,
  genderPersonRankingPrefixCountQuery,
  genderPersonRankingRowsQuery,
} from "../services/rankings/queries/gender-rankings";
import { activeProvisionalPersonEventQuery } from "../services/rankings/queries/provisional";

test("the live person-event query supports the all-genders slice", () => {
  const rows = genderPersonRankingRowsQuery({
    genderCount: 0,
    positionColumn: "world_position",
    regionColumn: null,
  });
  assert.doesNotMatch(rows, /gender IN \(\)/);
  assert.match(rows, /provisional_live_results live/);
  assert.match(
    rows,
    /COALESCE\(facts\.competition_id, live\.competition_id, ''\)/,
  );
  assert.match(rows, /page\.world_rank = 1 AS is_world_record/);
  assert.match(rows, /page\.continent_rank = 1 AS is_continent_record/);
  assert.match(rows, /page\.country_rank = 1 AS is_country_record/);
  assert.doesNotMatch(rows, /regional_single_record/);
  assert.doesNotMatch(genderPersonRankingCountQuery(0, null), /gender IN \(\)/);
  assert.doesNotMatch(
    genderPersonRankingPrefixCountQuery(0, null),
    /gender IN \(\)/,
  );
  const locate = genderPersonRankingLocateQuery({
    rankColumn: "world_rank",
    positionColumn: "world_position",
    regionColumn: null,
  });
  assert.match(locate, /FROM person_event_rankings ranking/);
  assert.match(locate, /ranking\.person_id = \?/);
  assert.match(locate, /provisional_live_results live/);
});

test("the rankings service detects an enabled provisional event", () => {
  const query = activeProvisionalPersonEventQuery();
  assert.match(query, /provisional_live_result_sources source/);
  assert.match(query, /source\.enabled = 1/);
  assert.match(query, /live\.event_id = \?/);
});
