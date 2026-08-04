import assert from "node:assert/strict";
import test from "node:test";

import { RANKING_ENTRY_ENHANCEMENTS_ENABLED } from "@/lib/ranking-entry-enhancements";
import { getRankingEntryEnhancements } from "@/services/rankings/capabilities";
import { rankingColumns } from "@/services/rankings/helpers";
import {
  genderRankingPageQuery,
  rankingPageQuery,
} from "@/services/rankings/queries";

const enhancedColumns = [
  "world_rank_delta",
  "world_rank_delta_state",
  "continent_rank_delta",
  "continent_rank_delta_state",
  "country_rank_delta",
  "country_rank_delta_state",
  "record_streak_weeks",
];

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

test("launch feature flag keeps ranking enhancements off", async () => {
  assert.equal(RANKING_ENTRY_ENHANCEMENTS_ENABLED, false);
  const enhancements = await getRankingEntryEnhancements();
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

test("ranking queries use null aliases even if a caller omits capability state", () => {
  assertNoEnhancementColumnRead(
    rankingPageQuery(
      "ranking_entries_average",
      rankingColumns("world_rank", "world_sub_rank"),
      ["event_id = ?"],
      "world_sub_rank",
    ),
  );
});

test("gender-filtered rankings use the launch fallback", () => {
  const legacy = genderRankingPageQuery({
    source: "ranking_entries_single",
    baseConditions: ["ranking.event_id = ?"],
    conditions: ["filtered_position >= ?"],
    selectColumns: rankingColumns("filtered_rank", "filtered_position"),
  });
  assert.match(legacy, /NULL AS world_rank_delta/);
  assert.match(legacy, /NULL AS record_streak_weeks/);
  assert.match(legacy, /total_count/);
});
