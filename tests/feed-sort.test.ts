import assert from "node:assert/strict";
import test from "node:test";
import { sortFeedCandidates } from "@/services/feeds/sort";
import type { FeedInterestingResult } from "@/services/feeds/stat-previews";

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
    notabilityScore: 0,
    statPopularityScore: 0,
    ...overrides,
  };
}

test("orders world results before continent and national results", () => {
  const sorted = sortFeedCandidates(
    [
      candidate("country", {
        region: { scope: "country", regionId: "USA", name: "United States" },
        notabilityScore: 110,
      }),
      candidate("world", { notabilityScore: 310 }),
      candidate("continent", {
        region: {
          scope: "continent",
          regionId: "_North America",
          name: "North America",
        },
        notabilityScore: 210,
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
        notabilityScore: 200,
      }),
      candidate("my-country", {
        region: { scope: "country", regionId: "USA", name: "United States" },
        notabilityScore: 150,
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
