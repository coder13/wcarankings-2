import assert from "node:assert/strict";
import test from "node:test";
import {
  collectPersonMedalsPopularity,
  personMedalsPopularityDescriptor,
} from "@/services/ranking-popularity/person-medals";
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

test("maps medal requests to person-medals descriptors", () => {
  assert.deepEqual(
    personMedalsPopularityDescriptor(
      new URLSearchParams({
        eventId: "333",
        medal: "gold",
        year: "2025",
        region: "US",
        gender: "f,m",
        start: "1",
      }),
    ),
    {
      version: 1,
      family: "person-medals",
      medalType: "gold",
      eventId: "333",
      year: 2025,
      region: { scope: "country", regionId: "US" },
      genders: ["m", "f"],
    },
  );
});

test("accepts only global medal first pages", () => {
  assert.notEqual(
    personMedalsPopularityDescriptor(new URLSearchParams()),
    null,
  );
  for (const params of [
    new URLSearchParams({ start: "2" }),
    new URLSearchParams({ locate: "2016TEST01" }),
    new URLSearchParams({ list: "7K3M9Q2D" }),
    new URLSearchParams({ wca_ids: "2016TEST01" }),
  ]) {
    assert.equal(personMedalsPopularityDescriptor(params), null);
  }
});

test("records medal popularity and contains failures", async () => {
  const registered = { registered: true } as never;
  const calls: unknown[] = [];
  assert.equal(
    await collectPersonMedalsPopularity(new URLSearchParams({ start: "1" }), {
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

  const failures: unknown[] = [];
  assert.equal(
    await collectPersonMedalsPopularity(new URLSearchParams(), {
      collector: collector(
        async () => ({ registered: true }) as never,
        () => {
          throw new Error("buffer unavailable");
        },
      ),
      reportFailure: (error) => failures.push(error),
    }),
    false,
  );
  assert.equal(failures.length, 1);
});
