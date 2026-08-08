import assert from "node:assert/strict";
import test from "node:test";
import { supportsProjectionJob } from "@wcarankings/projection-jobs/supported";

const projectionJob = (key: string, payload: Record<string, string>) => ({
  kind: "projection-rebuild" as const,
  key,
  payload,
  version: 1,
});

test("the live Sum of Ranks handler supports only regional all-time scopes", () => {
  assert.equal(
    supportsProjectionJob(
      projectionJob("sum-of-ranks:country:USA", {
        continentId: "_North America",
        regionId: "USA",
        scope: "country",
      }),
    ),
    true,
  );
  assert.equal(
    supportsProjectionJob(
      projectionJob("sum-of-ranks:continent:_North America", {
        countryIds: "Canada,USA",
        regionId: "_North America",
        scope: "continent",
      }),
    ),
    true,
  );
  assert.equal(
    supportsProjectionJob(
      projectionJob("sum-of-ranks:world:", {
        regionId: "",
        scope: "world",
      }),
    ),
    false,
  );
});
