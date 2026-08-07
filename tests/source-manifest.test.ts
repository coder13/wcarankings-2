import assert from "node:assert/strict";
import test from "node:test";
import { compareSourceManifests, SourceManifestBuilder } from "../data-tools/projections/release/source-manifest.ts";

function manifest(resultValue = 10) {
  const builder = new SourceManifestBuilder("2026-08-06T00:00:00Z");
  builder.addCompetition("TestOpen2020", 2020, { city: "A" });
  builder.addResult("TestOpen2020", 1, { event: "333", best: resultValue });
  builder.addAttempt("TestOpen2020", 1, 1, 10);
  builder.addPerson("2000TEST01", { country: "USA", gender: "m" });
  return builder.build();
}

test("builds deterministic competition and year fingerprints", () => {
  assert.deepEqual(manifest().competitions, manifest().competitions);
  assert.deepEqual(manifest().years, manifest().years);
});

test("marks only the changed historical year plus the current year", () => {
  const comparison = compareSourceManifests(manifest(11), manifest(), 2026);
  assert.deepEqual(comparison.dirtyCompetitionIds, ["TestOpen2020"]);
  assert.deepEqual(comparison.dirtyYears, [2020, 2026]);
  assert.equal(comparison.attemptsChanged, false);
});

test("marks removed competitions and their previous year dirty", () => {
  const previous = manifest();
  const empty = new SourceManifestBuilder("2026-08-06T00:00:00Z").build(previous);
  const comparison = compareSourceManifests(empty, previous, 2026);
  assert.deepEqual(comparison.dirtyCompetitionIds, ["TestOpen2020"]);
  assert.deepEqual(comparison.dirtyYears, [2020, 2026]);
});

test("fails closed when the prior manifest is unavailable", () => {
  const comparison = compareSourceManifests(manifest(), undefined, 2026);
  assert.equal(comparison.missingPreviousManifest, true);
  assert.deepEqual(comparison.dirtyYears, [2020]);
});

test("rejects result input that is not ordered by stable result ID", () => {
  const builder = new SourceManifestBuilder("2026-08-06T00:00:00Z");
  builder.addCompetition("TestOpen2020", 2020, {});
  builder.addResult("TestOpen2020", 2, {});
  assert.throws(() => builder.addResult("TestOpen2020", 1, {}), /ordered/);
});

test("canonicalizes person rows independent of export order", () => {
  const first = new SourceManifestBuilder("2026-08-06T00:00:00Z");
  first.addPerson("B", { country: "USA" });
  first.addPerson("A", { country: "Canada" });
  const second = new SourceManifestBuilder("2026-08-06T00:00:00Z");
  second.addPerson("A", { country: "Canada" });
  second.addPerson("B", { country: "USA" });
  assert.equal(first.build().dimensions.personsHash, second.build().dimensions.personsHash);
});
