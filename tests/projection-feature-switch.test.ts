import assert from "node:assert/strict";
import test from "node:test";
import { featureSwitchFromTables } from "../lib/projection-feature-switch";

test("derives projection feature switches from active projection tables", () => {
  const featureSwitch = featureSwitchFromTables([
    "ranking_entries_single", "ranking_entries_average", "ranking_counts", "result_entries_single", "result_counts",
    "competition_podium_members", "competition_event_stats", "result_facts", "result_rankings_single",
    "result_rankings_average", "result_ranking_counts", "competition_stats", "person_sum_of_ranks_scores",
    "person_year_ranking_cohorts", "person_year_rankings_single",
    "person_year_rankings_average", "person_year_ranking_counts",
  ], { generationId: "generation-123", exportId: "2026-07-30T00:00:30Z" });
  assert.deepEqual(featureSwitch, {
    generationId: "generation-123", exportId: "2026-07-30T00:00:30Z",
    core: true, sumOfRanks: true, yearlyPersonRankings: true,
  });
});

test("keeps unavailable feature switches hidden when a projection is absent", () => {
  const featureSwitch = featureSwitchFromTables([
    "ranking_entries_single", "ranking_entries_average", "ranking_counts", "result_entries_single", "result_counts",
    "competition_podium_members", "competition_event_stats", "result_facts", "result_rankings_single",
    "result_rankings_average", "result_ranking_counts", "competition_stats",
  ]);
  assert.equal(featureSwitch.core, true);
  assert.equal(featureSwitch.sumOfRanks, false);
  assert.equal(featureSwitch.yearlyPersonRankings, false);
});

test("does not mark core available when a core projection table is missing", () => {
  const featureSwitch = featureSwitchFromTables([
    "ranking_entries_single", "ranking_entries_average", "ranking_counts", "result_entries_single", "result_counts",
    "competition_podium_members", "competition_event_stats", "result_facts", "result_rankings_single",
    "result_rankings_average", "result_ranking_counts",
  ]);
  assert.equal(featureSwitch.core, false);
});
