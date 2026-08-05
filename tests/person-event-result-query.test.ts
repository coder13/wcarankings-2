import assert from "node:assert/strict";
import test from "node:test";
import { personEventResultRankingsQuery } from "../services/rankings/queries/person-results";

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
  assert.match(
    query,
    /RANK\(\) OVER \(\s+ORDER BY\s+ranking\.result_value\s+\)/,
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

test("person event Averages use result ID for stable ties", () => {
  const query = personEventResultRankingsQuery({
    source: "result_rankings_average",
    hasStoredDate: false,
  });
  assert.match(query, /NULL AS competition_start_date/);
  assert.match(query, /ORDER BY\s+ranking\.result_value, ranking\.result_id/);
  assert.doesNotMatch(query, /ranking\.competition_start_date/);
});

test("person event results filter a selected year before ranking", () => {
  const singleQuery = personEventResultRankingsQuery({
    source: "result_rankings_single",
    hasStoredDate: true,
    year: 2023,
  });
  assert.match(
    singleQuery,
    /ranking\.person_id = \?\s+AND ranking\.event_id = \?\s+AND YEAR\(ranking\.competition_start_date\) = \?/,
  );

  const averageQuery = personEventResultRankingsQuery({
    source: "result_rankings_average",
    hasStoredDate: false,
    year: 2023,
  });
  assert.match(
    averageQuery,
    /INNER JOIN result_facts year_facts ON year_facts\.result_id = ranking\.result_id/,
  );
  assert.match(averageQuery, /YEAR\(year_facts\.competition_start_date\) = \?/);
});
