import {
  CORE_RANKING_TABLE_TASK_COUNT,
  createRankingTableSource,
  rankingTableTasks,
} from "./ranking-tables.ts";
import {
  dropManagedObject,
  ensureIndexes,
  INDEXES,
  tableExists,
} from "./database.ts";
import { DEPLOYMENT_PROJECTION_GROUPS, PROJECTION_JOBS } from "./jobs.ts";
import {
  elapsedMs,
  createTableProgress,
  startBuildHeartbeat,
  writeBuildLog,
} from "./progress.ts";
import { runDependencyAwareTasks } from "./scheduler.ts";
import { createdTables, executeTableStatements, projectionSql } from "./sql.ts";

export { DEPLOYMENT_PROJECTION_GROUPS } from "./jobs.ts";
export { ensureWcaPersonLookupIndex, dropManagedObject } from "./database.ts";
export {
  CORE_RANKING_TABLE_TASKS,
  CORE_RANKING_TABLE_TASK_COUNT,
  renameRankingTableSql,
} from "./ranking-tables.ts";
export {
  createTableProgress,
  elapsedMs,
  runTimedBuildStep,
  writeBuildLog,
} from "./progress.ts";
export { runDependencyAwareTasks } from "./scheduler.ts";
export { executeTableStatements, projectionSql, statements } from "./sql.ts";

const projectionDefinitions = PROJECTION_JOBS.filter(
  (job) => job.kind !== "core",
).map((job) => ({
  name: job.id,
  dependencies: [...job.dependencies],
  files: [...job.sqlFiles],
  tables: [...job.tables],
  enabledByDefault: job.enabledByDefault,
  estimatedDurationMs: job.estimatedDurationMs ?? 0,
}));

export const SEMANTIC_PROJECTION_TABLES = projectionDefinitions.flatMap(
  ({ tables }) => tables,
);
export const DEFAULT_PROJECTION_NAMES = projectionDefinitions
  .filter(({ enabledByDefault }) => enabledByDefault)
  .map(({ name }) => name);

export function projectionNamesForRefresh(selectedNames) {
  return selectedNames ?? DEFAULT_PROJECTION_NAMES;
}
export const ACTIVE_SEMANTIC_PROJECTION_TABLES = projectionDefinitions
  .filter(({ enabledByDefault }) => enabledByDefault)
  .flatMap(({ tables }) => tables);
export const CORE_RANKING_TABLES = [
  "ranking_entries_single",
  "ranking_entries_average",
  "ranking_counts",
];
export const PUBLISHED_PROJECTION_TABLES = [
  ...CORE_RANKING_TABLES,
  ...ACTIVE_SEMANTIC_PROJECTION_TABLES,
];
export const RETIRED_PROJECTION_TABLES = ["person_sum_of_ranks_event_values"];

function projectionNames(sql, suffix) {
  return [...SEMANTIC_PROJECTION_TABLES, ...CORE_RANKING_TABLES]
    .sort((left, right) => right.length - left.length)
    .reduce(
      (renamed, table) =>
        renamed.replace(
          new RegExp(`(?<![A-Za-z0-9_])${table}(?![A-Za-z0-9_])`, "g"),
          `${table}${suffix}`,
        ),
      sql,
    );
}

async function buildSqlProjection(
  connection,
  definition,
  suffix,
  tableProgress,
) {
  const phases = [];
  for (const file of definition.files) {
    const sql = projectionNames(await projectionSql(file), suffix);
    await executeTableStatements(connection, sql, phases, { tableProgress });
  }
  return phases;
}

async function validateProjection(connection, definition, suffix) {
  const rowCounts = {};
  for (const table of definition.tables) {
    const [rows] = await connection.query(
      `SELECT COUNT(*) AS count FROM \`${table}${suffix}\``,
    );
    rowCounts[table] = Number(rows[0]?.count ?? 0);
  }
  return rowCounts;
}

export const PROJECTION_REGISTRY = projectionDefinitions.map((definition) => ({
  ...definition,
  build: (connection, suffix, tableProgress) =>
    buildSqlProjection(connection, definition, suffix, tableProgress),
  validate: (connection, suffix) =>
    validateProjection(connection, definition, suffix),
}));

export async function countProjectionTables(projections) {
  let total = 0;
  for (const projection of projections) {
    for (const file of projection.files) {
      total += createdTables(
        projectionNames(await projectionSql(file), ""),
      ).length;
    }
  }
  return total;
}

function projectionDependencyClosure(selectedNames) {
  const byName = new Map(
    projectionDefinitions.map((projection) => [projection.name, projection]),
  );
  const ordered = [];
  const visiting = new Set();
  const visited = new Set();

  function visit(name) {
    if (visited.has(name) || name === "raw-wca") return;
    if (visiting.has(name))
      throw new Error(`Projection dependency cycle at ${name}`);
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
  const groups = DEPLOYMENT_PROJECTION_GROUPS.filter(({ name }) =>
    selected.has(name),
  );
  const satisfiedGroups = DEPLOYMENT_PROJECTION_GROUPS.filter(({ name }) =>
    satisfied.has(name),
  );
  if (
    groups.length !== selected.size ||
    satisfiedGroups.length !== satisfied.size
  ) {
    const known = new Set(DEPLOYMENT_PROJECTION_GROUPS.map(({ name }) => name));
    const unknown = [...selected, ...satisfied].filter(
      (name) => !known.has(name),
    );
    throw new Error(
      `Unknown deployment projection group: ${unknown.join(", ")}`,
    );
  }
  return {
    groups: groups.map(({ name }) => name),
    projectionNames: [
      ...new Set(groups.flatMap(({ projectionNames: names }) => names)),
    ],
    satisfiedProjectionNames: [
      ...new Set(
        satisfiedGroups.flatMap(({ projectionNames: names }) => names),
      ),
    ],
    includeRankingTables: groups.some(({ name }) => name === "ranking-tables"),
    tables: [...new Set(groups.flatMap(({ tables }) => tables))],
  };
}

function orderedProjections(
  selectedNames = DEFAULT_PROJECTION_NAMES,
  satisfiedNames = [],
) {
  const byName = new Map(
    PROJECTION_REGISTRY.map((projection) => [projection.name, projection]),
  );
  const satisfied = new Set(satisfiedNames);
  return projectionDependencyClosure(selectedNames)
    .filter(({ name }) => !satisfied.has(name))
    .map(({ name }) => byName.get(name));
}

async function buildProjection(
  connection,
  projection,
  projectionSuffix,
  tableProgress,
) {
  const startedAt = performance.now();
  writeBuildLog(`Starting projection ${projection.name}…`);
  const stopHeartbeat = startBuildHeartbeat(
    `projection ${projection.name}`,
    startedAt,
  );
  try {
    for (const table of projection.tables)
      await dropManagedObject(connection, `${table}${projectionSuffix}`);
    const phases = await projection.build(
      connection,
      projectionSuffix,
      tableProgress,
    );
    const rowCounts = await projection.validate(connection, projectionSuffix);
    const durationMs = elapsedMs(startedAt);
    const timing = { name: projection.name, durationMs, rowCounts, phases };
    stopHeartbeat();
    writeBuildLog(
      `Finished projection ${projection.name} in ${durationMs}ms (${JSON.stringify(rowCounts)}).`,
    );
    return timing;
  } catch (error) {
    stopHeartbeat();
    writeBuildLog(
      `Failed projection ${projection.name} after ${elapsedMs(startedAt)}ms.`,
    );
    throw error;
  }
}

export function projectionConcurrency(value) {
  const parsed = Number(
    value ?? process.env.WCA_PROJECTION_BUILD_CONCURRENCY ?? 2,
  );
  return Number.isFinite(parsed) && parsed > 1 ? Math.floor(parsed) : 1;
}

async function buildRegisteredProjectionsConcurrently(
  projections,
  {
    connection,
    projectionSuffix,
    createConnection,
    concurrency,
    tableProgress,
    satisfiedProjectionNames = [],
  },
) {
  const tasks = projections.map((projection) => ({
    name: projection.name,
    dependencies: projection.dependencies,
    estimatedDurationMs: projection.estimatedDurationMs,
    run: async (connection) =>
      buildProjection(connection, projection, projectionSuffix, tableProgress),
  }));
  return runDependencyAwareTasks(tasks, {
    connection,
    createConnection,
    concurrency,
    satisfiedDependencies: ["raw-wca", ...satisfiedProjectionNames],
  });
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
  const projections = orderedProjections(
    selectedNames,
    satisfiedProjectionNames,
  );
  const tableProgress = createTableProgress(
    await countProjectionTables(projections),
  );
  const maxConcurrency = projectionConcurrency(concurrency);
  if (createConnection && maxConcurrency > 1 && projections.length > 1) {
    writeBuildLog(
      `Building registered projections with concurrency ${maxConcurrency}.`,
    );
  }
  return buildRegisteredProjectionsConcurrently(projections, {
    connection,
    projectionSuffix,
    createConnection:
      createConnection && maxConcurrency > 1 ? createConnection : undefined,
    concurrency: maxConcurrency,
    tableProgress,
    satisfiedProjectionNames,
  });
}

export async function promoteProjectionTables(
  connection,
  { projectionSuffix = "_staging", tables = PUBLISHED_PROJECTION_TABLES } = {},
) {
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
  if (obsolete.length > 0)
    await connection.query(`DROP TABLE ${obsolete.join(", ")}`);
  for (const retired of RETIRED_PROJECTION_TABLES)
    await dropManagedObject(connection, retired);
}

export async function promoteRegisteredProjections(
  connection,
  {
    projectionSuffix = "_staging",
    projectionNames: selectedNames = DEFAULT_PROJECTION_NAMES,
  } = {},
) {
  const tables = orderedProjections(selectedNames).flatMap(
    ({ tables: projectionTables }) => projectionTables,
  );
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
  if (renames.length > 0)
    await connection.query(`RENAME TABLE ${renames.join(", ")}`);
  if (obsolete.length > 0)
    await connection.query(`DROP TABLE ${obsolete.join(", ")}`);
  for (const retired of RETIRED_PROJECTION_TABLES)
    await dropManagedObject(connection, retired);
}

export async function refreshMysqlSchema(
  connection,
  {
    projectionSuffix = "",
    projectionNames: selectedNames,
    satisfiedProjectionNames = [],
    includeRankingTables = true,
    createConnection,
    concurrency,
  } = {},
) {
  const entriesTables = {
    single: `ranking_entries_single${projectionSuffix}`,
    average: `ranking_entries_average${projectionSuffix}`,
  };
  const countsTable = `ranking_counts${projectionSuffix}`;
  const resultEntriesTable = `result_entries_single${projectionSuffix}`;
  const resultCountsTable = `result_counts${projectionSuffix}`;
  const resultEntriesSource = `result_entries_single_source${projectionSuffix}`;
  const bestSingle = `wca_best_single${projectionSuffix}`;
  const bestAverage = `wca_best_average${projectionSuffix}`;
  const resultFacts = `result_facts${projectionSuffix}`;
  const entriesSources = {
    single: `ranking_entries_single_source${projectionSuffix}`,
    average: `ranking_entries_average_source${projectionSuffix}`,
  };

  await ensureIndexes(connection, INDEXES);

  if (includeRankingTables) {
    for (const name of [
      countsTable,
      resultEntriesTable,
      resultCountsTable,
      entriesTables.single,
      entriesTables.average,
      entriesSources.single,
      entriesSources.average,
      resultEntriesSource,
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
    for (const file of [
      "core/ranking-tables/wca_best_single.sql",
      "core/ranking-tables/wca_best_average.sql",
    ]) {
      await createRankingTableSource(connection, file, names);
    }
  }

  const maxConcurrency = projectionConcurrency(concurrency);
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
    run: (worker) =>
      buildProjection(worker, projection, projectionSuffix, tableProgress),
  }));
  const coreRankingTasks = includeRankingTables
    ? rankingTableTasks({
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
      })
    : [];
  await runDependencyAwareTasks([...coreRankingTasks, ...semanticTasks], {
    connection,
    createConnection,
    concurrency: maxConcurrency,
    satisfiedDependencies: [
      "raw-wca",
      ...satisfiedProjectionNames.map((name) => `projection:${name}`),
    ],
  });
}
