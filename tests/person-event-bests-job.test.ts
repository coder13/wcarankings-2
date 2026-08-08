import assert from "node:assert/strict";
import test from "node:test";
import {
  deletePersonEventBestsQuery,
  insertPersonEventBestsQuery,
} from "../packages/projection-jobs/src/queries/person-event-bests.ts";

test("person event bests replace only one person's all-time and yearly rows", () => {
  const remove = deletePersonEventBestsQuery({
    personId: "2017ELAH01",
    year: 2026,
  });
  const insert = insertPersonEventBestsQuery({
    personId: "2017ELAH01",
    year: 2026,
  });

  assert.match(remove.sql, /period_year IN \(0, \?\)/);
  assert.match(insert.sql, /result_facts/);
  assert.match(insert.sql, /provisional_live_results/);
  assert.match(insert.sql, /PARTITION BY person_id, event_id/);
  assert.match(insert.sql, /PARTITION BY person_id, event_id, country_id/);
  assert.match(insert.sql, /competition_year = \?/);
});
