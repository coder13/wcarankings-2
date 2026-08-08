import assert from "node:assert/strict";
import test from "node:test";
import { supportsProjectionJob } from "../packages/projection-jobs/src/supported.ts";

test("only accepts projection rebuild keys with a registered handler", () => {
  const supported = {
    kind: "projection-rebuild" as const,
    key: "person-stats:2026:3",
    version: 1,
    payload: { personIds: "2026TEST01", year: "2026" },
  };
  assert.equal(supportsProjectionJob(supported), true);
  assert.equal(
    supportsProjectionJob({
      ...supported,
      key: "medal-rankings:all-time:333:world:world:all",
    }),
    false,
  );
  assert.equal(
    supportsProjectionJob({
      ...supported,
      key: "result-rankings:all-time:333",
    }),
    false,
  );
  assert.equal(
    supportsProjectionJob({
      ...supported,
      key: "person-event-rankings:333:single",
      payload: {
        eventId: "333",
        resultType: "single",
      },
    }),
    true,
  );
  assert.equal(
    supportsProjectionJob({
      ...supported,
      key: "result-rankings:2026:333:average",
      payload: {
        eventId: "333",
        periodYear: "2026",
        resultType: "average",
      },
    }),
    false,
  );
  assert.equal(
    supportsProjectionJob({
      ...supported,
      key: "result-rankings:2026:333:single",
      payload: {
        eventId: "333",
        gender: "world",
        periodYear: "2026",
        resultType: "world",
      },
    }),
    false,
  );
  assert.equal(
    supportsProjectionJob({ ...supported, kind: "list-ranking-rebuild" }),
    false,
  );
  assert.equal(
    supportsProjectionJob({
      ...supported,
      key: "yearly-rankings:2026:333:single",
      payload: { eventId: "333", resultType: "single", year: "2026" },
    }),
    true,
  );
  assert.equal(
    supportsProjectionJob({
      ...supported,
      key: "competition-rankings:country:USA:f",
      payload: { gender: "f", regionId: "USA", scope: "country" },
    }),
    true,
  );
  assert.equal(
    supportsProjectionJob({
      ...supported,
      key: "competition-rankings:world:USA:all",
      payload: { gender: "all", regionId: "USA", scope: "world" },
    }),
    false,
  );
  assert.equal(
    supportsProjectionJob({
      ...supported,
      key: "yearly-rankings-year-333-single-country-USA-all",
      payload: { eventId: "333", resultType: "single", year: "2026" },
    }),
    false,
  );
});
