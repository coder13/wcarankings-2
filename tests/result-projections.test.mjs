import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("builds an indexed, result-level single projection for cursor paging", async () => {
  const [source, indexes, counts, schema, importer, preflight, backfill, deploy, fixture] = await Promise.all([
    readFile(new URL("sql/ranking-projections/result_entries_single_source.sql", root), "utf8"),
    readFile(new URL("sql/ranking-projections/result_entries_single_indexes.sql", root), "utf8"),
    readFile(new URL("sql/ranking-projections/result_counts.sql", root), "utf8"),
    readFile(new URL("scripts/mysql-schema.mjs", root), "utf8"),
    readFile(new URL("scripts/sync-wca-export.mjs", root), "utf8"),
    readFile(new URL("scripts/check-ranking-projections.mjs", root), "utf8"),
    readFile(new URL("scripts/backfill-result-entries.mjs", root), "utf8"),
    readFile(new URL(".github/workflows/deploy.yml", root), "utf8"),
    readFile(new URL("tests/fixtures/visual-smoke.sql", root), "utf8"),
  ]);

  assert.match(source, /FROM results r/);
  assert.match(source, /WHERE r\.best > 0/);
  assert.match(source, /r\.id AS result_id/);
  assert.match(source, /comp\.year/);
  assert.match(source, /comp\.month/);
  assert.match(source, /comp\.day/);
  assert.doesNotMatch(source, /comp\.start_date/);
  assert.match(source, /DENSE_RANK\(\) OVER \(/);
  assert.match(source, /ROW_NUMBER\(\) OVER \(/);
  assert.match(source, /PARTITION BY r\.event_id, COALESCE\(c\.continent_id, ''\)/);
  assert.match(source, /PARTITION BY r\.event_id, COALESCE\(p\.country_id, ''\)/);
  assert.match(indexes, /PRIMARY KEY \(result_id\)/);
  assert.match(indexes, /idx_result_entries_single_world \(event_id, world_sub_rank, result_id\)/);
  assert.match(indexes, /idx_result_entries_single_continent \(event_id, continent_id, continent_sub_rank, result_id\)/);
  assert.match(indexes, /idx_result_entries_single_country \(event_id, country_id, country_sub_rank, result_id\)/);
  assert.match(counts, /FROM result_entries_single/);
  assert.match(counts, /PRIMARY KEY \(event_id, scope, region_id\)/);
  assert.match(schema, /result_entries_single_source/);
  assert.match(schema, /result_entries_single_indexes\.sql/);
  assert.match(schema, /result_counts\.sql/);
  assert.match(schema, /idx_results_single_event_best/);
  assert.match(importer, /result_entries_single_staging/);
  assert.match(importer, /result_counts_staging/);
  assert.match(importer, /published_result_count/);
  assert.match(preflight, /result_entries_single/);
  assert.match(preflight, /idx_result_entries_single_world/);
  assert.match(backfill, /refreshResultEntriesSchema/);
  assert.match(backfill, /promoteResultEntriesSchema/);
  assert.match(deploy, /backfill-result-entries\.mjs/);
  assert.match(fixture, /year SMALLINT/);
  assert.match(fixture, /month TINYINT/);
  assert.match(fixture, /day TINYINT/);
  assert.match(fixture, /regional_single_record/);
});
