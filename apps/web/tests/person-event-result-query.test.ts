import assert from "node:assert/strict";
import test from "node:test";
import { personEventResultRankingsQuery } from "../services/rankings/queries/person-results";

test("person event Single results rank target candidates with stored dates", () => {
  const query = personEventResultRankingsQuery({
    source: "result_rankings_single",
    hasStoredDate: true,
  });
  assert.match(
    query,
    /WITH\s+target AS \(\s+SELECT \? AS person_id, \? AS event_id\s+\)/,
  );
  assert.match(
    query,
    /INNER JOIN target\s+ON target\.person_id = ranking\.person_id\s+AND target\.event_id = ranking\.event_id/,
  );
  assert.match(
    query,
    /ranking\.competition_start_date AS competition_start_date/,
  );
  assert.match(query, /COUNT\(\*\) OVER \(\) AS total_count/);
  assert.match(query, /position >= \?\s+AND position < \?/);
});

test("person event results show only current record badges", () => {
  const query = personEventResultRankingsQuery({
    source: "result_rankings_single",
    hasStoredDate: true,
  });
  assert.match(
    query,
    /WHEN ranking\.world_rank = 1 THEN 'WR'[\s\S]*WHEN ranking\.continent_rank = 1 THEN 'CR'[\s\S]*WHEN ranking\.country_rank = 1 THEN 'NR'/,
  );
  assert.doesNotMatch(query, /ranking\.record_code/);
});

test("person event Averages rank the target candidate set by result ID", () => {
  const query = personEventResultRankingsQuery({
    source: "result_rankings_average",
    hasStoredDate: false,
  });
  assert.match(
    query,
    /WITH\s+target AS \(\s+SELECT \? AS person_id, \? AS event_id\s+\)/,
  );
  assert.match(query, /NULL AS competition_start_date/);
  assert.match(
    query,
    /ROW_NUMBER\(\) OVER \(\s+ORDER BY\s+ranking\.result_value, ranking\.result_id\s+\)/,
  );
});

test("person event results select the requested projection period and live year", () => {
  const singleQuery = personEventResultRankingsQuery({
    source: "result_rankings_single",
    hasStoredDate: true,
    year: 2023,
  });
  assert.match(singleQuery, /WHERE ranking\.period_year = 2023/);
  assert.match(singleQuery, /AND competition\.year = 2023/);

  const averageQuery = personEventResultRankingsQuery({
    source: "result_rankings_average",
    hasStoredDate: false,
    year: 2023,
  });
  assert.match(averageQuery, /WHERE ranking\.period_year = 2023/);
  assert.match(averageQuery, /AND competition\.year = 2023/);
});
