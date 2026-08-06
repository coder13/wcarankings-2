import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalRankingListDescriptorJson,
  normalizeRankingListDescriptor,
  parseRankingListDescriptorUrl,
  rankingListCacheIdentity,
  rankingListCacheKey,
  rankingListDescriptorUrl,
  rankingListKey,
  RankingListDescriptorError,
  RANKING_LIST_DESCRIPTOR_VERSION,
  normalizeRankingResultWindow,
  type RankingPopulation,
  type RankingListCacheIdentity,
  type RankingListDescriptor,
  type RankingRegion,
  type RankingResultWindow,
} from "@/lib/ranking-list-descriptor";

test("normalizes equivalent person-list inputs", () => {
  const first: RankingListDescriptor = normalizeRankingListDescriptor({
    family: "person-event",
    eventId: "333",
    resultType: null,
    year: null,
    region: { scope: "world", regionId: "ignored" },
    genders: ["o", "m", "f", "m"],
    population: { kind: "public-list", publicId: "7k3m9q2d" },
  });
  const second = normalizeRankingListDescriptor({
    version: RANKING_LIST_DESCRIPTOR_VERSION,
    family: "person-event",
    eventId: "333",
    resultType: "single",
    region: "world",
    genders: [],
    population: { kind: "public-list", publicId: "7K3M9Q2D" },
  });

  assert.deepEqual(first, second);
  if (first.family !== "person-event") assert.fail("Expected person-event.");
  const world: RankingRegion = { scope: "world", regionId: "" };
  assert.deepEqual(first.region, world);
  assert.deepEqual(first.genders, []);
  assert.equal(first.population.kind, "public-list");
  assert.equal(
    canonicalRankingListDescriptorJson(first),
    JSON.stringify(first),
  );
});

test("normalizes system aliases and preserves collision-sensitive dimensions", () => {
  const population: RankingPopulation = {
    kind: "system-list",
    systemAlias: "  Top-Cubers ",
  };
  const base = {
    family: "person-event",
    eventId: "333",
    resultType: "single",
    year: null,
    region: "_Europe",
    genders: ["f"],
    population,
  } as const;
  const baseKey = rankingListKey(base);
  const normalizedBase = normalizeRankingListDescriptor(base);

  if (normalizedBase.family !== "person-event")
    assert.fail("Expected person-event.");
  assert.equal(normalizedBase.population.kind, "system-list");
  assert.notEqual(rankingListKey({ ...base, eventId: "222" }), baseKey);
  assert.notEqual(rankingListKey({ ...base, year: 2025 }), baseKey);
  assert.notEqual(
    rankingListKey({ ...base, family: "person-result" }),
    baseKey,
  );
  assert.notEqual(
    rankingListKey({
      ...base,
      population: { kind: "system-list", systemAlias: "other-cubers" },
    }),
    baseKey,
  );
});

test("rejects unsupported combinations and excluded populations", () => {
  assert.throws(
    () =>
      normalizeRankingListDescriptor({
        family: "person-activity",
        metric: "solves",
        year: 2025,
      }),
    RankingListDescriptorError,
  );
  assert.deepEqual(
    normalizeRankingListDescriptor({
      family: "person-activity",
      metric: "solves",
      year: null,
    }),
    normalizeRankingListDescriptor({
      family: "person-activity",
      metric: "solves",
    }),
  );
  assert.throws(
    () =>
      parseRankingListDescriptorUrl(
        "/api/rankings/people/activity?metric=solves&year=2025",
      ),
    RankingListDescriptorError,
  );
  assert.throws(
    () =>
      normalizeRankingListDescriptor({
        family: "person-composite",
        metric: "kinch",
        order: "continent",
        region: "_Europe",
      }),
    RankingListDescriptorError,
  );
  assert.throws(
    () =>
      normalizeRankingListDescriptor({
        family: "competition",
        metric: "competitor-count",
        eventId: "333",
      }),
    RankingListDescriptorError,
  );
  assert.throws(
    () =>
      normalizeRankingListDescriptor({
        family: "city",
        metric: "fastest",
        eventId: "333",
        resultType: "single",
        genders: ["m", "f"],
      }),
    RankingListDescriptorError,
  );
  assert.throws(
    () =>
      normalizeRankingListDescriptor({
        family: "person-event",
        eventId: "333",
        population: { kind: "private-list", listId: "not-public" },
      }),
    RankingListDescriptorError,
  );
  assert.throws(
    () =>
      normalizeRankingListDescriptor({
        family: "person-event",
        eventId: "333",
        wcaIds: ["2016TEST01"],
      }),
    RankingListDescriptorError,
  );
});

test("limits list populations to event and result rankings", () => {
  const listPopulation = { kind: "public-list", publicId: "7K3M9Q2D" };
  for (const descriptor of [
    {
      family: "person-composite",
      metric: "sum-of-ranks",
      resultType: "single",
      population: listPopulation,
    },
    {
      family: "person-activity",
      metric: "competitions",
      population: listPopulation,
    },
    {
      family: "person-medals",
      eventId: "all",
      population: listPopulation,
    },
  ]) {
    assert.throws(
      () => normalizeRankingListDescriptor(descriptor),
      RankingListDescriptorError,
    );
  }

  for (const url of [
    "/api/rankings?eventId=SOR&result=single&list=7K3M9Q2D",
    "/api/rankings/people/activity?metric=competitions&list=7K3M9Q2D",
    "/api/rankings/people/medals?list=7K3M9Q2D",
  ]) {
    assert.throws(
      () => parseRankingListDescriptorUrl(url),
      RankingListDescriptorError,
    );
  }

  for (const descriptor of [
    {
      family: "person-event",
      eventId: "333",
      resultType: "single",
      population: listPopulation,
    },
    {
      family: "person-result",
      eventId: "333",
      resultType: "single",
      population: { kind: "system-list", systemAlias: "top-cubers" },
    },
  ]) {
    const normalized = normalizeRankingListDescriptor(descriptor);
    assert.deepEqual(
      parseRankingListDescriptorUrl(rankingListDescriptorUrl(normalized)),
      normalized,
    );
  }
});

test("round-trips every supported descriptor family through canonical URLs", () => {
  const descriptors = [
    {
      family: "person-event",
      eventId: "333",
      resultType: "average",
      year: 2025,
      region: "USA",
      genders: ["f"],
      population: { kind: "public-list", publicId: "7K3M9Q2D" },
    },
    {
      family: "person-result",
      eventId: "222",
      resultType: "single",
      year: null,
      population: { kind: "system-list", systemAlias: "top-cubers" },
    },
    {
      family: "person-composite",
      metric: "sum-of-ranks",
      resultType: "average",
      year: 2024,
      region: "_Europe",
    },
    {
      family: "person-composite",
      metric: "kinch",
      order: "continent",
      region: "USA",
    },
    {
      family: "person-activity",
      metric: "competitions",
      year: 2024,
      genders: ["f", "m"],
    },
    { family: "person-activity", metric: "solves", region: "Australia" },
    {
      family: "person-medals",
      medalType: "gold",
      eventId: "333",
      year: 2023,
    },
    {
      family: "competition",
      metric: "fastest",
      eventId: "333",
      resultType: "average",
    },
    { family: "competition", metric: "podium", eventId: "444bf" },
    { family: "competition", metric: "competitor-count" },
    {
      family: "competition",
      metric: "latitude",
      hemisphere: "south",
      region: "_Oceania",
    },
    {
      family: "city",
      metric: "fastest",
      eventId: "333",
      resultType: "single",
      genders: ["o"],
    },
    { family: "city", metric: "solves", eventId: "333", region: "USA" },
  ];

  for (const descriptor of descriptors) {
    const normalized = normalizeRankingListDescriptor(descriptor);
    const url = rankingListDescriptorUrl(normalized);
    assert.deepEqual(parseRankingListDescriptorUrl(url), normalized, url);
  }
});

test("writes one deterministic URL for equivalent descriptor inputs", () => {
  assert.equal(
    rankingListDescriptorUrl({
      family: "person-event",
      eventId: "333",
      resultType: null,
      year: 2025,
      region: "_Europe",
      genders: ["f", "m", "f"],
      population: { kind: "public-list", publicId: "7k3m9q2d" },
    }),
    "/api/rankings?eventId=333&result=single&year=2025&region=_Europe&gender=m%2Cf&list=7K3M9Q2D",
  );
});

test("keeps result windows and projection generations outside the list key", () => {
  const descriptor = {
    family: "person-event",
    eventId: "333",
    resultType: "single",
  };
  const key = rankingListKey(descriptor);
  const window: RankingResultWindow = { start: 0, limit: 50 };
  const first: RankingListCacheIdentity = rankingListCacheIdentity(
    "generation-a",
    descriptor,
    window,
  );
  const second = rankingListCacheIdentity("generation-a", descriptor, {
    start: 50,
    limit: 50,
  });
  const third = rankingListCacheIdentity("generation-b", descriptor, {
    start: 0,
    limit: 50,
  });

  assert.equal(first.listKey, key);
  assert.equal(
    rankingListCacheKey("generation-a", descriptor, window),
    JSON.stringify(first),
  );
  assert.deepEqual(normalizeRankingResultWindow(window), window);
  assert.notDeepEqual(first, second);
  assert.notDeepEqual(first, third);
});

test("ignores pagination and search state while parsing a ranking-list URL", () => {
  const parsed = parseRankingListDescriptorUrl(
    "/api/rankings?eventId=333&result=single&start=100&limit=50&cursorRank=99&search=Avery&locate=2024AVERY01",
  );
  assert.deepEqual(
    parsed,
    normalizeRankingListDescriptor({
      family: "person-event",
      eventId: "333",
      resultType: "single",
    }),
  );
});
