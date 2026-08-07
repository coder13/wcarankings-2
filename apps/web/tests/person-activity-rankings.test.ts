import assert from "node:assert/strict";
import test from "node:test";
import {
  PERSON_ACTIVITY_METRICS,
  parsePersonActivityMetric,
} from "@/services/rankings/person-activity";

test("lists the supported person activity metrics", () => {
  assert.deepEqual(PERSON_ACTIVITY_METRICS, [
    "competitions",
    "countries",
    "rounds",
    "solves",
  ]);
});

test("defaults person activity rankings to competitions", () => {
  assert.equal(
    parsePersonActivityMetric(new URLSearchParams()),
    "competitions",
  );
});

test("rejects an unknown person activity metric", () => {
  assert.throws(
    () => parsePersonActivityMetric(new URLSearchParams({ metric: "medals" })),
    /metric must be competitions, countries, rounds, or solves/,
  );
});
