import assert from "node:assert/strict";
import { test } from "bun:test";
import { normalizeExportDate } from "../data-tools/shared/date.ts";

test("normalizes equivalent export date representations", () => {
  const expected = "2026-07-29T00:00:23.000Z";
  assert.equal(normalizeExportDate("2026-07-29T00:00:23Z"), expected);
  assert.equal(normalizeExportDate("2026-07-29 00:00:23 UTC"), expected);
  assert.equal(normalizeExportDate(new Date(expected)), expected);
});

test("rejects missing and invalid export dates", () => {
  assert.equal(normalizeExportDate(null), null);
  assert.equal(normalizeExportDate("not-a-date"), null);
});

test("publishes result facts as an independent dependency artifact", async () => {
  const { DEPLOYMENT_PROJECTION_GROUPS, PROJECTION_JOBS } =
    await import("../data-tools/projections/jobs.ts");
  assert.ok(
    PROJECTION_JOBS.some(
      (job) => job.id === "result-facts" && job.enabledByDefault,
    ),
  );
  assert.deepEqual(
    DEPLOYMENT_PROJECTION_GROUPS.find((group) => group.name === "result-facts")
      ?.tables,
    ["result_facts"],
  );
  assert.deepEqual(
    DEPLOYMENT_PROJECTION_GROUPS.find(
      (group) => group.name === "result-rankings",
    )?.dependencies,
    ["result-facts"],
  );
  assert.deepEqual(
    DEPLOYMENT_PROJECTION_GROUPS.find((group) => group.name === "city-rankings")
      ?.dependencies,
    ["result-facts", "competition-rankings"],
  );
});
