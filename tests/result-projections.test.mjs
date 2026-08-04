import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const readSql = async (path) => (await readFile(new URL(path, root), "utf8")).replace(/\s+/g, " ");

test("builds a result-level compatibility projection with count-oriented indexes", async () => {
  const [source, indexes, counts, schema, importer, preflight, backfill, resultBackfill, dockerfile, deploy, fixture] = await Promise.all([
    readSql("sql/ranking-projections/result_entries_single_source.sql"),
    readSql("sql/ranking-projections/result_entries_single_indexes.sql"),
    readSql("sql/ranking-projections/result_counts.sql"),
    readFile(new URL("scripts/mysql-schema.mjs", root), "utf8"),
    readFile(new URL("scripts/sync-wca-export.mjs", root), "utf8"),
    readFile(new URL("scripts/check-ranking-projections.mjs", root), "utf8"),
    readFile(new URL("scripts/backfill-result-entries.mjs", root), "utf8"),
    readFile(new URL("scripts/backfill-result-rankings.mjs", root), "utf8"),
    readFile(new URL("Dockerfile.data-tools", root), "utf8"),
    readFile(new URL(".github/workflows/pull-request.yml", root), "utf8"),
    readSql("tests/fixtures/visual-smoke.sql"),
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
  assert.match(indexes, /idx_result_entries_single_event \(event_id\)/);
  assert.match(indexes, /idx_result_entries_single_continent \(event_id, continent_id\)/);
  assert.match(indexes, /idx_result_entries_single_country \(event_id, country_id\)/);
  assert.match(counts, /FROM result_entries_single/);
  assert.match(counts, /PRIMARY KEY \(event_id, scope, region_id\)/);
  assert.match(schema, /result_entries_single_source/);
  assert.match(schema, /result_entries_single_indexes\.sql/);
  assert.match(schema, /result_counts\.sql/);
  assert.match(schema, /\(\?!\[A-Za-z0-9_\]\)/);
  assert.doesNotMatch(schema, /replaceAll\(table, `\$\{table\}\$\{suffix\}`\)/);
  assert.match(schema, /idx_results_single_event_best/);
  assert.match(schema, /idx_results_competition_person/);
  assert.match(schema, /export async function ensureWcaPersonLookupIndex/);
  assert.match(schema, /table === "persons" && name === "idx_persons_wca_sub"/);
  assert.match(importer, /if \(rawOnly\) \{\s+await refreshRawPersonLookupIndex\(\)/);
  assert.match(schema, /Skipping \$\{table\} index \$\{name\}; table is not present/);
  assert.match(importer, /result_entries_single_staging/);
  assert.match(importer, /result_counts_staging/);
  assert.match(importer, /published_result_count/);
  assert.match(preflight, /result_entries_single/);
  assert.match(preflight, /idx_result_entries_single_event/);
  assert.match(preflight, /idx_result_entries_single_continent/);
  assert.match(preflight, /idx_result_entries_single_country/);
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
  assert.match(fixture, /gender CHAR\(1\) NOT NULL/);
  assert.match(fixture, /regional_single_record/);
});

test("materializes attempt facts once as an index-free build stage", async () => {
  const [stage, cleanup, single, schema, groups, queries, listResults, preflight] = await Promise.all([
    readSql("sql/ranking-projections/solve_facts.sql"),
    readSql("sql/ranking-projections/solve_facts_cleanup.sql"),
    readSql("sql/ranking-projections/result_rankings_single.sql"),
    readFile(new URL("scripts/mysql-schema.mjs", root), "utf8"),
    readFile(new URL("scripts/projection-groups.mjs", root), "utf8"),
    readFile(new URL("services/rankings/queries.ts", root), "utf8"),
    readFile(new URL("services/lists/result-rankings.ts", root), "utf8"),
    readFile(new URL("scripts/check-ranking-projections.mjs", root), "utf8"),
  ]);

  assert.match(stage, /CREATE TEMPORARY TABLE solve_facts_stage ENGINE = InnoDB AS/);
  assert.match(stage, /-- phase: materialize minimal solve stage/);
  assert.match(stage, /FROM result_facts facts\s+STRAIGHT_JOIN result_attempts attempt/);
  assert.match(stage, /facts\.gender/);
  assert.doesNotMatch(stage, /JOIN persons/);
  assert.doesNotMatch(stage, /competition_year|round_type_id/);
  assert.doesNotMatch(stage, /ALTER TABLE|ADD (?:PRIMARY KEY|INDEX)/);
  assert.match(single, /FROM solve_facts_stage solve/);
  assert.doesNotMatch(schema, /solve_personal_rankings\.sql/);
  assert.doesNotMatch(groups, /solve_personal_rankings\.sql/);
  assert.match(cleanup, /DROP TEMPORARY TABLE solve_facts_stage/);
  assert.match(schema, /name: "result-rankings"[\s\S]*files: \["solve_facts\.sql"[\s\S]*"solve_facts_cleanup\.sql"\]/);
  assert.doesNotMatch(schema, /name: "solve-facts"/);
  assert.match(schema, /RETIRED_PROJECTION_TABLES = \[[\s\S]*"solve_facts"/);
  assert.match(groups, /name: "result-rankings"[\s\S]*dependencies: \["result-facts"\][\s\S]*solve_facts_cleanup\.sql/);
  assert.doesNotMatch(groups, /name: "solve-facts"/);
  assert.match(single, /-- phase: materialize Single result rankings/);
  assert.match(single, /-- phase: index Single result rankings/);
  assert.equal((single.match(/ALTER TABLE result_rankings_single/g) ?? []).length, 1);
  assert.match(single, /idx_results_single_lazy_gender/);
  assert.doesNotMatch(single, /idx_solve_facts_event_(?:country|continent)_value/);
  assert.match(queries, /FROM result_rankings_single solve/);
  assert.doesNotMatch(queries, /FROM solve_facts solve/);
  assert.match(listResults, /return resultType === "average" \? "result_rankings_average" : "result_rankings_single"/);
  assert.doesNotMatch(listResults, /"solve_facts source"/);
  assert.match(preflight, /idx_results_single_lazy_gender/);
  assert.match(preflight, /RESULT_FACT_COLUMNS = \["result_id", "gender"\]/);
});

test("bounds yearly Single cohorts through indexed result facts", async () => {
  const [resultService, facts] = await Promise.all([
    readFile(new URL("services/rankings/result.ts", root), "utf8"),
    readSql("sql/ranking-projections/result_facts.sql"),
  ]);

  assert.match(resultService, /const yearSingle = resultType === "single" && year !== null/);
  assert.match(resultService, /facts\.competition_year = \?/);
  assert.match(resultService, /result_facts facts STRAIGHT_JOIN result_attempts attempt/);
  assert.match(resultService, /attempt\.value = facts\.best/);
  assert.match(facts, /idx_result_facts_year_single \(\s*competition_year, event_id/);
});

test("defers all gender result cohorts to normalized base projections", async () => {
  const [single, average, schema, groups, resultService, listResults, listWorker, featureSwitch] = await Promise.all([
    readSql("sql/ranking-projections/result_rankings_single.sql"),
    readSql("sql/ranking-projections/result_rankings_average.sql"),
    readFile(new URL("scripts/mysql-schema.mjs", root), "utf8"),
    readFile(new URL("scripts/projection-groups.mjs", root), "utf8"),
    readFile(new URL("services/rankings/result.ts", root), "utf8"),
    readFile(new URL("services/lists/result-rankings.ts", root), "utf8"),
    readFile(new URL("scripts/list-ranking-worker.mjs", root), "utf8"),
    readFile(new URL("lib/projection-feature-switch.ts", root), "utf8"),
  ]);

  for (const projection of [single, average]) {
    assert.match(projection, /gender ENUM\('m', 'f', 'o'\) NOT NULL/);
    assert.doesNotMatch(projection, /gender_set|FIND_IN_SET/);
  }
  assert.match(single, /solve\.gender/);
  assert.match(average, /result\.gender/);
  assert.match(schema, /RETIRED_PROJECTION_TABLES = \[[\s\S]*"result_gender_ranking_counts"[\s\S]*"result_gender_rankings_average"[\s\S]*"result_gender_rankings_single"/);
  assert.doesNotMatch(groups, /result_gender_rankings|result_gender_ranking_counts/);
  assert.doesNotMatch(listResults, /result_gender_rankings|gender_set/);
  assert.match(listResults, /ranking\.gender IN/);
  assert.doesNotMatch(listWorker, /result_gender_rankings|gender_set/);
  assert.match(listWorker, /ranking\.gender IN/);
  assert.doesNotMatch(featureSwitch, /result_gender_rankings|result_gender_ranking_counts/);
  assert.doesNotMatch(resultService, /result_gender_rankings_\$\{resultType\}/);
  assert.doesNotMatch(resultService, /ranking\.gender_set = \?/);
  assert.doesNotMatch(resultService, /worktree_gender_result_rankings/);
  assert.match(resultService, /source: "result_rankings_average result"/);
  assert.match(resultService, /result\.gender IN/);
  assert.match(resultService, /dataVersion,[\s\S]*eventId:[\s\S]*result:[\s\S]*region:[\s\S]*gender:[\s\S]*year:[\s\S]*windowStart/);
  assert.match(resultService, /RANKINGS_WINDOW_SIZE/);
});

test("normal rankings retain separate historical country and continent bests", async () => {
  const [single, average, listRankings, fixture, resultAttemptsMigration, personLookupMigration] = await Promise.all([
    readSql("sql/ranking-projections/ranking_entries_single_source.sql"),
    readSql("sql/ranking-projections/ranking_entries_average_source.sql"),
    readFile(new URL("services/lists/rankings.ts", root), "utf8"),
    readSql("tests/fixtures/regional-ranking-history.sql"),
    readSql("migrations/mysql/results/V8__result_attempts_lookup.sql"),
    readSql("migrations/mysql/app/V13__person_ranking_lookup.sql"),
  ]);
  const sources = `${single}\n${average}`;

  assert.match(fixture, /'CHANGE1', 'United States', '_North America', 549/);
  assert.match(fixture, /'CHANGE1', 'New Zealand', '_Oceania', 600/);
  assert.match(sources, /PARTITION BY r\.event_id, r\.person_id, COALESCE\(r\.person_country_id, ''\)/);
  assert.match(sources, /PARTITION BY r\.event_id, r\.person_id, r\.person_continent_id/);
  assert.match(sources, /WHERE historical\.country_person_position = 1/);
  assert.match(sources, /WHERE historical\.continent_person_position = 1/);
  assert.match(sources, /FROM result_facts r/);
  assert.match(sources, /LEFT JOIN countries country ON country\.id = historical\.country_id/);
  assert.match(sources, /FROM ranks_single ranking/);
  assert.match(sources, /FROM ranks_average ranking/);
  assert.match(sources, /UNION ALL/);
  assert.match(sources, /regional_record = 'NR'/);
  assert.match(listRankings, /let rankingColumn = "world_rank";[\s\S]*input\.region\.scope === "continent"/);
  assert.match(listRankings, /`ranking\.\$\{rankingColumn\} > 0`/);
  assert.match(resultAttemptsMigration, /ALTER TABLE result_attempts/);
  assert.match(resultAttemptsMigration, /ADD INDEX idx_result_attempts_result/);
  assert.doesNotMatch(resultAttemptsMigration, /information_schema\.tables/);
  assert.match(personLookupMigration, /ALTER TABLE IF EXISTS persons/);
  assert.match(personLookupMigration, /ADD INDEX IF NOT EXISTS idx_persons_wca_sub \(wca_id, sub_id\)/);
});
