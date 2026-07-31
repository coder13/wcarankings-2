import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("builds a result-level compatibility projection without unused secondary indexes", async () => {
  const [source, indexes, counts, schema, importer, preflight, backfill, resultBackfill, dockerfile, deploy, fixture] = await Promise.all([
    readFile(new URL("sql/ranking-projections/result_entries_single_source.sql", root), "utf8"),
    readFile(new URL("sql/ranking-projections/result_entries_single_indexes.sql", root), "utf8"),
    readFile(new URL("sql/ranking-projections/result_counts.sql", root), "utf8"),
    readFile(new URL("scripts/mysql-schema.mjs", root), "utf8"),
    readFile(new URL("scripts/sync-wca-export.mjs", root), "utf8"),
    readFile(new URL("scripts/check-ranking-projections.mjs", root), "utf8"),
    readFile(new URL("scripts/backfill-result-entries.mjs", root), "utf8"),
    readFile(new URL("scripts/backfill-result-rankings.mjs", root), "utf8"),
    readFile(new URL("Dockerfile.data-tools", root), "utf8"),
    readFile(new URL(".github/workflows/pull-request.yml", root), "utf8"),
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
  assert.doesNotMatch(indexes, /ADD INDEX/);
  assert.match(counts, /FROM result_entries_single/);
  assert.match(counts, /PRIMARY KEY \(event_id, scope, region_id\)/);
  assert.match(schema, /result_entries_single_source/);
  assert.match(schema, /result_entries_single_indexes\.sql/);
  assert.match(schema, /result_counts\.sql/);
  assert.match(schema, /\(\?!\[A-Za-z0-9_\]\)/);
  assert.doesNotMatch(schema, /replaceAll\(table, `\$\{table\}\$\{suffix\}`\)/);
  assert.match(schema, /idx_results_single_event_best/);
  assert.match(schema, /Skipping \$\{table\} index \$\{name\}; table is not present/);
  assert.match(importer, /result_entries_single_staging/);
  assert.match(importer, /result_counts_staging/);
  assert.match(importer, /published_result_count/);
  assert.match(preflight, /result_entries_single/);
  assert.doesNotMatch(preflight, /idx_result_entries_single_world/);
  assert.match(backfill, /refreshMysqlSchema/);
  assert.match(backfill, /promoteProjectionTables/);
  assert.match(resultBackfill, /result-ranking-counts/);
  assert.match(dockerfile, /COPY --chown=data-tools:data-tools scripts \.\/scripts/);
  assert.match(deploy, /backfill-result-entries\.mjs/);
  assert.match(deploy, /refresh-rankings\.mjs/);
  assert.match(fixture, /year SMALLINT/);
  assert.match(fixture, /month TINYINT/);
  assert.match(fixture, /day TINYINT/);
  assert.match(fixture, /regional_single_record/);
});

test("normal rankings retain separate historical country and continent bests", async () => {
  const [single, average, listRankings, fixture, resultAttemptsMigration] = await Promise.all([
    readFile(new URL("sql/ranking-projections/ranking_entries_single_source.sql", root), "utf8"),
    readFile(new URL("sql/ranking-projections/ranking_entries_average_source.sql", root), "utf8"),
    readFile(new URL("lib/list-rankings.ts", root), "utf8"),
    readFile(new URL("tests/fixtures/regional-ranking-history.sql", root), "utf8"),
    readFile(new URL("migrations/mysql/V8__result_attempts_lookup.sql", root), "utf8"),
  ]);
  const sources = `${single}\n${average}`;

  assert.match(fixture, /'CHANGE1', 'United States', '_North America', 549/);
  assert.match(fixture, /'CHANGE1', 'New Zealand', '_Oceania', 600/);
  assert.match(sources, /PARTITION BY r\.event_id, r\.person_id, COALESCE\(r\.person_country_id, ''\)/);
  assert.match(sources, /PARTITION BY r\.event_id, r\.person_id, COALESCE\(country\.continent_id, ''\)/);
  assert.match(sources, /WHERE country_person_position = 1/);
  assert.match(sources, /WHERE continent_person_position = 1/);
  assert.match(sources, /FROM results r/);
  assert.match(sources, /FROM ranks_single r/);
  assert.match(sources, /FROM ranks_average r/);
  assert.match(sources, /UNION ALL/);
  assert.match(sources, /regional_record = 'NR'/);
  assert.match(listRankings, /let rankingColumn = "world_rank";[\s\S]*input\.region\.scope === "continent"/);
  assert.match(listRankings, /`ranking\.\$\{rankingColumn\} > 0`/);
  assert.match(resultAttemptsMigration, /ALTER TABLE result_attempts/);
  assert.match(resultAttemptsMigration, /ADD INDEX idx_result_attempts_result/);
  assert.doesNotMatch(resultAttemptsMigration, /information_schema\.tables/);
});
