import assert from "node:assert/strict";
import test from "node:test";
import {
  PERSON_ACTIVITY_METRICS,
  parsePersonStatisticInput,
  parsePersonActivityMetric,
} from "@/services/rankings/person-activity";

test("lists the supported person statistics", () => {
  assert.deepEqual(PERSON_ACTIVITY_METRICS, [
    "competitions",
    "countries",
    "rounds",
    "solves",
  ]);
});

test("defaults person statistic rankings to competitions", () => {
  assert.equal(
    parsePersonActivityMetric(new URLSearchParams()),
    "competitions",
  );
});

test("rejects an unknown person statistic", () => {
  assert.throws(
    () => parsePersonActivityMetric(new URLSearchParams({ metric: "medals" })),
    /metric must be competitions, countries, rounds, or solves/,
  );
});

test("parses the selected year for every person statistic", () => {
  const input = parsePersonStatisticInput(
    new URLSearchParams({ metric: "solves", year: "2026" }),
  );
  assert.equal(input.metric, "solves");
  assert.equal(input.year, 2026);
});
