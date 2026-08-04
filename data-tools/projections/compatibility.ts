// @ts-nocheck
import { runTimedBuildStep } from "./progress.ts";
import { executeTableStatements, projectionSql, statements } from "./sql.ts";

export const COMPATIBILITY_PROJECTION_TASKS = [
  {
    name: "compatibility-ranking-entries-single-source",
    dependencies: ["projection:result-facts"],
    estimatedDurationMs: 0,
  },
  {
    name: "compatibility-ranking-entries-average-source",
    dependencies: ["projection:result-facts"],
    estimatedDurationMs: 0,
  },
  {
    name: "compatibility-result-entries-single-source",
    dependencies: ["raw-wca"],
    estimatedDurationMs: 0,
  },
  {
    name: "compatibility-ranking-entries-single",
    dependencies: ["compatibility-ranking-entries-single-source"],
    table: "ranking_entries_single",
    estimatedDurationMs: 120_000,
  },
  {
    name: "compatibility-ranking-entries-average",
    dependencies: ["compatibility-ranking-entries-average-source"],
    table: "ranking_entries_average",
    estimatedDurationMs: 120_000,
  },
  {
    name: "compatibility-result-entries-single",
    dependencies: ["compatibility-result-entries-single-source"],
    table: "result_entries_single",
    estimatedDurationMs: 150_000,
  },
  {
    name: "compatibility-ranking-counts",
    dependencies: [
      "compatibility-ranking-entries-single",
      "compatibility-ranking-entries-average",
    ],
    table: "ranking_counts",
    estimatedDurationMs: 15_000,
  },
  {
    name: "compatibility-result-counts",
    dependencies: ["compatibility-result-entries-single"],
    table: "result_counts",
    estimatedDurationMs: 15_000,
  },
];

// Source-view tasks coordinate dependencies but do not create a published
// table. Keep progress tied strictly to the table work operators can observe.
export const COMPATIBILITY_TABLE_TASK_COUNT =
  COMPATIBILITY_PROJECTION_TASKS.filter(({ table }) => table).length;

async function buildCompatibilityTable(
  connection,
  table,
  source,
  indexFile,
  tableProgress,
) {
  await runTimedBuildStep(
    `table ${table}`,
    async () => {
      await connection.query(
        `CREATE TABLE \`${table}\` AS SELECT * FROM \`${source}\``,
      );
      for (const statement of statements(await projectionSql(indexFile))) {
        await connection.query(
          statement.replace(
            /^ALTER TABLE (?:ranking_entries|result_entries_single)\b/,
            `ALTER TABLE \`${table}\``,
          ),
        );
      }
    },
    { tableProgress, tableName: table },
  );
}

export function renameCompatibilitySql(
  sql,
  { bestSingle, bestAverage, entriesSources, resultEntriesSource, resultFacts },
) {
  return sql
    .replaceAll("wca_best_single", bestSingle)
    .replaceAll("wca_best_average", bestAverage)
    .replaceAll("ranking_entries_single_source", entriesSources.single)
    .replaceAll("ranking_entries_average_source", entriesSources.average)
    .replaceAll("result_entries_single_source", resultEntriesSource)
    .replaceAll("result_facts", resultFacts);
}

async function createCompatibilitySource(connection, file, names) {
  await connection.query(
    renameCompatibilitySql(await projectionSql(file), names),
  );
}

export function compatibilityProjectionTasks({
  entriesTables,
  entriesSources,
  countsTable,
  resultEntriesTable,
  resultCountsTable,
  resultEntriesSource,
  bestSingle,
  bestAverage,
  resultFacts,
  tableProgress,
}) {
  const names = {
    bestSingle,
    bestAverage,
    entriesSources,
    resultEntriesSource,
    resultFacts,
  };
  const runners = {
    "compatibility-ranking-entries-single-source": (connection) =>
      createCompatibilitySource(
        connection,
        "core/compatibility/ranking_entries_single_source.sql",
        names,
      ),
    "compatibility-ranking-entries-average-source": (connection) =>
      createCompatibilitySource(
        connection,
        "core/compatibility/ranking_entries_average_source.sql",
        names,
      ),
    "compatibility-result-entries-single-source": (connection) =>
      createCompatibilitySource(
        connection,
        "core/compatibility/result_entries_single_source.sql",
        names,
      ),
    "compatibility-ranking-entries-single": (connection) =>
      buildCompatibilityTable(
        connection,
        entriesTables.single,
        entriesSources.single,
        "core/compatibility/ranking_entries_indexes.sql",
        tableProgress,
      ),
    "compatibility-ranking-entries-average": (connection) =>
      buildCompatibilityTable(
        connection,
        entriesTables.average,
        entriesSources.average,
        "core/compatibility/ranking_entries_indexes.sql",
        tableProgress,
      ),
    "compatibility-result-entries-single": (connection) =>
      buildCompatibilityTable(
        connection,
        resultEntriesTable,
        resultEntriesSource,
        "core/compatibility/result_entries_single_indexes.sql",
        tableProgress,
      ),
    "compatibility-ranking-counts": async (connection) =>
      executeTableStatements(
        connection,
        (await projectionSql("core/compatibility/ranking_counts.sql"))
          .replaceAll("ranking_entries_single", entriesTables.single)
          .replaceAll("ranking_entries_average", entriesTables.average)
          .replaceAll("ranking_counts", countsTable),
        [],
        { tableProgress },
      ),
    "compatibility-result-counts": async (connection) =>
      executeTableStatements(
        connection,
        (await projectionSql("core/compatibility/result_counts.sql"))
          .replaceAll("result_entries_single", resultEntriesTable)
          .replaceAll("result_counts", resultCountsTable),
        [],
        { tableProgress },
      ),
  };
  return COMPATIBILITY_PROJECTION_TASKS.map((task) => ({
    ...task,
    run: runners[task.name],
  }));
}
