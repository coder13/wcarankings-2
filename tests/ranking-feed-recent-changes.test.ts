import assert from "node:assert/strict";
import test from "node:test";
import {
  compareFeedTopFive,
  discoverRecentCompetitionTriggers,
  precomputeInjectedCandidates,
  precomputeRecentChangeCandidates,
} from "@/services/feeds/recent-changes";
import type { RankingFeedCandidate } from "@/services/feeds";

const change = compareFeedTopFive(
  [
    { entityId: "old", rank: 1, value: 100 },
    { entityId: "same", rank: 2, value: 200 },
  ],
  [
    { entityId: "new", rank: 1, value: 90 },
    { entityId: "same", rank: 2, value: 200 },
  ],
);
if (!change) throw new Error("The test change must exist.");

test("detects semantic top-five changes", () => {
  assert.equal(change?.type, "leader");
  assert.equal(change?.focusEntityId, "new");
  assert.deepEqual(
    change?.previousTopFive.map((row) => row.entityId),
    ["old", "same"],
  );
});

test("keeps the pure candidate path bounded and skips candidates without changes", () => {
  const candidate: RankingFeedCandidate = {
    cardId: "changed",
    listKey: "changed",
    descriptor: {
      version: 1,
      family: "person-event",
      eventId: "333",
      resultType: "single",
      year: 2026,
      region: { scope: "world", regionId: "" },
      genders: [],
      population: { kind: "everyone" },
    },
    title: "Changed ranking",
    exploreUrl: "/api/rankings?eventId=333",
    previewRows: [],
    sourceFamily: "person-event",
    diversityKey: "333",
    anchor: "competition:Recent2026",
    change: {
      type: change.type,
      detectedAt: "2026-08-05T00:00:00.000Z",
      summary: change.summary,
    },
  };
  assert.deepEqual(
    precomputeInjectedCandidates([
      candidate,
      { ...candidate, cardId: "unchanged", change: undefined },
    ]),
    [candidate],
  );
});

test("discovers only bounded competitions in the recent date window", async () => {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const result = await discoverRecentCompetitionTriggers({
    now: new Date("2026-08-05T12:00:00.000Z"),
    triggerLimit: 10,
    query: async (text, values = []) => {
      calls.push({ text, values });
      return {
        rows: [
          {
            competition_id: "Recent2026",
            competition_name: "Recent Competition 2026",
            country_id: "US",
            city_name: "Austin",
            end_year: 2026,
            end_month: 8,
            end_day: 5,
            event_id: "333",
            has_country_record: 1,
          },
        ],
      };
    },
  });
  assert.equal(result.triggers.length, 1);
  assert.equal(result.triggers[0]?.hasCountryRecord, true);
  assert.deepEqual(calls[0]?.values, ["2026-07-30", "2026-08-05", 10]);
  assert.match(calls[0]?.text ?? "", /FROM competitions/);
  assert.match(calls[0]?.text ?? "", /LIMIT \?/);
});

test("benchmarks the injected candidate path", async () => {
  const measurements: unknown[] = [];
  const result = await precomputeRecentChangeCandidates({
    query: async () => ({ rows: [] }),
    candidates: [],
    onMeasure: (measurement) => measurements.push(measurement),
  });
  assert.deepEqual(result.candidates, []);
  assert.equal(measurements.length, 1);
  assert.equal(
    (measurements[0] as { candidateCount: number }).candidateCount,
    0,
  );
  assert.equal(
    typeof (measurements[0] as { candidatePathMs: number }).candidatePathMs,
    "number",
  );
});

test("returns no semantic change for equal top fives", () => {
  const noChange = compareFeedTopFive(
    [{ entityId: "same", rank: 1, value: 100 }],
    [{ entityId: "same", rank: 1, value: 100 }],
  );
  assert.equal(noChange, null);
});

test("classifies movement and value changes", () => {
  assert.equal(
    compareFeedTopFive(
      [{ entityId: "same", rank: 2, value: 100 }],
      [{ entityId: "same", rank: 1, value: 100 }],
    )?.type,
    "move",
  );
  assert.equal(
    compareFeedTopFive(
      [{ entityId: "same", rank: 1, value: 100 }],
      [{ entityId: "same", rank: 1, value: 90 }],
    )?.type,
    "value",
  );
});
