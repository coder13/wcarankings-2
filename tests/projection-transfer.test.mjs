import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeExportDate } from "../scripts/lib/projection-transfer-date.mjs";

const prepare = await readFile(
  new URL("../scripts/prepare-projection-transfer.mjs", import.meta.url),
  "utf8",
);
const publish = await readFile(
  new URL("../scripts/publish-projection-transfer.mjs", import.meta.url),
  "utf8",
);
const dockerfile = await readFile(
  new URL("../Dockerfile.data-tools", import.meta.url),
  "utf8",
);
const schema = await readFile(
  new URL("../scripts/mysql-schema.mjs", import.meta.url),
  "utf8",
);
const groups = await readFile(
  new URL("../scripts/projection-groups.mjs", import.meta.url),
  "utf8",
);
const syncWcaExport = await readFile(
  new URL("../scripts/sync-wca-export.mjs", import.meta.url),
  "utf8",
);
const canonicalExportMigration = await readFile(
  new URL("../migrations/mysql/app/V11__canonicalize_export_identity.sql", import.meta.url),
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

test("projection index publication overrides the application account timeout", () => {
  const connectionIndex = publish.indexOf("mysql.createConnection");
  const timeoutIndex = publish.indexOf("SET SESSION max_statement_time = 0");
  const validationIndex = publish.indexOf("for (const table of manifestTables)");

  assert.ok(connectionIndex >= 0);
  assert.ok(timeoutIndex > connectionIndex);
  assert.ok(validationIndex > timeoutIndex);
});

test("can preflight transfer rows, dates, and indexes before production cutover", () => {
  assert.match(publish, /prepareOnly = hasArgument\("prepare-only"\)/);
  assert.match(publish, /expectedExportDate/);
  assert.match(publish, /DELETE FROM/);
  assert.match(publish, /publication was not requested/);
  assert.match(publish, /if \(prepareOnly\)[\s\S]*else \{[\s\S]*promoteProjectionTables/);
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
  assert.match(dockerfile, /COPY --chown=data-tools:data-tools scripts \.\/scripts/);
  assert.match(dockerfile, /ENTRYPOINT \["node"\]/);
});

test("supports a canonical export date when importing a supplied SQL export", () => {
  assert.match(syncWcaExport, /canonical-export-date/);
  assert.match(syncWcaExport, /latest = \{ \.\.\.latest, exportDate: canonicalExportDate \}/);
  assert.match(canonicalExportMigration, /UPDATE export_metadata/);
  assert.match(canonicalExportMigration, /REGEXP/);
});

test("dry-run WCA export caching does not require a database connection", () => {
  assert.match(syncWcaExport, /if \(dryRun\) \{[\s\S]*await getCachedExport\(latest\);[\s\S]*return;[\s\S]*\}/);
  assert.match(syncWcaExport, /if \(!force && await getImportedDate\(\) === String\(latest\.exportDate\)\)/);
  assert.ok(
    syncWcaExport.indexOf("if (dryRun) {") < syncWcaExport.indexOf("await getImportedDate()"),
    "dry-run must return before checking the imported database export date",
  );
});

test("publishes result facts as an independent dependency artifact", () => {
  assert.match(schema, /name: "result-facts"[\s\S]*enabledByDefault: true/);
  assert.match(groups, /name: "result-facts"[\s\S]*tables: \["result_facts"\]/);
  assert.match(groups, /name: "result-rankings"[\s\S]*dependencies: \["result-facts"\]/);
  assert.match(groups, /name: "city-rankings"[\s\S]*dependencies: \["result-facts", "competition-rankings"\]/);
});
