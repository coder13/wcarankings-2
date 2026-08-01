import assert from "node:assert/strict";
import test from "node:test";
import { capabilityTables, getCapabilityStatus } from "@/lib/admin-health";

test("maps capability state to the tables each feature actually owns", () => {
  assert.deepEqual(capabilityTables.competitionRankings, [
    "competition_podium_members",
    "competition_event_stats",
    "competition_stats",
  ]);
  assert.deepEqual(capabilityTables.cityEventStats, [
    "city_event_stats",
    "entity_ranking_counts",
  ]);
  assert.deepEqual(capabilityTables.personCompetitionRankings, [
    "person_competition_counts",
    "person_competition_rankings",
    "person_competition_ranking_counts",
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
