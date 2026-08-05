import assert from "node:assert/strict";
import { test } from "bun:test";
import { normalizeExportDate } from "../data-tools/shared/date.ts";
import { deferredProjectionIndexes } from "../data-tools/projections/transfer/prepare.ts";

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

test("serializes the built table indexes for deferred transfer", () => {
  const indexes = deferredProjectionIndexes([
    {
      Key_name: "PRIMARY",
      Non_unique: 0,
      Seq_in_index: 1,
      Column_name: "id",
      Sub_part: null,
      Collation: "A",
    },
    {
      Key_name: "idx_example",
      Non_unique: 1,
      Seq_in_index: 2,
      Column_name: "position",
      Sub_part: null,
      Collation: "D",
    },
    {
      Key_name: "idx_example",
      Non_unique: 1,
      Seq_in_index: 1,
      Column_name: "name",
      Sub_part: 12,
      Collation: "A",
    },
  ]);
  assert.deepEqual(indexes, [
    {
      name: "idx_example",
      sql: "ADD INDEX `idx_example` (`name`(12), `position` DESC)",
    },
  ]);
});

test("publishes result facts as an independent dependency artifact", async () => {
  const { PROJECTION_JOBS } =
    await import("../data-tools/projection-catalog/registry.ts");
  const { DEPLOYMENT_PROJECTION_GROUPS } =
    await import("../data-tools/projection-catalog/groups.ts");
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
    ["result-facts"],
  );
});
