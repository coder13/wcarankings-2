import assert from "node:assert/strict";
import test from "node:test";
import {
  deletePersonMedalScoresQuery,
  insertPersonMedalScoresQuery,
} from "../packages/projection-jobs/src/queries/medal-scores.ts";

test("medal scores replace only an affected person's current-year source rows", () => {
  const remove = deletePersonMedalScoresQuery({
    personId: "2017ELAH01",
    year: 2026,
  });
  const insert = insertPersonMedalScoresQuery({
    personId: "2017ELAH01",
    year: 2026,
  });
  assert.match(remove.sql, /person_medal_scores/);
  assert.match(insert.sql, /result_facts/);
  assert.match(insert.sql, /provisional_live_results/);
  assert.match(insert.sql, /MAX\(other_live\.round_number\)/);
});
