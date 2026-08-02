import assert from "node:assert/strict";
import test from "node:test";

import { rankingEntryEnhancementsFromColumns } from "@/services/rankings/capabilities";
import { rankingColumns } from "@/services/rankings/helpers";
import { genderRankingPageQuery, rankingPageQuery } from "@/services/rankings/queries";

const enhancedColumns = [
  "world_rank_delta",
  "world_rank_delta_state",
  "continent_rank_delta",
  "continent_rank_delta_state",
  "country_rank_delta",
  "country_rank_delta_state",
  "record_streak_weeks",
];

function columnsFor(tables: readonly string[]) {
  return tables.flatMap((table_name) =>
    enhancedColumns.map((column_name) => ({ table_name, column_name })));
}

function assertNoEnhancementColumnRead(sql: string) {
  for (const column of enhancedColumns) {
    assert.match(sql, new RegExp(`NULL AS ${column}`));
    assert.equal(
      [...sql.matchAll(new RegExp(`\\b${column}\\b`, "g"))].length,
      1,
      `${column} is present only as a NULL output alias`,
    );
  }
}

test("new server queries a prior ranking generation without reading missing enhancement columns", () => {
  const enhancements = rankingEntryEnhancementsFromColumns([]);
  assert.deepEqual(enhancements, { rankDeltas: false });

  const columns = rankingColumns("world_rank", "world_sub_rank", enhancements);
  const sql = rankingPageQuery(
    "ranking_entries_single",
    columns,
    ["event_id = ?"],
    "world_sub_rank",
  );
  assertNoEnhancementColumnRead(sql);
});

test("a partial or mixed ranking schema fails closed to the all-null fallback", () => {
  const mixed = columnsFor(["ranking_entries_single"])
    .concat(columnsFor(["ranking_entries_average"]).filter(
      ({ column_name }) => column_name !== "record_streak_weeks",
    ));

  const enhancements = rankingEntryEnhancementsFromColumns(mixed);
  assert.deepEqual(enhancements, { rankDeltas: false });
  assertNoEnhancementColumnRead(rankingPageQuery(
    "ranking_entries_average",
    rankingColumns("world_rank", "world_sub_rank", enhancements),
    ["event_id = ?"],
    "world_sub_rank",
  ));
});

test("enables rank deltas only after both active ranking tables expose every field", () => {
  const complete = columnsFor(["ranking_entries_single", "ranking_entries_average"]);

  assert.deepEqual(rankingEntryEnhancementsFromColumns(complete), { rankDeltas: true });
});

test("gender-filtered rankings use the same pre-activation fallback and post-activation fields", () => {
  const legacyColumns = rankingColumns("filtered_rank", "filtered_position", { rankDeltas: false });
  const legacy = genderRankingPageQuery({
    source: "ranking_entries_single",
    baseConditions: ["ranking.event_id = ?"],
    conditions: ["filtered_position >= ?"],
    selectColumns: legacyColumns,
  });
  assert.match(legacy, /NULL AS world_rank_delta/);
  assert.match(legacy, /NULL AS record_streak_weeks/);
  assert.match(legacy, /total_count/);

  const active = genderRankingPageQuery({
    source: "ranking_entries_single",
    baseConditions: ["ranking.event_id = ?"],
    conditions: ["filtered_position >= ?"],
    selectColumns: rankingColumns("filtered_rank", "filtered_position", { rankDeltas: true }),
  });
  assert.match(active, /world_rank_delta/);
  assert.match(active, /record_streak_weeks/);
  assert.doesNotMatch(active, /NULL AS world_rank_delta/);
  for (const column of enhancedColumns) {
    assert.equal([...active.matchAll(new RegExp(`\\b${column}\\b`, "g"))].length, 1);
  }
});
