import assert from "node:assert/strict";
import test from "node:test";
import {
  collectGlobalRankingPopularity,
  globalRankingPopularityDescriptor,
} from "@/services/ranking-popularity/global-rankings";
import type { RankingPopularityService } from "@/services/ranking-popularity/service";

type GlobalPopularityCollector = Pick<
  RankingPopularityService,
  "register" | "recordSuccessfulFirstPageView" | "flushIfThresholdReached"
>;

function collector(
  register: GlobalPopularityCollector["register"],
  recordSuccessfulFirstPageView: GlobalPopularityCollector["recordSuccessfulFirstPageView"],
  flushIfThresholdReached: GlobalPopularityCollector["flushIfThresholdReached"] = async () =>
    false,
) {
  return {
    register,
    recordSuccessfulFirstPageView,
    flushIfThresholdReached,
  };
}

test("maps a global rankings query to a normalized person-event descriptor", () => {
  assert.deepEqual(
    globalRankingPopularityDescriptor(
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
      family: "person-event",
      eventId: "333",
      resultType: "average",
      year: 2025,
      region: { scope: "continent", regionId: "_Europe" },
      genders: ["m", "f"],
      population: { kind: "everyone" },
    },
  );
});

test("collects only global first pages without locate or list state", () => {
  assert.notEqual(
    globalRankingPopularityDescriptor(new URLSearchParams()),
    null,
  );
  for (const params of [
    new URLSearchParams({ start: "1" }),
    new URLSearchParams({ start: "50" }),
    new URLSearchParams({ locate: "2016TEST01" }),
    new URLSearchParams({ list: "7K3M9Q2D" }),
    new URLSearchParams({ wca_ids: "2016TEST01" }),
    new URLSearchParams({ eventId: "SOR" }),
  ]) {
    assert.equal(globalRankingPopularityDescriptor(params), null);
  }
});

test("records the descriptor through an injected popularity collector", async () => {
  const registered = { registered: true } as never;
  const calls: unknown[] = [];
  const didCollect = await collectGlobalRankingPopularity(
    new URLSearchParams({ eventId: "333", start: "0" }),
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
  assert.equal(calls.length, 3);
  assert.equal(calls[1], registered);
  assert.equal(calls[2], "flush");
});

test("contains popularity registration and recording failures", async () => {
  for (const collectorForFailure of [
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
    const didCollect = await collectGlobalRankingPopularity(
      new URLSearchParams({ eventId: "333", start: "0" }),
      {
        collector: collectorForFailure,
        reportFailure: (error) => failures.push(error),
      },
    );

    assert.equal(didCollect, false);
    assert.equal(failures.length, 1);
  }
});
