import assert from "node:assert/strict";
import test from "node:test";
import { capabilitiesFromTables } from "../lib/projection-capabilities";

test("derives SSR capabilities from active projection tables", () => {
  const capabilities = capabilitiesFromTables([
    "ranking_entries_single", "ranking_entries_average", "ranking_counts", "result_entries_single", "result_counts",
    "competition_podium_members", "competition_event_stats", "result_facts", "result_rankings_single",
    "result_rankings_average", "result_ranking_counts", "competition_stats", "person_sum_of_ranks_scores",
    "person_year_ranking_cohorts", "person_year_rankings_single",
    "person_year_rankings_average", "person_year_ranking_counts",
  ], { generationId: "generation-123", exportId: "2026-07-30T00:00:30Z" });
  assert.deepEqual(capabilities, {
    generationId: "generation-123", exportId: "2026-07-30T00:00:30Z",
    core: true, sumOfRanks: true, yearlyPersonRankings: true,
  });
});

test("keeps unavailable capabilities hidden when a projection is absent", () => {
  const capabilities = capabilitiesFromTables([
    "ranking_entries_single", "ranking_entries_average", "ranking_counts", "result_entries_single", "result_counts",
    "competition_podium_members", "competition_event_stats", "result_facts", "result_rankings_single",
    "result_rankings_average", "result_ranking_counts", "competition_stats",
  ]);
  assert.equal(capabilities.core, true);
  assert.equal(capabilities.sumOfRanks, false);
  assert.equal(capabilities.yearlyPersonRankings, false);
});

test("does not mark core available when a core projection table is missing", () => {
  const capabilities = capabilitiesFromTables([
    "ranking_entries_single", "ranking_entries_average", "ranking_counts", "result_entries_single", "result_counts",
    "competition_podium_members", "competition_event_stats", "result_facts", "result_rankings_single",
    "result_rankings_average", "result_ranking_counts",
  ]);
  assert.equal(capabilities.core, false);
});
