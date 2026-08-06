import assert from "node:assert/strict";
import test from "node:test";
import {
  collectPersonActivityPopularity,
  collectPersonCompetitionPopularity,
  personActivityPopularityDescriptor,
  personCompetitionPopularityDescriptor,
} from "@/services/ranking-popularity/person-activity";
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

test("maps competition and activity requests to person-activity descriptors", () => {
  assert.deepEqual(
    personCompetitionPopularityDescriptor(
      new URLSearchParams({ year: "2025", region: "_Europe", gender: "f,m" }),
    ),
    {
      version: 1,
      family: "person-activity",
      metric: "competitions",
      year: 2025,
      region: { scope: "continent", regionId: "_Europe" },
      genders: ["m", "f"],
    },
  );
  assert.deepEqual(
    personActivityPopularityDescriptor(
      new URLSearchParams({ metric: "solves", year: "2025" }),
    ),
    {
      version: 1,
      family: "person-activity",
      metric: "solves",
      region: { scope: "world", regionId: "" },
      genders: [],
    },
  );
});

test("accepts only global activity first pages", () => {
  assert.notEqual(
    personActivityPopularityDescriptor(new URLSearchParams()),
    null,
  );
  for (const params of [
    new URLSearchParams({ start: "2" }),
    new URLSearchParams({ start: "50" }),
    new URLSearchParams({ locate: "2016TEST01" }),
    new URLSearchParams({ list: "7K3M9Q2D" }),
    new URLSearchParams({ wca_ids: "2016TEST01" }),
  ]) {
    assert.equal(personActivityPopularityDescriptor(params), null);
  }
  assert.notEqual(
    personCompetitionPopularityDescriptor(new URLSearchParams({ start: "1" })),
    null,
  );
});

test("records activity popularity and contains failures", async () => {
  const registered = { registered: true } as never;
  const calls: unknown[] = [];
  const didCollect = await collectPersonCompetitionPopularity(
    new URLSearchParams({ start: "1" }),
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

  const failures: unknown[] = [];
  assert.equal(
    await collectPersonActivityPopularity(new URLSearchParams(), {
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
});
