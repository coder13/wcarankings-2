import assert from "node:assert/strict";
import test from "node:test";
import { featureSwitchFromTables } from "../lib/projection-feature-switch";

test("derives the bootstrap capability snapshot from verified active tables", () => {
  const featureSwitch = featureSwitchFromTables([
    "ranking_entries_single", "ranking_entries_average", "ranking_counts",
    "result_rankings_single", "result_rankings_average", "result_ranking_counts",
    "competition_podium_members", "competition_event_stats", "competition_stats",
    "city_event_stats", "entity_ranking_counts", "person_sum_of_ranks_scores",
    "person_year_ranking_cohorts", "person_year_rankings_single",
    "person_year_rankings_average", "person_year_ranking_counts",
    "person_competition_counts", "person_competition_rankings", "person_competition_ranking_counts",
  ], { generationId: "generation-123", exportId: "2026-07-30T00:00:30Z" });
  assert.deepEqual(featureSwitch, {
    generationId: "generation-123", exportId: "2026-07-30T00:00:30Z",
    core: true, resultRankings: true, competitionRankings: true,
    cityEventStats: true, sumOfRanks: true, yearlyPersonRankings: true,
    personCompetitionRankings: true,
  });
});

test("keeps compatibility rankings available without semantic projections", () => {
  const featureSwitch = featureSwitchFromTables([
    "ranking_entries_single", "ranking_entries_average", "ranking_counts",
  ]);
  assert.equal(featureSwitch.core, true);
  assert.equal(featureSwitch.resultRankings, false);
  assert.equal(featureSwitch.competitionRankings, false);
  assert.equal(featureSwitch.personCompetitionRankings, false);
});

test("competition capability does not depend on city counts", () => {
  const featureSwitch = featureSwitchFromTables([
    "competition_podium_members", "competition_event_stats", "competition_stats",
  ]);
  assert.equal(featureSwitch.competitionRankings, true);
  assert.equal(featureSwitch.cityEventStats, false);
});

test("city capability requires city stats and entity counts", () => {
  assert.equal(featureSwitchFromTables(["city_event_stats"]).cityEventStats, false);
  assert.equal(featureSwitchFromTables(["entity_ranking_counts"]).cityEventStats, false);
  assert.equal(featureSwitchFromTables(["city_event_stats", "entity_ranking_counts"]).cityEventStats, true);
});
