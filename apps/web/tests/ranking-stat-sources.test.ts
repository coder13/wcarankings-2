import assert from "node:assert/strict";
import test from "node:test";
import {
  RANKING_STAT_SOURCES,
  rankingStatSource,
} from "@/lib/ranking-stat-sources";

test("registers PR Streak for ranking pages and both feed modes", () => {
  assert.deepEqual(rankingStatSource("person-pr-streak"), {
    sourceId: "person-pr-streak",
    entityType: "person",
    metrics: ["pr-streak"],
    supportedFilters: {
      event: false,
      resultType: false,
      regionScopes: ["world", "continent", "country"],
      year: true,
      genders: true,
    },
    feedEligibility: { home: true, person: true },
    paths: {
      page: "/persons/pr-streak",
      api: "/api/rankings/people/pr-streak",
    },
  });
  assert.equal(
    new Set(RANKING_STAT_SOURCES.map(({ sourceId }) => sourceId)).size,
    RANKING_STAT_SOURCES.length,
  );
});

test("rejects unknown ranking stat sources", () => {
  assert.throws(() => rankingStatSource("missing"), /Unknown ranking stat/);
});
