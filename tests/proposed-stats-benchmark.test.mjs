import assert from "node:assert/strict";
import test from "node:test";

import {
  asOfRankingSql,
  buildAttemptQueries,
  historicalRecordSql,
  historicalStageSql,
  PROPOSED_STATS,
  recordsInMostEventsSql,
} from "../scripts/benchmark-proposed-stats.mjs";

test("catalogs every proposed statistic without activating production projections", () => {
  assert.deepEqual(
    PROPOSED_STATS.map(({ key }) => key),
    [
      "medal-collection",
      "most-solves-competition-year",
      "rank-events-per-person",
      "oldest-standing-world-records",
      "records-in-most-events",
      "blindfolded-success-rate-streaks",
      "most-sub-x-solves",
      "top-100-appearances",
      "historical-as-of-rankings",
    ],
  );
  for (const stat of PROPOSED_STATS) {
    assert.ok(stat.sourceTables.length > 0);
    assert.ok(stat.sourceIndexes.length > 0);
    assert.equal(
      stat.status === "supported" || stat.status === "partial",
      true,
    );
  }
});

test("attempt candidates use one shared solve-grain shape and preserve failed attempts", () => {
  const queries = buildAttemptQueries(10);
  assert.match(
    queries["most-solves-competition-year"],
    /result_facts facts[\s\S]*result_attempts attempt/,
  );
  assert.match(
    queries["blindfolded-success-rate-streaks"],
    /SUM\(attempt\.value > 0\)/,
  );
  assert.match(queries["most-sub-x-solves"], /attempt\.value < 10/);
  assert.doesNotMatch(
    queries["blindfolded-success-rate-streaks"],
    /attempt\.value > 0\s*$/,
  );
});

test("historical candidates expose record and bounded as-of ranking work", () => {
  const stage = historicalStageSql();
  assert.match(stage, /FROM result_facts/);
  assert.match(stage, /competition_start_date/);
  assert.match(
    historicalRecordSql("result_facts"),
    /regional_single_record = 'WR'/,
  );
  assert.match(
    recordsInMostEventsSql("result_facts"),
    /COUNT\(DISTINCT event_id\)/,
  );
  assert.match(
    asOfRankingSql("result_facts", "2020-01-01"),
    /competition_start_date <= '2020-01-01'/,
  );
  assert.match(asOfRankingSql("result_facts", "2020-01-01"), /RANK\(\) OVER/);
});

test("benchmark SQL does not contain persistent DDL", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    new URL("../scripts/benchmark-proposed-stats.mjs", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /CREATE TABLE (?!.*TEMPORARY)/);
  assert.match(source, /CREATE TEMPORARY TABLE/);
  assert.match(source, /DROP TEMPORARY TABLE IF EXISTS/);
});
