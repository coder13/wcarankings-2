import { DEFAULT_PROJECTION_NAMES } from "../../projection-catalog/tables.ts";
import {
  dropManagedObject,
  ensureIndexes,
  INDEXES,
} from "../shared/database.ts";
import type { ProjectionConnection } from "../shared/database-types.ts";
import { elapsedMs, createTableProgress, writeBuildLog } from "./progress.ts";
import type { TableProgress } from "./progress-types.ts";
import {
  CORE_RANKING_TABLE_TASK_COUNT,
  createRankingSource,
  rankingTableTasks,
} from "./ranking-tables.ts";
import { runDependencyAwareTasks } from "./scheduler.ts";
import {
  projectionDependencyClosure,
  projectionNamesForRefresh,
} from "./plan.ts";
import { countProjectionTables, PROJECTION_REGISTRY } from "./registry.ts";
import type {
  ProjectionBuildTiming,
  ProjectionRegistryEntry,
  RefreshMysqlSchemaOptions,
} from "./types.ts";

function orderedProjections(
  selectedNames: readonly string[] = DEFAULT_PROJECTION_NAMES,
  satisfiedNames: readonly string[] = [],
): ProjectionRegistryEntry[] {
  const byName = new Map(
    PROJECTION_REGISTRY.map((projection) => [projection.name, projection]),
  );
  const satisfied = new Set(satisfiedNames);
  return projectionDependencyClosure(selectedNames)
    .filter((projection) => !satisfied.has(projection.name))
    .map((definition) => {
      const projection = byName.get(definition.name);
      if (!projection) {
        throw new Error(`Projection ${definition.name} has no build runner`);
      }
      return projection;
    });
}

async function buildProjection(
  connection: ProjectionConnection,
  projection: ProjectionRegistryEntry,
  projectionSuffix: string,
  tableProgress: TableProgress,
): Promise<ProjectionBuildTiming> {
  const startedAt = performance.now();
  writeBuildLog(`Starting projection ${projection.name}…`);
  try {
    for (const table of projection.tables) {
      await dropManagedObject(connection, `${table}${projectionSuffix}`);
    }
    const phases = await projection.build(
      connection,
      projectionSuffix,
      tableProgress,
    );
    const rowCounts = await projection.validate(connection, projectionSuffix);
    const durationMs = elapsedMs(startedAt);
    writeBuildLog(
      `Finished projection ${projection.name} in ${durationMs}ms (${JSON.stringify(rowCounts)}).`,
    );
    return { name: projection.name, durationMs, rowCounts, phases };
  } catch (error) {
    writeBuildLog(
      `Failed projection ${projection.name} after ${elapsedMs(startedAt)}ms.`,
    );
    throw error;
  }
}

export function projectionConcurrency(value?: number | string): number {
  const parsed = Number(
    value ?? process.env.WCA_PROJECTION_BUILD_CONCURRENCY ?? 2,
  );
  return Number.isFinite(parsed) && parsed > 1 ? Math.floor(parsed) : 1;
}

export async function refreshMysqlSchema(
  connection: ProjectionConnection,
  options: RefreshMysqlSchemaOptions = {},
): Promise<void> {
  const {
    projectionSuffix = "",
    projectionNames: selectedNames,
    satisfiedProjectionNames = [],
    includeRankingTables = true,
    createConnection,
    concurrency,
  } = options;
  const entriesTables = {
    single: `ranking_entries_single${projectionSuffix}`,
    average: `ranking_entries_average${projectionSuffix}`,
  };
  const countsTable = `ranking_counts${projectionSuffix}`;
  const bestSingle = `wca_best_single${projectionSuffix}`;
  const bestAverage = `wca_best_average${projectionSuffix}`;
  const resultFacts = `result_facts${projectionSuffix}`;
  const entriesSources = {
    single: `ranking_entries_single_source${projectionSuffix}`,
    average: `ranking_entries_average_source${projectionSuffix}`,
  };

  await ensureIndexes(connection, INDEXES);

  if (includeRankingTables) {
    const managedNames = [
      countsTable,
      entriesTables.single,
      entriesTables.average,
      entriesSources.single,
      entriesSources.average,
      bestSingle,
      bestAverage,
    ];
    for (const name of managedNames) {
      await dropManagedObject(connection, name);
    }

    const names = {
      bestSingle,
      bestAverage,
      entriesSources,
      resultFacts,
      projectionSuffix,
    };
    for (const file of [
      "core/ranking-tables/wca_best_single.sql",
      "core/ranking-tables/wca_best_average.sql",
    ]) {
      await createRankingSource(connection, file, names);
    }
  }

  const semanticProjections = orderedProjections(
    projectionNamesForRefresh(selectedNames),
    satisfiedProjectionNames,
  );
  const tableProgress = createTableProgress(
    (includeRankingTables ? CORE_RANKING_TABLE_TASK_COUNT : 0) +
      (await countProjectionTables(semanticProjections)),
  );
  const semanticTasks = semanticProjections.map((projection) => ({
    name: `projection:${projection.name}`,
    dependencies: projection.dependencies.map((dependency) =>
      dependency === "raw-wca" ? dependency : `projection:${dependency}`,
    ),
    estimatedDurationMs: projection.estimatedDurationMs,
    run: (worker: ProjectionConnection) =>
      buildProjection(worker, projection, projectionSuffix, tableProgress),
  }));
  const coreRankingTasks = includeRankingTables
    ? rankingTableTasks({
        entriesTables,
        entriesSources,
        countsTable,
        bestSingle,
        bestAverage,
        resultFacts,
        tableProgress,
      })
    : [];
  await runDependencyAwareTasks([...coreRankingTasks, ...semanticTasks], {
    connection,
    createConnection,
    concurrency: projectionConcurrency(concurrency),
    satisfiedDependencies: [
      "raw-wca",
      ...satisfiedProjectionNames.map((name) => `projection:${name}`),
    ],
  });
}
