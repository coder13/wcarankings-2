import assert from "node:assert/strict";
import test from "node:test";
import {
  deleteMedalRankingSliceQuery,
  replaceMedalRankingSliceQuery,
} from "../packages/projection-jobs/src/queries/medal-rankings.ts";

test("medal ranking slices replace all four medal types", () => {
  const input = { eventId: "333", scope: "country", regionId: "Canada" };
  assert.match(
    deleteMedalRankingSliceQuery(input).sql,
    /person_medal_rankings/,
  );
  const insert = replaceMedalRankingSliceQuery(input);
  assert.match(insert.sql, /'overall'/);
  assert.match(insert.sql, /'gold'/);
  assert.match(insert.sql, /RANK\(\) OVER/);
});
