import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalSnapshot,
  normalizeCubingChinaResults,
  normalizeWcaLiveResults,
  snapshotHash,
} from "../scripts/live-results/providers.ts";

test("normalizes the public WCA Live result endpoint without WCIF", () => {
  const snapshot = normalizeWcaLiveResults({
    persons: [{ id: 7, wcaId: "2026TEST01", name: "Test Cuber", country: "US" }],
    events: [{ eventId: "333", rounds: [{ number: 1, results: [{ personId: 7, best: 1234, average: 1500, attempts: [1234, 1500] }] }] }],
  });
  assert.deepEqual(snapshot.results, [{
    sourceResultId: "333:1:2026TEST01", eventId: "333", roundNumber: 1, formatId: null,
    personId: "2026TEST01", personName: "Test Cuber", countryIso2: "US",
    best: 1234, average: 1500, attempts: [1234, 1500],
  }]);
});

test("ignores WCA Live results that cannot be tied to a WCA person", () => {
  const snapshot = normalizeWcaLiveResults({
    persons: [{ id: 7, name: "Guest", country: "US" }],
    events: [{ eventId: "333", rounds: [{ number: 1, results: [{ personId: 7, best: 1234 }] }] }],
  });
  assert.deepEqual(snapshot.results, []);
});

test("normalizes the Cubing China result rows used by the existing reader", () => {
  const snapshot = normalizeCubingChinaResults({ results: [{
    resultId: "abc", eventId: "333", roundId: "333-r2", formatId: "a", wcaId: "2026TEST01",
    name: "Test Cuber", best: 1111, average: 1222, attempts: [1111, 1222],
  }] });
  assert.equal(snapshot.results[0]?.roundNumber, 2);
  assert.equal(snapshot.results[0]?.sourceResultId, "abc");
});

test("snapshot fingerprints are stable when providers reorder rows", () => {
  const first = { results: [
    { sourceResultId: "b", eventId: "333", roundNumber: 1, formatId: null, personId: "2026TEST02", personName: "B", countryIso2: "US", best: 2, average: 0, attempts: [2] },
    { sourceResultId: "a", eventId: "333", roundNumber: 1, formatId: null, personId: "2026TEST01", personName: "A", countryIso2: "US", best: 1, average: 0, attempts: [1] },
  ] };
  const second = { results: [...first.results].reverse() };
  assert.equal(canonicalSnapshot(first), canonicalSnapshot(second));
  assert.equal(snapshotHash(first), snapshotHash(second));
});
