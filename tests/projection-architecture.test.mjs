import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("logs projection build step starts, completions, failures, and elapsed time", async () => {
  const { runTimedBuildStep } = await import(new URL("scripts/mysql-schema.mjs", root));
  const messages = [];
  const originalWrite = process.stdout.write;
  process.stdout.write = (chunk) => {
    messages.push(String(chunk));
    return true;
  };
  try {
    const { result, durationMs } = await runTimedBuildStep("table example_staging", async () => "built");
    assert.equal(result, "built");
    assert.ok(durationMs >= 0);
    await assert.rejects(
      runTimedBuildStep("table broken_staging", async () => {
        throw new Error("expected failure");
      }),
      /expected failure/,
    );
  } finally {
    process.stdout.write = originalWrite;
  }

  const output = messages.join("");
  assert.match(output, /\[projection-build\] Starting table example_staging/);
  assert.match(output, /\[projection-build\] Finished table example_staging in \d+ms/);
  assert.match(output, /\[projection-build\] Starting table broken_staging/);
  assert.match(output, /\[projection-build\] Failed table broken_staging after \d+ms/);
});

test("formats table progress against the complete build workload", async () => {
  const { createTableProgress, countProjectionTables, PROJECTION_REGISTRY } = await import(new URL("scripts/mysql-schema.mjs", root));
  const progress = createTableProgress(17);

  assert.equal(progress.start("first_table"), "[1/17]");
  assert.equal(progress.start("second_table"), "[2/17]");
  assert.ok(await countProjectionTables(PROJECTION_REGISTRY) >= PROJECTION_REGISTRY.length);
});

test("keeps future grains registered while activating person metrics and competition bests", async () => {
  const [schema, groups, facts, people, resultSingles, resultAverages, metricValues, metricScores, sumScores, podiums, competitionEvents, competitions, cities, counts, importer] =
    await Promise.all([
      readFile(new URL("scripts/mysql-schema.mjs", root), "utf8"),
      readFile(new URL("scripts/projection-groups.mjs", root), "utf8"),
      readFile(new URL("sql/ranking-projections/result_facts.sql", root), "utf8"),
      readFile(new URL("sql/ranking-projections/person_event_rankings.sql", root), "utf8"),
      readFile(new URL("sql/ranking-projections/result_rankings_single.sql", root), "utf8"),
      readFile(new URL("sql/ranking-projections/result_rankings_average.sql", root), "utf8"),
      readFile(new URL("sql/ranking-projections/person_metric_values.sql", root), "utf8"),
      readFile(new URL("sql/ranking-projections/person_metric_scores.sql", root), "utf8"),
      readFile(new URL("sql/ranking-projections/person_sum_of_ranks_scores.sql", root), "utf8"),
      readFile(new URL("sql/ranking-projections/competition_podium_members.sql", root), "utf8"),
      readFile(new URL("sql/ranking-projections/competition_event_stats.sql", root), "utf8"),
      readFile(new URL("sql/ranking-projections/competition_stats.sql", root), "utf8"),
      readFile(new URL("sql/ranking-projections/city_event_stats.sql", root), "utf8"),
      readFile(new URL("sql/ranking-projections/entity_ranking_counts.sql", root), "utf8"),
      readFile(new URL("scripts/sync-wca-export.mjs", root), "utf8"),
    ]);
  const results = `${resultSingles}\n${resultAverages}`;

  assert.match(schema, /PROJECTION_REGISTRY/);
  assert.match(schema, /dependencies/);
  assert.match(schema, /projectionBuildPlan/);
  assert.match(schema, /WCA_PROJECTION_BUILD_CONCURRENCY/);
  assert.match(schema, /buildRegisteredProjectionsConcurrently/);
  assert.match(schema, /runDependencyAwareTasks/);
  assert.match(schema, /COMPATIBILITY_PROJECTION_TASKS/);
  assert.match(schema, /compatibility-ranking-counts[\s\S]*compatibility-ranking-entries-single/);
  assert.match(schema, /compatibility-ranking-counts[\s\S]*compatibility-ranking-entries-average/);
  assert.match(schema, /compatibility-result-counts[\s\S]*compatibility-result-entries-single/);
  assert.match(schema, /process\.env\.WCA_PROJECTION_BUILD_CONCURRENCY \?\? 2/);
  assert.match(schema, /createConnection/);
  assert.match(schema, /build:/);
  assert.match(schema, /validate:/);
  assert.match(schema, /durationMs/);
  assert.match(schema, /rowCounts/);
  assert.match(schema, /statement\.match\(\/\^\\s\*-- phase:/);
  assert.match(schema, /DEFAULT_PROJECTION_NAMES/);
  assert.match(schema, /\.\.\.SEMANTIC_PROJECTION_TABLES, \.\.\.COMPATIBILITY_PROJECTION_TABLES/);
  assert.match(schema, /name: "sum-of-ranks"[\s\S]*dependencies: \[\]/);
  assert.match(groups, /name: "compatibility"/);
  assert.match(groups, /name: "result-rankings"[\s\S]*dependencies: \["result-facts"\]/);
  assert.match(groups, /name: "city-rankings"[\s\S]*dependencies: \["result-facts", "competition-rankings"\]/);
  assert.match(groups, /name: "sum-of-ranks"[\s\S]*projectionNames: \["sum-of-ranks"\]/);
  assert.match(schema, /enabledByDefault: true/);
  assert.match(importer, /promoteProjectionTables/);

  assert.match(facts, /CREATE TABLE result_facts AS/);
  assert.match(facts, /FROM results r/);
  assert.doesNotMatch(facts, /AS value1/);
  assert.match(facts, /format\.expected_solve_count/);
  assert.match(facts, /idx_result_facts_single_ranking_cover/);
  assert.match(facts, /idx_result_facts_average_ranking_cover/);
  assert.match(people, /CREATE TABLE person_event_rankings AS/);
  assert.match(people, /world_position/);
  assert.match(results, /CREATE TABLE result_rankings_single AS/);
  assert.match(results, /CREATE TABLE result_rankings_average AS/);
  assert.match(results, /FROM result_facts result/);
  assert.doesNotMatch(results, /LEFT JOIN countries/);
  assert.doesNotMatch(results, /competition_start_date/);
  assert.match(results, /ROW_NUMBER\(\)/);
  assert.match(results, /RANK\(\) OVER/);
  assert.doesNotMatch(results, /DENSE_RANK\(\) OVER/);
  assert.match(results, /world_position/);
  assert.match(results, /continent_position/);
  assert.match(results, /country_position/);
  assert.match(metricValues, /kinch_value/);
  assert.match(metricScores, /CREATE TABLE person_metric_counts AS/);
  assert.match(sumScores, /CREATE TEMPORARY TABLE sum_of_ranks_historical_bests/);
  assert.match(sumScores, /result\.person_country_id/);
  assert.match(sumScores, /MIN\(CASE WHEN result\.best > 0/);
  assert.match(sumScores, /MIN\(CASE WHEN result\.average > 0/);
  assert.match(sumScores, /FROM ranks_single rank/);
  assert.match(sumScores, /FROM ranks_average rank/);
  assert.match(sumScores, /CREATE TEMPORARY TABLE sum_of_ranks_event_values/);
  assert.match(sumScores, /cohort_id SMALLINT UNSIGNED/);
  assert.match(sumScores, /-- phase: aggregate historical Single and Average bests/);
  assert.match(sumScores, /-- phase: index person scores/);
  assert.doesNotMatch(sumScores, /CREATE TABLE person_sum_of_ranks_event_values/);
  assert.match(sumScores, /CREATE TABLE person_sum_of_ranks_scores \(/);
  assert.match(sumScores, /RANK\(\) OVER/);
  assert.match(sumScores, /ROW_NUMBER\(\) OVER/);
  assert.match(sumScores, /COUNT\(\*\) \+ 1/);
  assert.match(sumScores, /MIN\(result_value\)/);
  assert.match(sumScores, /kinch_score/);
  assert.match(sumScores, /kinch_position/);
  assert.match(sumScores, /kinch_continent_score/);
  assert.match(sumScores, /kinch_continent_position/);
  assert.match(sumScores, /idx_person_kinch_page/);
  assert.match(sumScores, /idx_person_kinch_continent_page/);
  assert.doesNotMatch(sumScores, /kinch_coverage = 16/);
  assert.match(sumScores, /fallback_score AS SIGNED\)[\s\S]*person\.score_adjustment AS score/);
  assert.match(sumScores, /ENGINE = MEMORY/);
  assert.doesNotMatch(sumScores, /CROSS JOIN/);
  assert.doesNotMatch(sumScores, /coverage = required_coverage/);
  assert.match(podiums, /podium_position/);
  assert.match(podiums, /round_type\.final = 1/);
  assert.match(podiums, /result\.pos BETWEEN 1 AND 3/);
  assert.match(podiums, /result\.event_id IN \('333bf', '444bf', '555bf'\)/);
  assert.match(podiums, /result\.event_id NOT IN \('333bf', '444bf', '555bf', '333mbf'\)/);
  assert.match(competitionEvents, /fastest_single_result_id/);
  assert.match(competitionEvents, /fastest_single_rank/);
  assert.match(competitionEvents, /fastest_single_position/);
  assert.match(competitionEvents, /fastest_average_position/);
  assert.match(competitionEvents, /CASE WHEN result\.best > 0 THEN/);
  assert.match(competitionEvents, /FROM results result/);
  assert.match(competitionEvents, /idx_competition_event_fastest_single/);
  assert.match(competitionEvents, /AVG\(DISTINCT result_value\)/);
  assert.match(competitionEvents, /HAVING COUNT\(DISTINCT person_id\) >= 3/);
  assert.match(competitionEvents, /podium_rank/);
  assert.match(competitionEvents, /podium_position/);
  assert.match(competitionEvents, /idx_competition_event_podium/);
  assert.match(competitions, /northernmost_rank/);
  assert.match(competitions, /competitor_count_rank/);
  assert.match(competitions, /competitor_count_position/);
  assert.match(competitions, /COUNT\(DISTINCT person_id\) AS competitor_count/);
  assert.match(competitions, /northernmost_position/);
  assert.match(competitions, /southernmost_rank/);
  assert.match(competitions, /southernmost_position/);
  assert.match(competitions, /NOT \(latitude = 0 AND longitude = 0\)/);
  assert.match(competitions, /FROM competitions comp/);
  assert.match(competitions, /idx_competition_stats_north/);
  assert.match(competitions, /idx_competition_stats_competitor_count/);
  assert.match(competitions, /idx_competition_stats_south/);
  assert.match(cities, /fastest_average_result_id/);
  assert.match(cities, /fastest_average_rank/);
  assert.match(counts, /CREATE TABLE entity_ranking_counts AS/);
  assert.match(counts, /FROM competition_event_stats WHERE podium_score IS NOT NULL/);
  assert.doesNotMatch(counts, /podium_(?:single|average)_score/);
  assert.match(schema, /entity-ranking-counts/);
  assert.match(schema, /name: "competition-event-stats"[\s\S]*enabledByDefault: true/);
});

test("does not introduce entries or sub-rank vocabulary in new schemas", async () => {
  const files = [
    "person_event_rankings.sql",
    "result_rankings_single.sql",
    "result_rankings_average.sql",
    "person_metric_values.sql",
    "person_metric_scores.sql",
    "competition_podium_members.sql",
    "competition_event_stats.sql",
    "competition_stats.sql",
    "city_event_stats.sql",
    "entity_ranking_counts.sql",
    "person_sum_of_ranks_scores.sql",
  ];
  const sources = await Promise.all(files.map((file) =>
    readFile(new URL(`sql/ranking-projections/${file}`, root), "utf8")));
  for (const source of sources) {
    assert.doesNotMatch(source, /_entries\b/);
    assert.doesNotMatch(source, /sub_rank/);
  }
});

test("exposes bounded resource APIs without projection name scans", async () => {
  const [shared, people, results, rankings, entities, search, rankingQueries] = await Promise.all([
    readFile(new URL("lib/api/projection.ts", root), "utf8"),
    readFile(new URL("services/rankings/person.ts", root), "utf8"),
    readFile(new URL("services/rankings/result.ts", root), "utf8"),
    readFile(new URL("services/rankings/service.ts", root), "utf8"),
    readFile(new URL("services/rankings/entity.ts", root), "utf8"),
    readFile(new URL("services/people/database.ts", root), "utf8"),
    readFile(new URL("services/rankings/queries.ts", root), "utf8"),
  ]);

  const rankingSources = `${rankings}\n${rankingQueries}`;
  const entitySources = `${entities}\n${rankingQueries}`;
  const personSources = `${people}\n${rankingQueries}`;

  assert.match(shared, /MAX_PAGE_SIZE = 100/);
  assert.match(shared, /ApiInputError/);
  assert.match(rankingQueries, /WITH page AS/);
  assert.match(rankingQueries, /FROM person_event_rankings ranking/);
  assert.match(rankingQueries, /FROM \$\{table\} ranking/);
  assert.match(results, /positionColumn/);
  assert.match(results, /ranking\.\$\{positionColumn\} > \?/);
  assert.match(results, /entryKey: `result:/);
  assert.match(rankingSources, /FROM person_sum_of_ranks_scores score/);
  assert.match(rankingSources, /input\.eventId === "SOR"/);
  assert.match(rankingSources, /input\.eventId === "sor-kinch"/);
  assert.match(rankingSources, /score\.\$\{input\.positionColumn\} AS sub_rank/);
  assert.match(rankingSources, /\/ 17\.0/);
  assert.match(rankingSources, /kinch_continent_score/);
  assert.match(rankingSources, /kinchScoreColumn/);
  assert.doesNotMatch(rankingSources, /kinch_score \/ 16\.0/);
  assert.match(rankingSources, /queryFilteredPersonMetric/);
  assert.match(rankingSources, /DENSE_RANK\(\) OVER/);
  assert.doesNotMatch(rankingSources, /FROM person_sum_of_ranks_scores\n\s+LEFT JOIN persons/);
  assert.match(entitySources, /FROM competition_event_stats stats/);
  assert.match(entitySources, /stats\.\$\{positionColumn\} > \?/);
  assert.match(entitySources, /INNER JOIN results result ON result\.id = page\.result_id/);
  assert.match(entitySources, /FROM city_event_stats stats/);
  assert.match(search, /fetchPersonSearchRowsFromDatabase/);

  for (const source of [personSources, `${results}\n${rankingQueries}`, rankingSources]) {
    assert.doesNotMatch(source, /FROM results\b/);
    assert.doesNotMatch(source, /person_name LIKE/);
  }
  assert.doesNotMatch(entitySources, /person_name LIKE/);
  assert.match(entities, /Number\(last\.position\) \+ 1/);
});

test("only exposes APIs backed by active projections", async () => {
  const activeRoutes = [
    "app/api/people/search/route.ts",
    "app/api/rankings/route.ts",
    "app/api/rankings/results/route.ts",
    "app/api/rankings/competitions/route.ts",
  ];
  const inactiveRoutes = [
    "app/api/rankings/people/route.ts",
    "app/api/rankings/podiums/route.ts",
    "app/api/rankings/cities/route.ts",
    "app/api/rankings/metrics/route.ts",
  ];
  for (const route of activeRoutes) {
    await readFile(new URL(route, root), "utf8");
  }
  for (const route of inactiveRoutes) {
    await assert.rejects(readFile(new URL(route, root), "utf8"));
  }
});

test("backfills only the active competition-event projection", async () => {
  const backfill = await readFile(
    new URL("scripts/backfill-competition-event-stats.mjs", root),
    "utf8",
  );
  assert.match(backfill, /projectionNames = \["competition-event-stats"\]/);
  assert.match(backfill, /projectionSuffix: "_staging"/);
  assert.match(backfill, /promoteRegisteredProjections/);
  assert.doesNotMatch(backfill, /DROP DATABASE|TRUNCATE TABLE/);
});

test("person search resolves IDs before querying projections", async () => {
  const [searchQueries, rankings, results, compatibilityResults] = await Promise.all([
    readFile(new URL("services/people/queries.ts", root), "utf8"),
    readFile(new URL("services/rankings/service.ts", root), "utf8"),
    readFile(new URL("sql/ranking-projections/result_rankings_single.sql", root), "utf8"),
    readFile(new URL("sql/ranking-projections/result_entries_single_indexes.sql", root), "utf8"),
  ]);

  assert.match(searchQueries, /FROM persons/);
  assert.match(searchQueries, /wca_id = \?/);
  assert.match(searchQueries, /name LIKE \?/);
  assert.match(rankings, /searchPersonIds/);
  assert.match(rankings, /person_id IN/);
  assert.doesNotMatch(rankings, /person_name \$\{operator\}/);
  assert.match(results, /person_id, event_id, world_position, result_id/);
  assert.match(compatibilityResults, /PRIMARY KEY \(result_id\)/);
  assert.doesNotMatch(compatibilityResults, /ADD INDEX/);
});

test("builds Sum of Ranks as one published score projection", async () => {
  const [schema, backfill, publisher] = await Promise.all([
    readFile(new URL("scripts/mysql-schema.mjs", root), "utf8"),
    readFile(new URL("scripts/backfill-sum-of-ranks.mjs", root), "utf8"),
    readFile(new URL("scripts/publish-projection-transfer.mjs", root), "utf8"),
  ]);
  assert.match(schema, /files: \["person_sum_of_ranks_scores\.sql"\]/);
  assert.match(schema, /tables: \["person_sum_of_ranks_scores"\]/);
  assert.match(schema, /RETIRED_PROJECTION_TABLES/);
  assert.match(schema, /for \(const retired of RETIRED_PROJECTION_TABLES\)/);
  assert.match(backfill, /projectionNames = \["sum-of-ranks"\]/);
  assert.match(publisher, /promoteProjectionTables\(connection, \{ tables: transferTables \}\)/);
});
