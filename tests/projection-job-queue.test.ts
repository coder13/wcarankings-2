import assert from "node:assert/strict";
import test from "node:test";
import {
  isResultRankingJob,
  projectionJobConnection,
} from "@wcarankings/projection-jobs";

test("reads the Redis database number from REDIS_URL", () => {
  const original = process.env.REDIS_URL;
  process.env.REDIS_URL = "redis://localhost:6379/15";
  try {
    assert.equal(projectionJobConnection().db, 15);
  } finally {
    process.env.REDIS_URL = original;
  }
});

test("sends result-ranking jobs to their dedicated queue", () => {
  assert.equal(
    isResultRankingJob({
      kind: "projection-rebuild",
      key: "result-rankings:2026:333:single",
      payload: {},
      version: 1,
    }),
    true,
  );
  assert.equal(
    isResultRankingJob({
      kind: "projection-rebuild",
      key: "yearly-rankings:2026:333:single",
      payload: {},
      version: 1,
    }),
    false,
  );
});
