import assert from "node:assert/strict";
import test from "node:test";
import { projectionJobConnection } from "@wcarankings/projection-jobs";

test("reads the Redis database number from REDIS_URL", () => {
  const original = process.env.REDIS_URL;
  process.env.REDIS_URL = "redis://localhost:6379/15";
  try {
    assert.equal(projectionJobConnection().db, 15);
  } finally {
    process.env.REDIS_URL = original;
  }
});
