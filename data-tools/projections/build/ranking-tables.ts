import { runTimedBuildStep } from "./progress.ts";
import { projectionSql, statements } from "./sql.ts";
import type { ProjectionConnection } from "../shared/database-types.ts";
import type { TableProgress } from "./progress-types.ts";
import type {
  RankingSourceNames,
  RankingTableTask,
  RankingTableTaskDefinition,
  RankingTableTaskName,
  RankingTableTaskOptions,
  RankingTableTaskRunner,
} from "./ranking-types.ts";

export const CORE_RANKING_TABLE_TASKS: readonly RankingTableTaskDefinition[] = [
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
];

// Source-view tasks coordinate dependencies but do not create a published
// table. Keep progress tied strictly to the table work operators can observe.
export const CORE_RANKING_TABLE_TASK_COUNT = CORE_RANKING_TABLE_TASKS.filter(
  ({ table }) => table,
).length;

async function buildRankingEntriesTable(
  connection: ProjectionConnection,
  table: string,
  source: string,
  indexFile: string,
  tableProgress: TableProgress,
): Promise<void> {
  await runTimedBuildStep(
    `table ${table}`,
    async () => {
      await connection.query(
        `CREATE TABLE \`${table}\` AS SELECT * FROM \`${source}\``,
      );
      for (const statement of statements(await projectionSql(indexFile))) {
        await connection.query(
          statement.replace(
            /^ALTER TABLE ranking_entries\b/,
            `ALTER TABLE \`${table}\``,
          ),
        );
      }
    },
    { tableProgress, tableName: table },
  );
}

export function renameRankingTableSql(
  sql: string,
  names: RankingSourceNames,
): string {
  const { bestSingle, bestAverage, entriesSources, resultFacts } = names;
  return sql
    .replaceAll("wca_best_single", bestSingle)
    .replaceAll("wca_best_average", bestAverage)
    .replaceAll("ranking_entries_single_source", entriesSources.single)
    .replaceAll("ranking_entries_average_source", entriesSources.average)
    .replaceAll("result_facts", resultFacts);
}

export async function createRankingSource(
  connection: ProjectionConnection,
  file: string,
  names: RankingSourceNames,
): Promise<void> {
  await connection.query(
    renameRankingTableSql(await projectionSql(file), names),
  );
}

export function rankingTableTasks(
  options: RankingTableTaskOptions,
): RankingTableTask[] {
  const {
    entriesTables,
    entriesSources,
    bestSingle,
    bestAverage,
    resultFacts,
    tableProgress,
  } = options;
  const names = {
    bestSingle,
    bestAverage,
    entriesSources,
    resultFacts,
  };
  const runners: Record<RankingTableTaskName, RankingTableTaskRunner> = {
    "ranking-tables-entries-single-source": (
      connection: ProjectionConnection,
    ) =>
      createRankingSource(
        connection,
        "core/ranking-tables/ranking_entries_single_source.sql",
        names,
      ),
    "ranking-tables-entries-average-source": (
      connection: ProjectionConnection,
    ) =>
      createRankingSource(
        connection,
        "core/ranking-tables/ranking_entries_average_source.sql",
        names,
      ),
    "ranking-tables-entries-single": (connection: ProjectionConnection) =>
      buildRankingEntriesTable(
        connection,
        entriesTables.single,
        entriesSources.single,
        "core/ranking-tables/ranking_entries_indexes.sql",
        tableProgress,
      ),
    "ranking-tables-entries-average": (connection: ProjectionConnection) =>
      buildRankingEntriesTable(
        connection,
        entriesTables.average,
        entriesSources.average,
        "core/ranking-tables/ranking_entries_indexes.sql",
        tableProgress,
      ),
  };
  return CORE_RANKING_TABLE_TASKS.map((task) => ({
    ...task,
    run: runners[task.name],
  }));
}
