import assert from "node:assert/strict";
import test from "node:test";
import { type Connection } from "mysql2/promise";
import { handlePersonStatRankings } from "../packages/projection-jobs/src/handlers/person-stat-rankings.ts";
import {
  deletePersonStatRankingSliceQuery,
  insertProvisionalPersonStatRankingSliceQuery,
} from "../packages/projection-jobs/src/queries/person-stat-rankings.ts";

test("person-stat ranking queries replace a yearly world gender slice", () => {
  const input = {
    gender: "f" as const,
    metric: "solve-count" as const,
    periodYear: 2026,
    regionId: "",
    scope: "world" as const,
  };
  const remove = deletePersonStatRankingSliceQuery(input);
  const insert = insertProvisionalPersonStatRankingSliceQuery(input);
  assert.match(remove.sql, /period_year = \?/);
  assert.match(remove.sql, /scope = \?/);
  assert.match(insert.sql, /person_period_metrics/);
  assert.match(insert.sql, /official_solve_count/);
  assert.doesNotMatch(insert.sql, /SELECT person_id, \? AS metric_value/);
  assert.match(insert.sql, /RANK\(\) OVER/);
  assert.match(insert.sql, /is_provisional/);
});

test("person-stat ranking handler replaces a slice atomically", async () => {
  const calls: string[] = [];
  const connection = {
    beginTransaction: async () => calls.push("begin"),
    query: async (sql: string) => calls.push(sql),
    commit: async () => calls.push("commit"),
    rollback: async () => calls.push("rollback"),
  } as unknown as Connection;

  await handlePersonStatRankings(connection, {
    gender: "all",
    metric: "country-count",
    periodYear: "0",
    regionId: "",
    scope: "world",
  });

  assert.equal(calls[0], "begin");
  assert.equal(calls.length, 4);
  assert.equal(calls.at(-1), "commit");
});

test("person-stat ranking handler rejects a non-empty world region", async () => {
  const connection = {} as never;
  await assert.rejects(
    handlePersonStatRankings(connection, {
      gender: "all",
      metric: "round-count",
      periodYear: "0",
      regionId: "USA",
      scope: "world",
    }),
    /empty regionId/,
  );
});
