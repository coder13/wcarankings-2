import assert from "node:assert/strict";
import test from "node:test";
import { personEventResultRankingsQuery } from "../services/rankings/queries/results";

test("person event Single results use the stored attempt date for stable ties", () => {
  const query = personEventResultRankingsQuery({
    source: "result_rankings_single",
    hasStoredDate: true,
  });
  assert.match(query, /ranking\.person_id = \?\s+AND ranking\.event_id = \?/);
  assert.match(
    query,
    /ranking\.competition_start_date AS competition_start_date/,
  );
  assert.match(query, /RANK\(\) OVER \(ORDER BY ranking\.result_value\)/);
  assert.match(query, /COUNT\(\*\) OVER \(\) AS total_count/);
  assert.match(query, /position >= \? AND position < \?/);
});

test("person event Averages use result ID for stable ties", () => {
  const query = personEventResultRankingsQuery({
    source: "result_rankings_average",
    hasStoredDate: false,
  });
  assert.match(query, /NULL AS competition_start_date/);
  assert.match(query, /ORDER BY ranking\.result_value, ranking\.result_id/);
  assert.doesNotMatch(query, /ranking\.competition_start_date/);
});
