import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRecentChangeCandidates,
  compareFeedTopFive,
  precomputeRecentChangeCandidates,
  type RecentCompetitionTrigger,
} from "@/services/feeds/recent-changes";

const trigger: RecentCompetitionTrigger = {
  competitionId: "Recent2026",
  competitionName: "Recent Competition 2026",
  countryId: "US",
  cityName: "Austin",
  endDate: "2026-08-05",
  eventIds: ["333", "222"],
};

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

test("builds bounded source variants with only the current year", () => {
  assert.ok(change);
  const candidates = buildRecentChangeCandidates([trigger], {
    currentYear: 2026,
    topFiveChanges: new Map([[trigger.competitionId, change]]),
  });
  assert.equal(candidates.length, 12);
  assert.deepEqual(
    candidates.map((candidate) => candidate.descriptor.family),
    [
      "person-event",
      "person-result",
      "person-event",
      "person-result",
      "competition",
      "city",
      "person-event",
      "person-result",
      "person-event",
      "person-result",
      "competition",
      "city",
    ],
  );
  assert.ok(
    candidates.every(
      (candidate) =>
        candidate.descriptor.family !== "person-event" ||
        candidate.descriptor.year === null ||
        candidate.descriptor.year === 2026,
    ),
  );
  assert.ok(
    candidates.every((candidate) => candidate.topFiveChange === change),
  );
});

test("queries only bounded competitions in the recent date window", async () => {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const measurements: unknown[] = [];
  const result = await precomputeRecentChangeCandidates({
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
          },
        ],
      };
    },
    topFiveChanges: new Map([[trigger.competitionId, change]]),
    onMeasure: (measurement) => measurements.push(measurement),
  });
  assert.equal(result.triggers.length, 1);
  assert.equal(result.candidates.length, 6);
  assert.deepEqual(calls[0]?.values, ["2026-07-30", "2026-08-05", 10]);
  assert.match(calls[0]?.text ?? "", /FROM competitions/);
  assert.match(calls[0]?.text ?? "", /LIMIT \?/);
  assert.equal(measurements.length, 1);
  assert.equal(
    (measurements[0] as { candidateCount: number }).candidateCount,
    6,
  );
});

test("returns no candidate when the source has no semantic change", () => {
  const noChange = compareFeedTopFive(
    [{ entityId: "same", rank: 1, value: 100 }],
    [{ entityId: "same", rank: 1, value: 100 }],
  );
  assert.equal(noChange, null);
  assert.equal(
    buildRecentChangeCandidates([trigger], {
      currentYear: 2026,
      topFiveChanges: new Map(),
    }).length,
    0,
  );
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
