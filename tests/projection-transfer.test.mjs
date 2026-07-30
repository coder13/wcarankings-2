import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeExportDate } from "../scripts/projection-transfer-date.mjs";

const prepare = await readFile(
  new URL("../scripts/prepare-projection-transfer.mjs", import.meta.url),
  "utf8",
);
const publish = await readFile(
  new URL("../scripts/publish-projection-transfer.mjs", import.meta.url),
  "utf8",
);
const dockerfile = await readFile(
  new URL("../Dockerfile", import.meta.url),
  "utf8",
);
const schema = await readFile(
  new URL("../scripts/mysql-schema.mjs", import.meta.url),
  "utf8",
);

test("defers secondary projection indexes until after bulk transfer import", () => {
  assert.match(prepare, /SHOW INDEX FROM/);
  assert.match(prepare, /DROP INDEX/);
  assert.match(prepare, /projection_transfer_indexes/);
  assert.match(publish, /Building \$\{deferredIndexes\.length\} deferred projection indexes/);
  assert.match(publish, /indexes\.map\(\(index\) => index\.index_sql\)\.join/);
  assert.match(publish, /promoteProjectionTables/);
});

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

test("packages the export-date normalizer with the publisher", () => {
  assert.match(dockerfile, /projection-transfer-date\.mjs/);
});

test("publishes result facts with the core runtime transfer", () => {
  assert.match(schema, /name: "result-facts"[\s\S]*enabledByDefault: true/);
  assert.match(schema, /tables: PUBLISHED_PROJECTION_TABLES\.filter\(\(table\) => table !== "person_sum_of_ranks_scores" && !table\.startsWith\("person_year_"\)\)/);
});
