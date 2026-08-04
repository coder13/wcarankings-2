// @ts-nocheck
import { compatibilityProjectionTasks } from "./compatibility.ts";
import { dropManagedObject, ensureIndexes, ensureWcaPersonLookupIndex, INDEXES, tableExists } from "./database.ts";
import { DEPLOYMENT_PROJECTION_GROUPS, PROJECTION_JOBS } from "./jobs.ts";
import { elapsedMs, createTableProgress, runTimedBuildStep, writeBuildLog } from "./progress.ts";
import { runDependencyAwareTasks } from "./scheduler.ts";
import { createdTables, executeTableStatements, projectionSql, statements } from "./sql.ts";

export { DEPLOYMENT_PROJECTION_GROUPS } from "./jobs.ts";
export { ensureWcaPersonLookupIndex, dropManagedObject } from "./database.ts";
export {
  COMPATIBILITY_PROJECTION_TASKS,
  COMPATIBILITY_TABLE_TASK_COUNT,
  renameCompatibilitySql,
} from "./compatibility.ts";
export { createTableProgress, elapsedMs, runTimedBuildStep, writeBuildLog } from "./progress.ts";
export { runDependencyAwareTasks } from "./scheduler.ts";
export { executeTableStatements, projectionSql, statements } from "./sql.ts";

const projectionDefinitions = PROJECTION_JOBS
  .filter((job) => job.kind !== "compatibility")
  .map((job) => ({
    name: job.id,
    dependencies: [...job.dependencies],
    files: [...job.sqlFiles],
    tables: [...job.tables],
    enabledByDefault: job.enabledByDefault,
    estimatedDurationMs: job.estimatedDurationMs ?? 0,
  }));

export const SEMANTIC_PROJECTION_TABLES = projectionDefinitions.flatMap(({ tables }) => tables);
export const DEFAULT_PROJECTION_NAMES = projectionDefinitions
  .filter(({ enabledByDefault }) => enabledByDefault)
  .map(({ name }) => name);

export function projectionNamesForRefresh(selectedNames) {
  return selectedNames ?? DEFAULT_PROJECTION_NAMES;
}
export const ACTIVE_SEMANTIC_PROJECTION_TABLES = projectionDefinitions
  .filter(({ enabledByDefault }) => enabledByDefault)
  .flatMap(({ tables }) => tables);
export const COMPATIBILITY_PROJECTION_TABLES = [
  "ranking_entries_single",
  "ranking_entries_average",
  "ranking_counts",
];
export const PUBLISHED_PROJECTION_TABLES = [
  ...COMPATIBILITY_PROJECTION_TABLES,
  ...ACTIVE_SEMANTIC_PROJECTION_TABLES,
];
export const RETIRED_PROJECTION_TABLES = [
  "person_sum_of_ranks_event_values",
];

function projectionNames(sql, suffix) {
  return [...SEMANTIC_PROJECTION_TABLES, ...COMPATIBILITY_PROJECTION_TABLES]
    .sort((left, right) => right.length - left.length)
    .reduce(
      (renamed, table) => renamed.replace(
        new RegExp(`(?<![A-Za-z0-9_])${table}(?![A-Za-z0-9_])`, "g"),
        `${table}${suffix}`,
      ),
      sql,
    );
}

async function buildSqlProjection(connection, definition, suffix, tableProgress) {
  const phases = [];
  const deferredIndexTables = process.env.WCA_DEFER_PROJECTION_INDEXES === "1"
    ? new Set(definition.tables
        .filter((table) => DEFERRED_PROJECTION_INDEX_TABLES.has(table))
        .map((table) => `${table}${suffix}`))
    : undefined;
  for (const file of definition.files) {
    const sql = projectionNames(await projectionSql(file), suffix);
    await executeTableStatements(connection, sql, phases, {
      tableProgress,
      deferredIndexTables,
    });
  }
  return phases;
}

async function validateProjection(connection, definition, suffix) {
  const rowCounts = {};
  for (const table of definition.tables) {
    const [rows] = await connection.query(`SELECT COUNT(*) AS count FROM \`${table}${suffix}\``);
    rowCounts[table] = Number(rows[0]?.count ?? 0);
  }
  return rowCounts;
}

export const PROJECTION_REGISTRY = projectionDefinitions.map((definition) => ({
  ...definition,
  build: (connection, suffix, tableProgress) => buildSqlProjection(connection, definition, suffix, tableProgress),
  validate: (connection, suffix) => validateProjection(connection, definition, suffix),
}));

export async function countProjectionTables(projections) {
  let total = 0;
  for (const projection of projections) {
    for (const file of projection.files) {
      total += createdTables(projectionNames(await projectionSql(file), "")).length;
    }
  }
  return total;
}

function projectionDependencyClosure(selectedNames) {
  const byName = new Map(projectionDefinitions.map((projection) => [projection.name, projection]));
  const ordered = [];
  const visiting = new Set();
  const visited = new Set();

  function visit(name) {
    if (visited.has(name) || name === "raw-wca") return;
    if (visiting.has(name)) throw new Error(`Projection dependency cycle at ${name}`);
    const projection = byName.get(name);
    if (!projection) throw new Error(`Unknown projection dependency: ${name}`);
    visiting.add(name);
    for (const dependency of projection.dependencies) visit(dependency);
    visiting.delete(name);
    visited.add(name);
    ordered.push(projection);
  }

  for (const name of selectedNames) visit(name);
  return ordered;
}

export function projectionBuildPlan(
  groupNames = DEPLOYMENT_PROJECTION_GROUPS.map(({ name }) => name),
  satisfiedGroupNames = [],
) {
  const selected = new Set(groupNames);
  const satisfied = new Set(satisfiedGroupNames);
  const groups = DEPLOYMENT_PROJECTION_GROUPS.filter(({ name }) => selected.has(name));
  const satisfiedGroups = DEPLOYMENT_PROJECTION_GROUPS.filter(({ name }) => satisfied.has(name));
  if (groups.length !== selected.size || satisfiedGroups.length !== satisfied.size) {
    const known = new Set(DEPLOYMENT_PROJECTION_GROUPS.map(({ name }) => name));
    const unknown = [...selected, ...satisfied].filter((name) => !known.has(name));
    throw new Error(`Unknown deployment projection group: ${unknown.join(", ")}`);
  }
  return {
    groups: groups.map(({ name }) => name),
    projectionNames: [...new Set(groups.flatMap(({ projectionNames: names }) => names))],
    satisfiedProjectionNames: [...new Set(
      satisfiedGroups
        .flatMap(({ projectionNames: names }) => names),
    )],
    includeCompatibility: groups.some(({ name }) => name === "compatibility"),
    tables: [...new Set(groups.flatMap(({ tables }) => tables))],
  };
}

function orderedProjections(selectedNames = DEFAULT_PROJECTION_NAMES, satisfiedNames = []) {
  const byName = new Map(PROJECTION_REGISTRY.map((projection) => [projection.name, projection]));
  const satisfied = new Set(satisfiedNames);
  return projectionDependencyClosure(selectedNames)
    .filter(({ name }) => !satisfied.has(name))
    .map(({ name }) => byName.get(name));
}

async function buildProjection(connection, projection, projectionSuffix, tableProgress) {
  const startedAt = performance.now();
  writeBuildLog(`Starting projection ${projection.name}…`);
  const stopHeartbeat = startBuildHeartbeat(`projection ${projection.name}`, startedAt);
  try {
    for (const table of projection.tables) await dropManagedObject(connection, `${table}${projectionSuffix}`);
    const phases = await projection.build(connection, projectionSuffix, tableProgress);
    const rowCounts = await projection.validate(connection, projectionSuffix);
    const durationMs = elapsedMs(startedAt);
    const timing = { name: projection.name, durationMs, rowCounts, phases };
    stopHeartbeat();
    writeBuildLog(`Finished projection ${projection.name} in ${formatDuration(durationMs)} (${JSON.stringify(rowCounts)}).`);
    return timing;
  } catch (error) {
    stopHeartbeat();
    writeBuildLog(`Failed projection ${projection.name} after ${formatDuration(elapsedMs(startedAt))}.`);
    throw error;
  }
}

function personYearRankingTasks(projection, {
  projectionSuffix,
  tableProgress,
  taskPrefix = "",
  projectionDependencies = projection.dependencies,
}) {
  const state = {
    startedAt: undefined,
    stopHeartbeat: undefined,
    finished: false,
    phases: new Map(),
  };

  function failBuild() {
    if (state.finished || state.startedAt === undefined) return;
    state.finished = true;
    state.stopHeartbeat?.();
    writeBuildLog(
      `Failed projection ${projection.name} after ${formatDuration(elapsedMs(state.startedAt))}.`,
    );
  }

  async function runStage(descriptor, connection) {
    try {
      if (descriptor.stage === "prepare") {
        state.startedAt = performance.now();
        writeBuildLog(`Starting projection ${projection.name}…`);
        state.stopHeartbeat = startBuildHeartbeat(`projection ${projection.name}`, state.startedAt);
        for (const table of projection.tables) {
          await dropManagedObject(connection, `${table}${projectionSuffix}`);
        }
        return undefined;
      }

      if (descriptor.stage === "complete") {
        const rowCounts = await projection.validate(connection, projectionSuffix);
        const durationMs = elapsedMs(state.startedAt);
        const phases = PERSON_YEAR_RANKING_STAGE_DEFINITIONS
          .flatMap(({ stage }) => state.phases.get(stage) ?? []);
        const timing = { name: projection.name, durationMs, rowCounts, phases };
        state.finished = true;
        state.stopHeartbeat?.();
        writeBuildLog(
          `Finished projection ${projection.name} in ${formatDuration(durationMs)} (${JSON.stringify(rowCounts)}).`,
        );
        return timing;
      }

      const phases = [];
      state.phases.set(descriptor.stage, phases);
      const sql = projectionNames(await projectionSql(descriptor.file), projectionSuffix);
      await executeTableStatements(connection, sql, phases, { tableProgress });
      return undefined;
    } catch (error) {
      failBuild();
      throw error;
    }
  }

  return personYearRankingTaskPlan({ taskPrefix, projectionDependencies }).map((descriptor) => ({
    name: descriptor.name,
    dependencies: descriptor.dependencies,
    estimatedDurationMs: descriptor.estimatedDurationMs,
    run: (connection) => runStage(descriptor, connection),
  }));
}

function projectionSchedulerTasks(projections, {
  projectionSuffix,
  tableProgress,
  taskPrefix = "",
  dependencyName = (dependency) => dependency,
}) {
  return projections.flatMap((projection) => {
    const dependencies = projection.dependencies.map(dependencyName);
    if (projection.name === PERSON_YEAR_RANKING_PROJECTION) {
      return personYearRankingTasks(projection, {
        projectionSuffix,
        tableProgress,
        taskPrefix,
        projectionDependencies: dependencies,
      });
    }
    return [{
      name: `${taskPrefix}${projection.name}`,
      dependencies,
      estimatedDurationMs: projectionDurationEstimate(projection.name),
      run: (connection) => buildProjection(connection, projection, projectionSuffix, tableProgress),
    }];
  });
}

export function projectionConcurrency(value) {
  const parsed = Number(value ?? process.env.WCA_PROJECTION_BUILD_CONCURRENCY ?? 2);
  return Number.isFinite(parsed) && parsed > 1 ? Math.floor(parsed) : 1;
}

async function buildRegisteredProjectionsConcurrently(projections, {
  connection,
  projectionSuffix,
  createConnection,
  concurrency,
  tableProgress,
  satisfiedProjectionNames = [],
}) {
  const tasks = projections.map((projection) => ({
    name: projection.name,
    dependencies: projection.dependencies,
    estimatedDurationMs: projection.estimatedDurationMs,
    run: async (connection) => buildProjection(connection, projection, projectionSuffix, tableProgress),
  }));
  return runDependencyAwareTasks(tasks, {
    connection,
    createConnection,
    concurrency,
    satisfiedDependencies: ["raw-wca", ...satisfiedProjectionNames],
  });
  const stopResourceMonitor = startResourceMonitor();
  try {
    const results = await runDependencyAwareTasks(tasks, {
      connection,
      createConnection,
      concurrency,
      satisfiedDependencies: ["raw-wca", ...satisfiedProjectionNames],
    });
    return results.filter((result) => result !== undefined);
  } finally {
    stopResourceMonitor();
  }
}

export async function buildRegisteredProjections(
  connection,
  {
    projectionSuffix = "",
    projectionNames: selectedNames,
    satisfiedProjectionNames = [],
    createConnection,
    concurrency,
  } = {},
) {
  const projections = orderedProjections(selectedNames, satisfiedProjectionNames);
  const tableProgress = createTableProgress(await countProjectionTables(projections));
  const maxConcurrency = projectionConcurrency(concurrency);
  if (createConnection && maxConcurrency > 1 && projections.length > 1) {
    writeBuildLog(`Building registered projections with concurrency ${maxConcurrency}.`);
  }
  return buildRegisteredProjectionsConcurrently(projections, {
    connection,
    projectionSuffix,
    createConnection: createConnection && maxConcurrency > 1 ? createConnection : undefined,
    concurrency: maxConcurrency,
    tableProgress,
    satisfiedProjectionNames,
  });
}


export async function promoteProjectionTables(connection, { projectionSuffix = "_staging", tables = PUBLISHED_PROJECTION_TABLES } = {}) {
  const renames = [];
  const obsolete = [];
  for (const published of tables) {
    const previous = `${published}_previous`;
    await dropManagedObject(connection, previous);
    if (await tableExists(connection, published)) {
      renames.push(`\`${published}\` TO \`${previous}\``);
      obsolete.push(`\`${previous}\``);
    }
    renames.push(`\`${published}${projectionSuffix}\` TO \`${published}\``);
  }
  await connection.query(`RENAME TABLE ${renames.join(", ")}`);
  if (obsolete.length > 0) await connection.query(`DROP TABLE ${obsolete.join(", ")}`);
  for (const retired of RETIRED_PROJECTION_TABLES) await dropManagedObject(connection, retired);
}

export async function promoteRegisteredProjections(
  connection,
  { projectionSuffix = "_staging", projectionNames: selectedNames = DEFAULT_PROJECTION_NAMES } = {},
) {
  const tables = orderedProjections(selectedNames).flatMap(({ tables: projectionTables }) => projectionTables);
  const renames = [];
  const obsolete = [];
  for (const table of tables) {
    const previous = `${table}_previous`;
    await dropManagedObject(connection, previous);
    if (await tableExists(connection, table)) {
      renames.push(`\`${table}\` TO \`${previous}\``);
      obsolete.push(`\`${previous}\``);
    }
    renames.push(`\`${table}${projectionSuffix}\` TO \`${table}\``);
  }
  if (renames.length > 0) await connection.query(`RENAME TABLE ${renames.join(", ")}`);
  if (obsolete.length > 0) await connection.query(`DROP TABLE ${obsolete.join(", ")}`);
  for (const retired of RETIRED_PROJECTION_TABLES) await dropManagedObject(connection, retired);
}

export async function refreshMysqlSchema(
  connection,
  {
    projectionSuffix = "",
    projectionNames: selectedNames,
    satisfiedProjectionNames = [],
    includeCompatibility = true,
    createConnection,
    concurrency,
  } = {},
) {
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

  if (includeCompatibility) {
    for (const name of [
      countsTable,
      entriesTables.single,
      entriesTables.average,
      entriesSources.single,
      entriesSources.average,
      bestSingle,
      bestAverage,
    ]) {
      await dropManagedObject(connection, name);
    }

    const names = {
      bestSingle,
      bestAverage,
      entriesSources,
      resultFacts,
      projectionSuffix,
    };
    // These are small raw-table views. The expensive helper tables and the
    // dependent source views are scheduled below, so they can use both build
    // workers and accurately contribute to table progress.
    for (const file of ["wca_best_single.sql", "wca_best_average.sql"]) {
      await createCompatibilitySource(connection, file, names);
    }
  }

  const maxConcurrency = projectionConcurrency(concurrency);
  const semanticProjections = orderedProjections(
    projectionNamesForRefresh(selectedNames),
    satisfiedProjectionNames,
  );
  const tableProgress = createTableProgress(
    (includeCompatibility ? COMPATIBILITY_TABLE_TASK_COUNT : 0)
      + await countProjectionTables(semanticProjections),
  );
  const semanticTasks = semanticProjections.map((projection) => ({
    name: `projection:${projection.name}`,
    dependencies: projection.dependencies.map((dependency) =>
      dependency === "raw-wca" ? dependency : `projection:${dependency}`),
    estimatedDurationMs: projection.estimatedDurationMs,
    run: (worker) => buildProjection(worker, projection, projectionSuffix, tableProgress),
  }));
  const compatibilityTasks = includeCompatibility ? compatibilityProjectionTasks({
      entriesTables,
      entriesSources,
      countsTable,
      bestSingle,
      bestAverage,
      resultFacts,
      tableProgress,
    }) : [];
  const stopResourceMonitor = startResourceMonitor();
  try {
    await runDependencyAwareTasks([
      ...compatibilityTasks,
      ...semanticTasks,
    ], {
      connection,
      createConnection,
      concurrency: maxConcurrency,
      satisfiedDependencies: [
        "raw-wca",
        ...satisfiedProjectionNames.map((name) => `projection:${name}`),
      ],
    });
  } finally {
    stopResourceMonitor();
  }
}
