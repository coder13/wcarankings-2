import assert from "node:assert/strict";
import test from "node:test";
import {
  cityPopularityDescriptor,
  collectCityRankingPopularity,
} from "@/services/ranking-popularity/city-rankings";
import {
  competitionPopularityDescriptor,
  collectCompetitionRankingPopularity,
} from "@/services/ranking-popularity/competition-rankings";
import type { RankingPopularityService } from "@/services/ranking-popularity/service";

type Collector = Pick<
  RankingPopularityService,
  "register" | "recordSuccessfulFirstPageView" | "flushIfThresholdReached"
>;

function collector(
  register: Collector["register"],
  recordSuccessfulFirstPageView: Collector["recordSuccessfulFirstPageView"],
  flushIfThresholdReached: Collector["flushIfThresholdReached"] = async () =>
    false,
) {
  return { register, recordSuccessfulFirstPageView, flushIfThresholdReached };
}

test("maps competition ranking metrics to their descriptor fields", () => {
  assert.deepEqual(
    competitionPopularityDescriptor(
      new URLSearchParams({
        ranking: "fastest",
        eventId: "333",
        result: "average",
      }),
    ),
    {
      version: 1,
      family: "competition",
      metric: "fastest",
      eventId: "333",
      resultType: "average",
    },
  );
  assert.deepEqual(
    competitionPopularityDescriptor(
      new URLSearchParams({
        ranking: "latitude",
        hemisphere: "south",
        region: "US",
      }),
    ),
    {
      version: 1,
      family: "competition",
      metric: "latitude",
      hemisphere: "south",
      region: { scope: "country", regionId: "US" },
    },
  );
  assert.deepEqual(
    competitionPopularityDescriptor(
      new URLSearchParams({ ranking: "competitor-count" }),
    ),
    { version: 1, family: "competition", metric: "competitor-count" },
  );
});

test("maps city fastest and count metrics", () => {
  assert.deepEqual(
    cityPopularityDescriptor(
      new URLSearchParams({
        eventId: "333",
        result: "single",
        region: "_Europe",
        gender: "m",
      }),
    ),
    {
      version: 1,
      family: "city",
      metric: "fastest",
      eventId: "333",
      resultType: "single",
      region: { scope: "continent", regionId: "_Europe" },
      genders: ["m"],
    },
  );
  assert.deepEqual(
    cityPopularityDescriptor(
      new URLSearchParams({ eventId: "333", stat: "solves" }),
    ),
    {
      version: 1,
      family: "city",
      metric: "solves",
      eventId: "333",
      region: { scope: "world", regionId: "" },
      genders: [],
    },
  );
});

test("collects only global first pages", () => {
  for (const descriptor of [
    competitionPopularityDescriptor,
    cityPopularityDescriptor,
  ]) {
    assert.notEqual(
      descriptor(new URLSearchParams({ eventId: "333", result: "single" })),
      null,
    );
    for (const params of [
      new URLSearchParams({ eventId: "333", result: "single", start: "1" }),
      new URLSearchParams({ eventId: "333", result: "single", start: "50" }),
      new URLSearchParams({
        eventId: "333",
        result: "single",
        list: "7K3M9Q2D",
      }),
      new URLSearchParams({
        eventId: "333",
        result: "single",
        wca_ids: "2016TEST01",
      }),
      new URLSearchParams({
        eventId: "333",
        result: "single",
        locate: "2016TEST01",
      }),
    ]) {
      assert.equal(descriptor(params), null);
    }
  }
});

test("records competition and city popularity", async () => {
  const registered = { registered: true } as never;
  for (const collect of [
    collectCompetitionRankingPopularity,
    collectCityRankingPopularity,
  ]) {
    const calls: unknown[] = [];
    assert.equal(
      await collect(new URLSearchParams({ eventId: "333", result: "single" }), {
        collector: collector(
          async (descriptor) => {
            calls.push(descriptor);
            return registered;
          },
          (value) => {
            calls.push(value);
            return true;
          },
          async () => {
            calls.push("flush");
            return true;
          },
        ),
      }),
      true,
    );
    assert.deepEqual(calls.slice(1), [registered, "flush"]);
  }
});

test("contains competition and city popularity failures", async () => {
  for (const collect of [
    collectCompetitionRankingPopularity,
    collectCityRankingPopularity,
  ]) {
    const failures: unknown[] = [];
    assert.equal(
      await collect(new URLSearchParams({ eventId: "333" }), {
        collector: collector(
          async () => {
            throw new Error("database unavailable");
          },
          () => true,
        ),
        reportFailure: (error) => failures.push(error),
      }),
      false,
    );
    assert.equal(failures.length, 1);
  }
});
