import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { type Connection } from "mysql2/promise";
import { handleResultRankings } from "../packages/projection-jobs/src/handlers/result-rankings.ts";
import {
  deleteStaleProvisionalResultRowsQuery,
  upsertProvisionalResultRankingSliceQuery,
} from "../packages/projection-jobs/src/queries/result-rankings.ts";

const worldInput = {
  eventId: "333",
  gender: "all" as const,
  periodYear: 0,
  resultType: "single" as const,
  scope: "world" as const,
};

test("live result rankings use the requested period, scope, and gender", () => {
  const result = upsertProvisionalResultRankingSliceQuery(worldInput);

  assert.match(result.sql, /ranking\.period_year = 0/);
  assert.match(result.sql, /competition\.year = \?/);
  assert.match(result.sql, /ranking\.result_id > 0/);
  assert.match(result.sql, /world_rank = VALUES\(world_rank\)/);
  assert.match(result.sql, /world_position = VALUES\(world_position\)/);
  assert.doesNotMatch(result.sql, /COALESCE\(existing\.world_rank/);

  const femaleCountry = upsertProvisionalResultRankingSliceQuery({
    ...worldInput,
    gender: "f",
    periodYear: 2026,
    regionId: "USA",
    scope: "country",
  });
  assert.match(femaleCountry.sql, /candidate\.country_id = \?/);
  assert.match(femaleCountry.sql, /candidate\.gender = \?/);
  assert.match(
    femaleCountry.sql,
    /gender_country_rank = VALUES\(gender_country_rank\)/,
  );
  assert.match(femaleCountry.sql, /\(\? = 0 OR competition\.year = \?\)/);
});

test("only the World all-gender slice removes obsolete provisional rows", async () => {
  const calls: string[] = [];
  const connection = {
    beginTransaction: async () => calls.push("begin"),
    query: async (sql: string) => calls.push(sql),
    commit: async () => calls.push("commit"),
    rollback: async () => calls.push("rollback"),
  } as unknown as Connection;

  await handleResultRankings(connection, {
    eventId: "333",
    gender: "all",
    periodYear: "0",
    resultType: "single",
    scope: "world",
  });
  assert.equal(calls.length, 4);
  assert.match(calls[1]!, /DELETE ranking/);
  assert.equal(calls.at(-1), "commit");

  calls.length = 0;
  await handleResultRankings(connection, {
    eventId: "333",
    gender: "f",
    periodYear: "2026",
    regionId: "USA",
    resultType: "average",
    scope: "country",
  });
  assert.equal(calls.length, 3);
  assert.doesNotMatch(calls[1]!, /DELETE ranking/);
});

test("stale-row cleanup only removes synthetic live rows in one period", () => {
  const query = deleteStaleProvisionalResultRowsQuery({
    eventId: "333",
    periodYear: 2026,
    resultType: "single",
  });
  assert.match(query.sql, /ranking\.period_year = \?/);
  assert.match(query.sql, /ranking\.result_id < 0/);
  assert.match(query.sql, /NOT EXISTS/);
});

test("result-ranking jobs reject incomplete scope payloads", async () => {
  const connection = {} as Connection;
  await assert.rejects(
    handleResultRankings(connection, {
      eventId: "333",
      gender: "all",
      periodYear: "0",
      resultType: "single",
      scope: "country",
    }),
    /needs regionId/,
  );
});

test("result-ranking build SQL declares each expanded insert target", async () => {
  const [single, average, query] = await Promise.all([
    readFile(
      "data-tools/projection-catalog/people/result-rankings/result_rankings_single.sql",
      "utf8",
    ),
    readFile(
      "data-tools/projection-catalog/people/result-rankings/result_rankings_average.sql",
      "utf8",
    ),
    readFile("packages/projection-jobs/src/queries/result-rankings.ts", "utf8"),
  ]);

  for (const sql of [single, average]) {
    assert.match(
      sql,
      /INSERT INTO\s+result_rankings_\w+ \([\s\S]*?gender_world_rank/,
    );
    assert.match(sql, /period_year SMALLINT UNSIGNED NOT NULL/);
  }
  assert.doesNotMatch(query, /competition\.start_date/);
});
