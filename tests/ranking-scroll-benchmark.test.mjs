import assert from "node:assert/strict";
import test from "node:test";
import {
  scenarioName,
  scenarioUrl,
} from "../scripts/lib/ranking-scroll-benchmark.ts";
import {
  ALL_RANKING_SCROLL_SCENARIOS,
  CITY_RANKING_SCENARIOS,
  COMPETITION_RANKING_SCENARIOS,
  PERSON_RANKING_SCENARIOS,
  RANKING_SCROLL_SUITES,
  RESULT_RANKING_SCENARIOS,
} from "../scripts/lib/ranking-scroll-scenarios.ts";

test("ranking scroll scenarios are divided into the four primary stats", () => {
  assert.deepEqual(Object.keys(RANKING_SCROLL_SUITES), [
    "persons",
    "results",
    "competitions",
    "cities",
  ]);
  for (const scenarios of Object.values(RANKING_SCROLL_SUITES))
    assert.ok(scenarios.length > 0);
  assert.equal(
    ALL_RANKING_SCROLL_SCENARIOS.length,
    Object.values(RANKING_SCROLL_SUITES).reduce(
      (total, scenarios) => total + scenarios.length,
      0,
    ),
  );
  assert.equal(
    new Set(
      ALL_RANKING_SCROLL_SCENARIOS.map((scenario) =>
        scenarioName("all", scenario),
      ),
    ).size,
    ALL_RANKING_SCROLL_SCENARIOS.length,
  );
});

test("scenario URLs preserve scenario-specific filters and pagination", () => {
  const resultYear = RESULT_RANKING_SCENARIOS.find(
    ({ id }) => id === "single-world-2023",
  );
  const resultUrl = new URL(
    scenarioUrl("http://localhost:3000", resultYear, 2, 50),
  );
  assert.equal(resultUrl.pathname, "/api/rankings/results");
  assert.equal(resultUrl.searchParams.get("year"), "2023");
  assert.equal(resultUrl.searchParams.get("start"), "100");
  assert.equal(resultUrl.searchParams.get("limit"), "50");

  const person = PERSON_RANKING_SCENARIOS.find(
    ({ id }) => id === "event-single-world-fo",
  );
  const personUrl = new URL(
    scenarioUrl("http://localhost:3000/", person, 0, 50),
  );
  assert.equal(personUrl.pathname, "/api/rankings");
  assert.equal(personUrl.searchParams.get("paged"), "1");
  assert.deepEqual(personUrl.searchParams.getAll("gender"), ["f", "o"]);
});

test("each primary stat covers its distinct ranking modes", () => {
  assert.ok(
    PERSON_RANKING_SCENARIOS.some(({ params }) => params.eventId === "SOR"),
  );
  assert.ok(
    PERSON_RANKING_SCENARIOS.some(
      ({ params }) => params.eventId === "sor-kinch",
    ),
  );
  assert.ok(
    PERSON_RANKING_SCENARIOS.some(
      ({ path }) => path === "/api/rankings/people/competitions",
    ),
  );
  assert.deepEqual(
    new Set(RESULT_RANKING_SCENARIOS.map(({ params }) => params.result)),
    new Set(["single", "average"]),
  );
  assert.deepEqual(
    new Set(COMPETITION_RANKING_SCENARIOS.map(({ params }) => params.ranking)),
    new Set(["fastest", "podium", "competitor-count", "latitude"]),
  );
  assert.deepEqual(
    new Set(
      CITY_RANKING_SCENARIOS.map(({ params }) => params.stat).filter(Boolean),
    ),
    new Set(["competitors", "competitions", "solves"]),
  );
  assert.ok(
    CITY_RANKING_SCENARIOS.every(
      ({ params }) => (params.gender?.length ?? 0) <= 1,
    ),
  );
});
