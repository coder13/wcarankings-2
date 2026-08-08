import assert from "node:assert/strict";
import test from "node:test";
import { applyKnownPeople } from "../apps/live-results-worker/src/live-people.ts";

test("keeps only live results for known WCA people and uses their WCA country", () => {
  const snapshot = applyKnownPeople(
    {
      results: [
        {
          sourceResultId: "known",
          eventId: "333",
          roundNumber: 1,
          roundTypeId: "f",
          formatId: "a",
          personId: "2026TEST01",
          personName: "Known Person",
          countryIso2: null,
          best: 277,
          average: 0,
          position: 1,
          attempts: [277],
        },
        {
          sourceResultId: "unknown",
          eventId: "333",
          roundNumber: 1,
          roundTypeId: "f",
          formatId: "a",
          personId: "2026TEST02",
          personName: "Unknown Person",
          countryIso2: "US",
          best: 300,
          average: 0,
          position: 2,
          attempts: [300],
        },
      ],
    },
    new Map([["2026TEST01", { countryIso2: "CN", continentId: "_Asia" }]]),
  );

  assert.deepEqual(snapshot.results, [
    {
      sourceResultId: "known",
      eventId: "333",
      roundNumber: 1,
      roundTypeId: "f",
      formatId: "a",
      personId: "2026TEST01",
      personName: "Known Person",
      countryIso2: "CN",
      best: 277,
      average: 0,
      position: 1,
      attempts: [277],
    },
  ]);
});
