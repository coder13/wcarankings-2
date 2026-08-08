import assert from "node:assert/strict";
import test from "node:test";
import {
  activeLiveResultOverlayQuery,
  allTimeOfficialResultPageQuery,
  allTimeOfficialResultPageValues,
  allTimeOfficialResultTotalQuery,
  currentYearLiveResultRankingValues,
  currentYearLiveResultRankingsQuery,
  liveResultCandidatesQuery,
} from "../apps/web/services/rankings/queries/live-result-overlay.ts";

test("the result overlay reads active snapshots without mutating ranking tables", () => {
  const query = currentYearLiveResultRankingsQuery({
    eventId: "333",
    resultType: "single",
    year: 2026,
    gender: [],
    scope: "world",
    regionId: "",
    start: 0,
    limit: 25,
  });

  assert.match(query, /FROM result_facts facts/);
  assert.match(query, /FROM provisional_live_results live/);
  assert.match(query, /source\.enabled = 1/);
  assert.match(query, /JSON_TABLE/);
  assert.doesNotMatch(query, /INSERT INTO result_rankings/);
  assert.match(query, /RANK\(\) OVER/);
});

test("the all-time overlay reads a bounded official window without a CTE", () => {
  const input = {
    eventId: "333",
    resultType: "single" as const,
    scope: "world" as const,
    regionId: "",
    requestedStart: 0,
    requestedLimit: 50,
    start: 0,
    limit: 50,
    search: "",
    searchLimit: null,
    regexSearch: false,
    baseTable: "result_rankings_single" as const,
    gender: [],
    year: null,
  };
  const query = allTimeOfficialResultPageQuery(input);
  assert.match(query, /ranking\.world_position > 0/);
  assert.match(query, /FORCE INDEX \(idx_results_single_world\)/);
  assert.match(query, /ranking\.world_position > \?/);
  assert.doesNotMatch(query, /WITH/);
  assert.deepEqual(allTimeOfficialResultPageValues(input, 0, 51), [
    "333",
    0,
    51,
  ]);
  assert.match(
    allTimeOfficialResultTotalQuery(input),
    /ORDER BY ranking\.world_position DESC/,
  );
  assert.match(liveResultCandidatesQuery(input), /person_event_rankings best/);
});

test("the result service detects active live data before it uses a cache", () => {
  const query = activeLiveResultOverlayQuery();
  assert.match(query, /provisional_live_result_sources source/);
  assert.match(query, /source\.enabled = 1/);
  assert.match(query, /live\.event_id = \?/);
});

test("the result overlay applies the requested region", () => {
  const query = currentYearLiveResultRankingsQuery({
    eventId: "333",
    resultType: "average",
    year: 2026,
    gender: ["f"],
    scope: "country",
    regionId: "USA",
    start: 0,
    limit: 25,
  });

  assert.match(query, /candidates\.country_id = \?/);
  assert.doesNotMatch(query, /JSON_TABLE/);
  assert.deepEqual(
    currentYearLiveResultRankingValues({
      eventId: "333",
      resultType: "average",
      year: 2026,
      gender: ["f"],
      scope: "country",
      regionId: "USA",
      start: 0,
      limit: 25,
    }),
    [2026, "333", 2026, "333", "f", "USA", "333", 0, 26],
  );
});
