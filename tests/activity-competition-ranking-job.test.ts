import assert from "node:assert/strict";
import test from "node:test";
import {
  deleteCompetitionRankingSliceQuery,
  insertProvisionalCompetitionRankingSliceQuery,
} from "../packages/projection-jobs/src/queries/competition-rankings.ts";
import { handleCompetitionRankings } from "../packages/projection-jobs/src/handlers/competition-rankings.ts";

test("competition ranking slice replaces one scope and gender", () => {
  const input = {
    gender: "f" as const,
    regionId: "USA",
    scope: "country" as const,
  };
  const remove = deleteCompetitionRankingSliceQuery(input);
  const insert = insertProvisionalCompetitionRankingSliceQuery(input);
  assert.match(remove.sql, /person_competition_rankings/);
  assert.match(insert.sql, /person_period_metrics/);
  assert.match(insert.sql, /country_id = \?/);
  assert.match(insert.sql, /person_gender = \?/);
  assert.match(insert.sql, /is_provisional/);
  assert.match(insert.sql, /RANK\(\) OVER/);
});

test("competition handler rejects invalid slice input before database work", async () => {
  const connection = {} as never;
  await assert.rejects(
    handleCompetitionRankings(connection, {
      gender: "all",
      regionId: "USA",
      scope: "world",
    }),
    /World rankings use an empty regionId only/,
  );
});
