import assert from "node:assert/strict";
import test from "node:test";
import { capabilityTables, getCapabilityStatus } from "@/lib/admin-health";

test("maps capability state to the tables each feature actually owns", () => {
  assert.deepEqual(capabilityTables.resultRankings, [
    "result_rankings_single",
    "result_rankings_average",
  ]);
  assert.deepEqual(capabilityTables.competitionRankings, [
    "competition_podium_members",
    "competition_event_stats",
    "competition_stats",
  ]);
  assert.deepEqual(capabilityTables.cityEventStats, ["city_event_stats"]);
  assert.deepEqual(capabilityTables.personActivityRankings, [
    "person_activity_rankings",
    "person_period_metrics",
  ]);
  assert.deepEqual(capabilityTables.personCompetitionRankings, [
    "person_competition_rankings",
    "person_period_metrics",
  ]);
  assert.deepEqual(capabilityTables.personMedalRankings, [
    "person_medal_scores",
    "person_medal_rankings",
  ]);
  assert.deepEqual(capabilityTables.personPrStreakRankings, [
    "person_pr_streak_counts",
    "person_pr_streak_year_counts",
    "person_pr_streak_rankings",
    "person_pr_streak_ranking_counts",
  ]);
});

test("classifies active projection capabilities", () => {
  assert.equal(
    getCapabilityStatus({
      persisted: true,
      present: 5,
      total: 5,
      hasGeneration: true,
    }),
    "enabled",
  );
  assert.equal(
    getCapabilityStatus({
      persisted: false,
      present: 5,
      total: 5,
      hasGeneration: true,
    }),
    "partial",
  );
  assert.equal(
    getCapabilityStatus({
      persisted: true,
      present: 2,
      total: 5,
      hasGeneration: true,
    }),
    "partial",
  );
  assert.equal(
    getCapabilityStatus({
      persisted: undefined,
      present: 0,
      total: 5,
      hasGeneration: false,
    }),
    "unknown",
  );
  assert.equal(
    getCapabilityStatus({
      persisted: undefined,
      present: 2,
      total: 5,
      hasGeneration: false,
    }),
    "partial",
  );
});
