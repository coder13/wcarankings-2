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
import {
  createProjectionTaskPlan,
  projectionDependencyClosure,
  projectionNamesForRefresh,
} from "./plan.ts";
import { countProjectionTables, PROJECTION_REGISTRY } from "./registry.ts";
import type {
  BuildProjectionTablesOptions,
  ProjectionBuildTiming,
  ProjectionRegistryEntry,
  ProjectionTask,
  ProjectionTaskExecutionOptions,
  ProjectionTaskExecutionResult,
  ProjectionTaskOutcome,
  ProjectionTaskPlan,
  RunningProjectionTask,
} from "./types.ts";

const LONG_TASK_THRESHOLD_MS = 60_000;

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

export async function executeProjectionTaskPlan(
  plan: ProjectionTaskPlan,
  options: ProjectionTaskExecutionOptions,
): Promise<ProjectionTaskExecutionResult[]> {
  const { tasks, satisfiedTaskNames } = plan;
  const { connection, createConnection, concurrency = 1 } = options;
  if (!createConnection || concurrency === 1 || tasks.length <= 1) {
    const results: ProjectionTaskExecutionResult[] = [];
    const completed = new Set(satisfiedTaskNames);
    const pending = [...tasks];
    while (pending.length > 0) {
      const index = pending.findIndex((task) =>
        task.dependencies.every((dependency) => completed.has(dependency)),
      );
      if (index < 0) {
        throw new Error(
          `No projection task is ready among: ${pending.map((task) => task.name).join(", ")}`,
        );
      }
      const task = pending.splice(index, 1)[0];
      if (!task) throw new Error("Ready projection task is missing");
      results.push({ name: task.name, result: await task.run(connection) });
      completed.add(task.name);
    }
    return results;
  }
  const createWorkerConnection = createConnection;

  const pending = [...tasks];
  const running = new Map<string, RunningProjectionTask>();
  const completed = new Set(satisfiedTaskNames);
  const results = new Map<string, unknown>();
  let failure: unknown;

  async function runTask(task: ProjectionTask): Promise<unknown> {
    const workerConnection = await createWorkerConnection();
    try {
      return await task.run(workerConnection);
    } finally {
      await workerConnection.end();
    }
  }

  function dependenciesComplete(task: ProjectionTask): boolean {
    return task.dependencies.every((dependency) => completed.has(dependency));
  }

  function isLongTask(task: ProjectionTask): boolean {
    return task.estimatedDurationMs >= LONG_TASK_THRESHOLD_MS;
  }

  function nextReadyTask(): ProjectionTask | undefined {
    const ready = pending.filter(dependenciesComplete);
    if (ready.length === 0) return undefined;
    const longTaskRunning = [...running.values()].some((entry) =>
      isLongTask(entry.task),
    );
    const shortReady = ready.filter((task) => !isLongTask(task));
    const candidates =
      longTaskRunning && shortReady.length > 0 ? shortReady : ready;
    return candidates.reduce<ProjectionTask | undefined>((selected, task) => {
      if (!selected) return task;
      if (longTaskRunning && shortReady.length > 0) {
        return task.estimatedDurationMs < selected.estimatedDurationMs
          ? task
          : selected;
      }
      return task.estimatedDurationMs > selected.estimatedDurationMs
        ? task
        : selected;
    }, undefined);
  }

  function startReadyTasks(): void {
    while (running.size < concurrency) {
      const task = nextReadyTask();
      if (!task) break;
      pending.splice(pending.indexOf(task), 1);
      const promise: Promise<ProjectionTaskOutcome> = runTask(task)
        .then((result) => ({ task, result }))
        .catch((error: unknown) => ({ task, error }));
      running.set(task.name, { task, promise });
    }
  }

  while ((pending.length > 0 || running.size > 0) && failure === undefined) {
    startReadyTasks();
    if (running.size === 0) {
      throw new Error(
        `No projection task is ready among: ${pending.map((task) => task.name).join(", ")}`,
      );
    }
    const outcome = await Promise.race(
      [...running.values()].map((entry) => entry.promise),
    );
    running.delete(outcome.task.name);
    if ("error" in outcome) {
      failure = outcome.error;
      break;
    }
    completed.add(outcome.task.name);
    results.set(outcome.task.name, outcome.result);
  }

  if (running.size > 0) {
    await Promise.allSettled(
      [...running.values()].map((entry) => entry.promise),
    );
  }
  if (failure !== undefined) throw failure;
  return tasks.map((task) => ({
    name: task.name,
    result: results.get(task.name),
  }));
}

export async function buildProjectionTables(
  connection: ProjectionConnection,
  options: BuildProjectionTablesOptions = {},
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
  const taskPlan = createProjectionTaskPlan(
    [...coreRankingTasks, ...semanticTasks],
    satisfiedProjectionNames.map((name) => `projection:${name}`),
  );
  await executeProjectionTaskPlan(taskPlan, {
    connection,
    createConnection,
    concurrency: projectionConcurrency(concurrency),
  });
}
