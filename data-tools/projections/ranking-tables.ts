import { runTimedBuildStep } from "./progress.ts";
import { executeTableStatements, projectionSql, statements } from "./sql.ts";

export const CORE_RANKING_TABLE_TASKS = [
  {
    name: "ranking-tables-entries-single-source",
    dependencies: ["projection:result-facts"],
    estimatedDurationMs: 0,
  },
  {
    name: "ranking-tables-entries-average-source",
    dependencies: ["projection:result-facts"],
    estimatedDurationMs: 0,
  },
  {
    name: "ranking-tables-result-entries-single-source",
    dependencies: ["raw-wca"],
    estimatedDurationMs: 0,
  },
  {
    name: "ranking-tables-entries-single",
    dependencies: ["ranking-tables-entries-single-source"],
    table: "ranking_entries_single",
    estimatedDurationMs: 120_000,
  },
  {
    name: "ranking-tables-entries-average",
    dependencies: ["ranking-tables-entries-average-source"],
    table: "ranking_entries_average",
    estimatedDurationMs: 120_000,
  },
  {
    name: "ranking-tables-result-entries-single",
    dependencies: ["ranking-tables-result-entries-single-source"],
    table: "result_entries_single",
    estimatedDurationMs: 150_000,
  },
  {
    name: "ranking-tables-counts",
    dependencies: [
      "ranking-tables-entries-single",
      "ranking-tables-entries-average",
    ],
    table: "ranking_counts",
    estimatedDurationMs: 15_000,
  },
  {
    name: "ranking-tables-result-counts",
    dependencies: ["ranking-tables-result-entries-single"],
    table: "result_counts",
    estimatedDurationMs: 15_000,
  },
];

// Source-view tasks coordinate dependencies but do not create a published
// table. Keep progress tied strictly to the table work operators can observe.
export const CORE_RANKING_TABLE_TASK_COUNT = CORE_RANKING_TABLE_TASKS.filter(
  ({ table }) => table,
).length;

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

export function renameRankingTableSql(
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

export async function createRankingTableSource(connection, file, names) {
  await connection.query(
    renameRankingTableSql(await projectionSql(file), names),
  );
}

export function rankingTableTasks({
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
    "ranking-tables-entries-single-source": (connection) =>
      createRankingTableSource(
        connection,
        "core/ranking-tables/ranking_entries_single_source.sql",
        names,
      ),
    "ranking-tables-entries-average-source": (connection) =>
      createRankingTableSource(
        connection,
        "core/ranking-tables/ranking_entries_average_source.sql",
        names,
      ),
    "ranking-tables-result-entries-single-source": (connection) =>
      createRankingTableSource(
        connection,
        "core/ranking-tables/result_entries_single_source.sql",
        names,
      ),
    "ranking-tables-entries-single": (connection) =>
      buildCompatibilityTable(
        connection,
        entriesTables.single,
        entriesSources.single,
        "core/ranking-tables/ranking_entries_indexes.sql",
        tableProgress,
      ),
    "ranking-tables-entries-average": (connection) =>
      buildCompatibilityTable(
        connection,
        entriesTables.average,
        entriesSources.average,
        "core/ranking-tables/ranking_entries_indexes.sql",
        tableProgress,
      ),
    "ranking-tables-result-entries-single": (connection) =>
      buildCompatibilityTable(
        connection,
        resultEntriesTable,
        resultEntriesSource,
        "core/ranking-tables/result_entries_single_indexes.sql",
        tableProgress,
      ),
    "ranking-tables-counts": async (connection) =>
      executeTableStatements(
        connection,
        (await projectionSql("core/ranking-tables/ranking_counts.sql"))
          .replaceAll("ranking_entries_single", entriesTables.single)
          .replaceAll("ranking_entries_average", entriesTables.average)
          .replaceAll("ranking_counts", countsTable),
        [],
        { tableProgress },
      ),
    "ranking-tables-result-counts": async (connection) =>
      executeTableStatements(
        connection,
        (await projectionSql("core/ranking-tables/result_counts.sql"))
          .replaceAll("result_entries_single", resultEntriesTable)
          .replaceAll("result_counts", resultCountsTable),
        [],
        { tableProgress },
      ),
  };
  return CORE_RANKING_TABLE_TASKS.map((task) => ({
    ...task,
    run: runners[task.name],
  }));
}
