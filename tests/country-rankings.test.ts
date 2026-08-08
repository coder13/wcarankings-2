import assert from "node:assert/strict";
import test from "node:test";
import {
  RANKING_STAT_SOURCES,
  rankingStatSource,
  type RankingStatSourceDefinition,
} from "@/lib/ranking-stat-sources";
import { countryGenderMask } from "@/services/rankings/country-rankings";

test("country gender cohorts map to the seven stored masks", () => {
  assert.equal(countryGenderMask([]), 7);
  assert.equal(countryGenderMask(["m"]), 1);
  assert.equal(countryGenderMask(["f"]), 2);
  assert.equal(countryGenderMask(["o"]), 4);
  assert.equal(countryGenderMask(["m", "f"]), 3);
  assert.equal(countryGenderMask(["m", "o"]), 5);
  assert.equal(countryGenderMask(["f", "o"]), 6);
});

test("registers country rankings as a home-feed-ready source", () => {
  const definitions: readonly RankingStatSourceDefinition[] =
    RANKING_STAT_SOURCES;
  assert.equal(definitions.length, 2);
  assert.deepEqual(rankingStatSource("country-event-stats"), {
    sourceId: "country-event-stats",
    entityType: "country",
    metrics: ["fastest", "competitors", "competitions", "solves"],
    supportedFilters: {
      event: true,
      resultType: true,
      regionScopes: ["world", "continent"],
      year: true,
      genders: true,
    },
    feedEligibility: { home: true, person: false },
    paths: {
      page: "/countries/fastest-single",
      api: "/api/countries/fastest-single",
    },
  });
  assert.throws(
    () => rankingStatSource("missing"),
    /Unknown ranking stat source/,
  );
});
