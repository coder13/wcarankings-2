import assert from "node:assert/strict";
import test from "node:test";
import { sortFeedCandidates } from "@/services/feeds/sort";
import type { FeedInterestingResult } from "@/services/feeds/stat-previews";
import { dedupeInterestingResults } from "@/services/feeds/stat-previews";

function candidate(
  id: string,
  overrides: Partial<FeedInterestingResult> = {},
): FeedInterestingResult {
  return {
    id,
    eventId: "333",
    eventName: "3x3x3 Cube",
    resultType: "single",
    kind: "result",
    region: { scope: "world", regionId: "", name: "World" },
    gender: null,
    year: null,
    title: id,
    exploreUrl: "/results?eventId=333",
    interestingEntityId: id,
    interestingResultId: 1,
    worldRank: null,
    continentRank: null,
    countryRank: null,
    ...overrides,
  };
}

test("orders world results before continent and national results", () => {
  const sorted = sortFeedCandidates(
    [
      candidate("country", {
        region: { scope: "country", regionId: "USA", name: "United States" },
        countryRank: 1,
      }),
      candidate("world", { worldRank: 1 }),
      candidate("continent", {
        region: {
          scope: "continent",
          regionId: "_North America",
          name: "North America",
        },
        continentRank: 1,
      }),
    ],
    null,
  );
  assert.deepEqual(
    sorted.map((item) => item.id),
    ["world", "continent", "country"],
  );
});

test("boosts averages and the logged-in user's country", () => {
  const sorted = sortFeedCandidates(
    [
      candidate("average", {
        resultType: "average",
        worldRank: 8,
      }),
      candidate("my-country", {
        region: { scope: "country", regionId: "USA", name: "United States" },
        countryRank: 1,
      }),
    ],
    {
      countryId: "USA",
      continentId: "_North America",
      preferredCountryIds: [],
      preferredContinentIds: [],
    },
  );
  assert.deepEqual(
    sorted.map((item) => item.id),
    ["my-country", "average"],
  );
});

test("uses stat popularity after the ranking signals", () => {
  const sorted = sortFeedCandidates(
    [
      candidate("popular", { statPopularityScore: 20 }),
      candidate("quiet", { statPopularityScore: 1 }),
    ],
    null,
  );
  assert.deepEqual(
    sorted.map((item) => item.id),
    ["popular", "quiet"],
  );
});

test("keeps only the most notable stat for each result", () => {
  const [mostNotable] = sortFeedCandidates(
    [
      candidate("country-stat", {
        region: { scope: "country", regionId: "USA", name: "United States" },
        countryRank: 1,
      }),
      candidate("world-stat", { worldRank: 1 }),
    ],
    null,
  );

  assert.deepEqual(dedupeInterestingResults([mostNotable]), [mostNotable]);
  assert.equal(
    dedupeInterestingResults(
      sortFeedCandidates(
        [
          candidate("country-stat", {
            region: {
              scope: "country",
              regionId: "USA",
              name: "United States",
            },
            countryRank: 1,
          }),
          candidate("world-stat", { worldRank: 1 }),
        ],
        null,
      ),
    ).length,
    1,
  );
});

test("weights stat families and grouped interesting results", () => {
  const sorted = sortFeedCandidates(
    [
      candidate("single-city", { kind: "city", eventId: "444", worldRank: 2 }),
      candidate("person-result", { kind: "result", worldRank: 10 }),
      candidate("grouped-city-1", {
        kind: "city",
        worldRank: 2,
        interestingResultId: 2,
      }),
      candidate("grouped-city-2", {
        kind: "city",
        worldRank: 2,
        interestingResultId: 3,
      }),
    ],
    null,
  );
  assert.deepEqual(
    sorted.map((item) => item.id),
    ["grouped-city-1", "grouped-city-2", "single-city", "person-result"],
  );
});
