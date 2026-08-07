import assert from "node:assert/strict";
import test from "node:test";
import {
  collectResultRankingPopularity,
  resultRankingPopularityDescriptor,
} from "@/services/ranking-popularity/result-rankings";
import type { RankingPopularityService } from "@/services/ranking-popularity/service";

type ResultPopularityCollector = Pick<
  RankingPopularityService,
  "register" | "recordSuccessfulFirstPageView" | "flushIfThresholdReached"
>;

function collector(
  register: ResultPopularityCollector["register"],
  recordSuccessfulFirstPageView: ResultPopularityCollector["recordSuccessfulFirstPageView"],
  flushIfThresholdReached: ResultPopularityCollector["flushIfThresholdReached"] = async () =>
    false,
) {
  return { register, recordSuccessfulFirstPageView, flushIfThresholdReached };
}

test("maps result ranking parameters to a normalized person-result descriptor", () => {
  assert.deepEqual(
    resultRankingPopularityDescriptor(
      new URLSearchParams({
        eventId: "333",
        result: "average",
        year: "2025",
        region: "_Europe",
        gender: "f,m",
        start: "0",
      }),
    ),
    {
      version: 1,
      family: "person-result",
      eventId: "333",
      resultType: "average",
      year: 2025,
      region: { scope: "continent", regionId: "_Europe" },
      genders: ["m", "f"],
      population: { kind: "everyone" },
    },
  );
});

test("accepts only global result first pages", () => {
  assert.notEqual(
    resultRankingPopularityDescriptor(
      new URLSearchParams({ eventId: "333", result: "single" }),
    ),
    null,
  );
  for (const params of [
    new URLSearchParams({ eventId: "333", result: "single", start: "1" }),
    new URLSearchParams({ eventId: "333", result: "single", start: "50" }),
    new URLSearchParams({
      eventId: "333",
      result: "single",
      locate: "2016TEST01",
    }),
    new URLSearchParams({ eventId: "333", result: "single", list: "7K3M9Q2D" }),
    new URLSearchParams({
      eventId: "333",
      result: "single",
      wca_ids: "2016TEST01",
    }),
  ]) {
    assert.equal(resultRankingPopularityDescriptor(params), null);
  }
});

test("records result popularity and starts the threshold flush", async () => {
  const registered = { registered: true } as never;
  const calls: unknown[] = [];
  const didCollect = await collectResultRankingPopularity(
    new URLSearchParams({ eventId: "333", result: "single", start: "0" }),
    {
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
    },
  );

  assert.equal(didCollect, true);
  assert.deepEqual(calls.slice(1), [registered, "flush"]);
});

test("contains result popularity failures", async () => {
  for (const failingCollector of [
    collector(
      async () => {
        throw new Error("database unavailable");
      },
      () => true,
    ),
    collector(
      async () => ({ registered: true }) as never,
      () => {
        throw new Error("buffer unavailable");
      },
    ),
  ]) {
    const failures: unknown[] = [];
    const didCollect = await collectResultRankingPopularity(
      new URLSearchParams({ eventId: "333", result: "single", start: "0" }),
      {
        collector: failingCollector,
        reportFailure: (error) => failures.push(error),
      },
    );
    assert.equal(didCollect, false);
    assert.equal(failures.length, 1);
  }
});
