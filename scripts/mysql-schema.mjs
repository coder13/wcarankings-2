import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEPLOYMENT_PROJECTION_GROUPS } from "./projection-groups.mjs";

export { DEPLOYMENT_PROJECTION_GROUPS } from "./projection-groups.mjs";

const INDEXES = [
  ["persons", "idx_persons_wca_sub", "(`wca_id`, `sub_id`)", "wca_id,sub_id"],
  ["persons", "idx_persons_name", "(`name`)", "name"],
  ["ranks_single", "idx_ranks_single_world", "(`event_id`, `world_rank`, `person_id`)", "event_id,world_rank,person_id"],
  ["ranks_single", "idx_ranks_single_continent", "(`event_id`, `continent_rank`, `person_id`)", "event_id,continent_rank,person_id"],
  ["ranks_single", "idx_ranks_single_country", "(`event_id`, `country_rank`, `person_id`)", "event_id,country_rank,person_id"],
  ["ranks_average", "idx_ranks_average_world", "(`event_id`, `world_rank`, `person_id`)", "event_id,world_rank,person_id"],
  ["ranks_average", "idx_ranks_average_continent", "(`event_id`, `continent_rank`, `person_id`)", "event_id,continent_rank,person_id"],
  ["ranks_average", "idx_ranks_average_country", "(`event_id`, `country_rank`, `person_id`)", "event_id,country_rank,person_id"],
  ["results", "idx_results_single_best", "(`person_id`, `event_id`, `best`, `id`)", "person_id,event_id,best,id"],
  ["results", "idx_results_single_event_best", "(`event_id`, `best`, `id`)", "event_id,best,id"],
  ["results", "idx_results_average_best", "(`person_id`, `event_id`, `average`, `id`)", "person_id,event_id,average,id"],
  ["result_attempts", "idx_result_attempts_result", "(`result_id`, `attempt_number`)", "result_id,attempt_number"],
  ["results", "idx_results_average_event_best", "(`event_id`, `average`, `id`)", "event_id,average,id"],
  ["results", "idx_results_single_country_best", "(`event_id`, `person_country_id`, `best`, `id`)", "event_id,person_country_id,best,id"],
  ["results", "idx_results_average_country_best", "(`event_id`, `person_country_id`, `average`, `id`)", "event_id,person_country_id,average,id"],
];

const projectionDirectory = join(dirname(fileURLToPath(import.meta.url)), "..", "sql", "ranking-projections");

function statements(sql) {
  return sql.split(/;\s*(?:\n|$)/).map((statement) => statement.trim()).filter(Boolean);
}

async function projectionSql(file) {
  return readFile(join(projectionDirectory, file), "utf8");
}

function elapsedMs(startedAt) {
  return Math.round(performance.now() - startedAt);
}

function writeBuildLog(message) {
  process.stdout.write(`[projection-build] ${message}\n`);
}

export function createTableProgress(total) {
  let started = 0;
  return {
    start() {
      started += 1;
      return `[${started}/${total}]`;
    },
  };
}

export async function runTimedBuildStep(label, build, { tableProgress, tableName } = {}) {
  const startedAt = performance.now();
  const progress = tableProgress && tableName ? `${tableProgress.start(tableName)} ` : "";
  writeBuildLog(`${progress}Starting ${label}…`);
  try {
    const result = await build();
    const durationMs = elapsedMs(startedAt);
    writeBuildLog(`Finished ${label} in ${durationMs}ms.`);
    return { result, durationMs };
  } catch (error) {
    writeBuildLog(`Failed ${label} after ${elapsedMs(startedAt)}ms.`);
    throw error;
  }
}

function createdTableName(statement) {
  return statement.match(
    /\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:TEMPORARY\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?([a-zA-Z0-9_]+)`?/i,
  )?.[1];
}

async function executeTableStatements(connection, sql, phases = [], { tableProgress } = {}) {
  let activeTable;
  let activeTableStartedAt;

  function finishActiveTable() {
    if (!activeTable) return;
    writeBuildLog(`Finished table ${activeTable} in ${elapsedMs(activeTableStartedAt)}ms.`);
    activeTable = undefined;
    activeTableStartedAt = undefined;
  }

  try {
    for (const statement of statements(sql)) {
      const table = createdTableName(statement);
      if (table) {
        finishActiveTable();
        activeTable = table;
        activeTableStartedAt = performance.now();
        const progress = tableProgress ? `${tableProgress.start(table)} ` : "";
        writeBuildLog(`${progress}Starting table ${table}…`);
      }

      const phase = statement.match(/^\s*-- phase:\s*([^\n]+)/)?.[1]?.trim();
      const startedAt = performance.now();
      await connection.query(statement);
      if (phase) phases.push({
        name: phase,
        durationMs: elapsedMs(startedAt),
      });
    }
    finishActiveTable();
  } catch (error) {
    if (activeTable) {
      writeBuildLog(`Failed table ${activeTable} after ${elapsedMs(activeTableStartedAt)}ms.`);
    }
    throw error;
  }
}

const projectionDefinitions = [
  {
    name: "sum-of-ranks",
    dependencies: [],
    files: ["person_sum_of_ranks_scores.sql"],
    tables: ["person_sum_of_ranks_scores"],
    enabledByDefault: true,
  },
  {
    name: "competition-podium-members",
    dependencies: [],
    files: ["competition_podium_members.sql"],
    tables: ["competition_podium_members"],
    enabledByDefault: true,
  },
  {
    name: "competition-event-stats",
    dependencies: ["competition-podium-members"],
    files: ["competition_event_stats.sql"],
    tables: ["competition_event_stats"],
    enabledByDefault: true,
  },
  {
    name: "result-facts",
    dependencies: ["raw-wca"],
    files: ["result_facts.sql"],
    tables: ["result_facts"],
    // Yearly ranking rows retain a result ID and resolve its represented
    // country, competition, and historical record code at read time.
    enabledByDefault: true,
  },
  { name: "person-event-rankings", dependencies: ["result-facts"], files: ["person_event_rankings.sql"], tables: ["person_event_rankings"] },
  {
    name: "person-year-rankings",
    dependencies: ["result-facts"],
    files: ["person_year_ranking_cohorts.sql", "person_year_rankings_single.sql", "person_year_rankings_average.sql", "person_year_ranking_counts.sql"],
    tables: ["person_year_ranking_cohorts", "person_year_rankings_single", "person_year_rankings_average", "person_year_ranking_counts"],
    enabledByDefault: true,
  },
  {
    name: "result-rankings",
    dependencies: ["result-facts"],
    files: ["result_rankings_single.sql", "result_rankings_average.sql"],
    tables: ["result_rankings_single", "result_rankings_average"],
    enabledByDefault: true,
  },
  {
    name: "result-ranking-counts",
    dependencies: ["result-rankings"],
    files: ["result_ranking_counts.sql"],
    tables: ["result_ranking_counts"],
    enabledByDefault: true,
  },
  { name: "person-ranking-counts", dependencies: ["person-event-rankings"], files: ["projection_counts.sql"], tables: ["person_ranking_counts"] },
  { name: "person-metric-values", dependencies: ["person-event-rankings"], files: ["person_metric_values.sql"], tables: ["person_metric_values"] },
  { name: "person-metric-scores", dependencies: ["person-metric-values"], files: ["person_metric_scores.sql"], tables: ["person_metric_scores", "person_metric_counts"] },
  {
    name: "competition-stats",
    dependencies: [],
    files: ["competition_stats.sql"],
    tables: ["competition_stats"],
    enabledByDefault: true,
  },
  {
    name: "person-competition-rankings",
    dependencies: ["raw-wca"],
    files: ["person_competition_rankings.sql"],
    tables: [
      "person_competition_counts",
      "person_competition_rankings",
      "person_competition_ranking_counts",
    ],
    enabledByDefault: true,
  },
  { name: "city-event-stats", dependencies: ["result-facts"], files: ["city_event_stats.sql"], tables: ["city_event_stats"] },
  { name: "entity-ranking-counts", dependencies: ["competition-event-stats", "competition-stats", "city-event-stats"], files: ["entity_ranking_counts.sql"], tables: ["entity_ranking_counts"] },
];

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
  "result_entries_single",
  "result_counts",
];
export const PUBLISHED_PROJECTION_TABLES = [
  ...COMPATIBILITY_PROJECTION_TABLES,
  ...ACTIVE_SEMANTIC_PROJECTION_TABLES,
];
export const RETIRED_PROJECTION_TABLES = [
  "person_sum_of_ranks_event_values",
];

export const COMPATIBILITY_PROJECTION_TASKS = [
  { name: "compatibility-ranking-entries-single", dependencies: [], table: "ranking_entries_single", estimatedDurationMs: 120_000 },
  { name: "compatibility-ranking-entries-average", dependencies: [], table: "ranking_entries_average", estimatedDurationMs: 120_000 },
  { name: "compatibility-result-entries-single", dependencies: [], table: "result_entries_single", estimatedDurationMs: 150_000 },
  {
    name: "compatibility-ranking-counts",
    dependencies: ["compatibility-ranking-entries-single", "compatibility-ranking-entries-average"],
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

// Initial scheduling hints. The per-task logs provide the data to tune these
// values as the projection workload evolves; they do not affect SQL semantics.
const PROJECTION_DURATION_ESTIMATES_MS = {
  "sum-of-ranks": 180_000,
  "competition-podium-members": 30_000,
  "competition-event-stats": 90_000,
  "result-facts": 150_000,
  "person-event-rankings": 90_000,
  "person-year-rankings": 150_000,
  "result-rankings": 150_000,
  "result-ranking-counts": 15_000,
  "person-ranking-counts": 15_000,
  "person-metric-values": 90_000,
  "person-metric-scores": 45_000,
  "competition-stats": 30_000,
  "city-event-stats": 90_000,
  "entity-ranking-counts": 15_000,
};

const LONG_TASK_THRESHOLD_MS = 60_000;

function projectionDurationEstimate(name) {
  return PROJECTION_DURATION_ESTIMATES_MS[name] ?? 0;
}

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
  for (const file of definition.files) {
    const sql = projectionNames(await projectionSql(file), suffix);
    await executeTableStatements(connection, sql, phases, { tableProgress });
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
      const sql = projectionNames(await projectionSql(file), "");
      total += statements(sql).filter((statement) => createdTableName(statement)).length;
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
  try {
    for (const table of projection.tables) await dropManagedObject(connection, `${table}${projectionSuffix}`);
    const phases = await projection.build(connection, projectionSuffix, tableProgress);
    const rowCounts = await projection.validate(connection, projectionSuffix);
    const durationMs = elapsedMs(startedAt);
    const timing = { name: projection.name, durationMs, rowCounts, phases };
    writeBuildLog(`Finished projection ${projection.name} in ${durationMs}ms (${JSON.stringify(rowCounts)}).`);
    return timing;
  } catch (error) {
    writeBuildLog(`Failed projection ${projection.name} after ${elapsedMs(startedAt)}ms.`);
    throw error;
  }
}

export function projectionConcurrency(value) {
  const parsed = Number(value ?? process.env.WCA_PROJECTION_BUILD_CONCURRENCY ?? 2);
  return Number.isFinite(parsed) && parsed > 1 ? Math.floor(parsed) : 1;
}

export async function runDependencyAwareTasks(
  tasks,
  { connection, createConnection, concurrency = 1, satisfiedDependencies = [] } = {},
) {
  const taskByName = new Map(tasks.map((task) => [task.name, task]));
  const initiallyCompleted = new Set(["raw-wca", ...satisfiedDependencies]);
  for (const task of tasks) {
    for (const dependency of task.dependencies) {
      if (!initiallyCompleted.has(dependency) && !taskByName.has(dependency)) {
        throw new Error(`Unknown task dependency ${dependency} for ${task.name}`);
      }
    }
  }

  if (!createConnection || concurrency === 1 || tasks.length <= 1) {
    const results = [];
    const completed = new Set(initiallyCompleted);
    const pending = [...tasks];
    while (pending.length > 0) {
      const index = pending.findIndex((task) =>
        task.dependencies.every((dependency) => completed.has(dependency)));
      if (index < 0) {
        throw new Error(`Task dependency cycle or missing dependency among: ${pending.map(({ name }) => name).join(", ")}`);
      }
      const [task] = pending.splice(index, 1);
      results.push(await task.run(connection));
      completed.add(task.name);
    }
    return results;
  }

  const pending = [...tasks];
  const running = new Map();
  const completed = new Set(initiallyCompleted);
  const timings = new Map();
  let failure;

  async function runTask(task) {
    let workerConnection;
    try {
      workerConnection = await createConnection();
      return await task.run(workerConnection);
    } finally {
      if (workerConnection) await workerConnection.end();
    }
  }

  function dependenciesComplete(task) {
    return task.dependencies.every((dependency) => completed.has(dependency));
  }

  function isLongTask(task) {
    return task.estimatedDurationMs >= LONG_TASK_THRESHOLD_MS;
  }

  function nextReadyTask() {
    const ready = pending.filter(dependenciesComplete);
    if (ready.length === 0) return undefined;
    const longTaskRunning = [...running.values()].some(({ task }) => isLongTask(task));
    const shortReady = ready.filter((task) => !isLongTask(task));
    const candidates = longTaskRunning && shortReady.length > 0 ? shortReady : ready;
    return candidates.reduce((selected, task) => {
      if (!selected) return task;
      if (longTaskRunning && shortReady.length > 0) {
        return task.estimatedDurationMs < selected.estimatedDurationMs ? task : selected;
      }
      return task.estimatedDurationMs > selected.estimatedDurationMs ? task : selected;
    }, undefined);
  }

  function startReadyTasks() {
    while (running.size < concurrency) {
      const task = nextReadyTask();
      if (!task) break;
      pending.splice(pending.indexOf(task), 1);
      const promise = runTask(task)
        .then((result) => ({ task, result }))
        .catch((error) => ({ task, error }));
      running.set(task.name, { task, promise });
    }
  }

  while ((pending.length > 0 || running.size > 0) && !failure) {
    startReadyTasks();
    if (running.size === 0) {
      throw new Error(`Task dependency cycle or missing dependency among: ${pending.map(({ name }) => name).join(", ")}`);
    }
    const result = await Promise.race([...running.values()].map(({ promise }) => promise));
    running.delete(result.task.name);
    if (result.error) {
      failure = result.error;
      break;
    }
    completed.add(result.task.name);
    timings.set(result.task.name, result.result);
  }

  if (running.size > 0) {
    await Promise.allSettled([...running.values()].map(({ promise }) => promise));
  }
  if (failure) throw failure;
  return tasks.map(({ name }) => timings.get(name));
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
    estimatedDurationMs: projectionDurationEstimate(projection.name),
    run: async (connection) => buildProjection(connection, projection, projectionSuffix, tableProgress),
  }));
  return runDependencyAwareTasks(tasks, {
    connection,
    createConnection,
    concurrency,
    satisfiedDependencies: ["raw-wca", ...satisfiedProjectionNames],
  });
}

/*
 * Keep this helper separate from the scheduler so compatibility SQL remains
 * easy to compare with the historical serial implementation.
 */
async function buildCompatibilityTable(connection, table, source, indexFile, tableProgress) {
  await runTimedBuildStep(`table ${table}`, async () => {
    await connection.query(`CREATE TABLE \`${table}\` AS SELECT * FROM \`${source}\``);
    for (const statement of statements(await projectionSql(indexFile))) {
      await connection.query(statement.replace(
        /^ALTER TABLE (?:ranking_entries|result_entries_single)\b/,
        `ALTER TABLE \`${table}\``,
      ));
    }
  }, { tableProgress, tableName: table });
}

function compatibilityProjectionTasks({
  entriesTables,
  entriesSources,
  countsTable,
  resultEntriesTable,
  resultCountsTable,
  resultEntriesSource,
  tableProgress,
}) {
  const runners = {
    "compatibility-ranking-entries-single": (connection) => buildCompatibilityTable(
      connection, entriesTables.single, entriesSources.single, "ranking_entries_indexes.sql", tableProgress,
    ),
    "compatibility-ranking-entries-average": (connection) => buildCompatibilityTable(
      connection, entriesTables.average, entriesSources.average, "ranking_entries_indexes.sql", tableProgress,
    ),
    "compatibility-result-entries-single": (connection) => buildCompatibilityTable(
      connection, resultEntriesTable, resultEntriesSource, "result_entries_single_indexes.sql", tableProgress,
    ),
    "compatibility-ranking-counts": async (connection) => executeTableStatements(
      connection,
      (await projectionSql("ranking_counts.sql"))
        .replaceAll("ranking_entries_single", entriesTables.single)
        .replaceAll("ranking_entries_average", entriesTables.average)
        .replaceAll("ranking_counts", countsTable),
      [],
      { tableProgress },
    ),
    "compatibility-result-counts": async (connection) => executeTableStatements(
      connection,
      (await projectionSql("result_counts.sql"))
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

async function ensureIndexes(connection, indexes) {
  for (const [table, name, columns, columnList] of indexes) {
    if (table === "results" && process.env.WCA_SKIP_LARGE_INDEXES === "1") {
      process.stdout.write(`Skipping large results index ${name} in constrained mode\n`);
      continue;
    }
    const [tables] = await connection.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1",
      [table],
    );
    if (tables.length === 0) {
      process.stdout.write(`Skipping ${table} index ${name}; table is not present\n`);
      continue;
    }
    const [existing] = await connection.query(
      "SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1",
      [table, name],
    );
    if (existing.length === 0) {
      await connection.query(`ALTER TABLE \`${table}\` ADD INDEX \`${name}\` ${columns}`);
      process.stdout.write(`Added ${table}.${name} (${columnList})\n`);
    }
  }
}

export async function ensureWcaPersonLookupIndex(connection) {
  await ensureIndexes(connection, INDEXES.filter(([table, name]) =>
    table === "persons" && name === "idx_persons_wca_sub"));
}

export async function dropManagedObject(connection, name) {
  const [rows] = await connection.query(
    "SELECT TABLE_TYPE AS type FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1",
    [name],
  );
  if (rows[0]?.type === "VIEW") await connection.query(`DROP VIEW \`${name}\``);
  if (rows[0]?.type === "BASE TABLE") await connection.query(`DROP TABLE \`${name}\``);
}

async function tableExists(connection, name) {
  const [rows] = await connection.query(
    "SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1",
    [name],
  );
  return rows.length > 0;
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
  const entriesSources = {
    single: `ranking_entries_single_source${projectionSuffix}`,
    average: `ranking_entries_average_source${projectionSuffix}`,
  };
  const resultEntriesTable = `result_entries_single${projectionSuffix}`;
  const resultCountsTable = `result_counts${projectionSuffix}`;
  const resultEntriesSource = `result_entries_single_source${projectionSuffix}`;

  await ensureIndexes(connection, INDEXES);

  if (includeCompatibility) {
    for (const name of [
      countsTable,
      resultCountsTable,
      entriesTables.single,
      entriesTables.average,
      resultEntriesTable,
      entriesSources.single,
      entriesSources.average,
      resultEntriesSource,
      bestSingle,
      bestAverage,
    ]) {
      await dropManagedObject(connection, name);
    }

    for (const file of ["wca_best_single.sql", "wca_best_average.sql", "ranking_entries_single_source.sql", "ranking_entries_average_source.sql", "result_entries_single_source.sql"]) {
      const statement = await projectionSql(file);
      const renamed = statement
        .replaceAll("wca_best_single", bestSingle)
        .replaceAll("wca_best_average", bestAverage)
        .replaceAll("ranking_entries_single_source", entriesSources.single)
        .replaceAll("ranking_entries_average_source", entriesSources.average)
        .replaceAll("result_entries_single_source", resultEntriesSource);
      await connection.query(renamed);
    }
  }

  const maxConcurrency = projectionConcurrency(concurrency);
  const semanticProjections = orderedProjections(
    projectionNamesForRefresh(selectedNames),
    satisfiedProjectionNames,
  );
  const tableProgress = createTableProgress(
    (includeCompatibility ? COMPATIBILITY_PROJECTION_TASKS.length : 0)
      + await countProjectionTables(semanticProjections),
  );
  const semanticTasks = semanticProjections.map((projection) => ({
    name: `projection:${projection.name}`,
    dependencies: projection.dependencies.map((dependency) =>
      dependency === "raw-wca" ? dependency : `projection:${dependency}`),
    estimatedDurationMs: projectionDurationEstimate(projection.name),
    run: (worker) => buildProjection(worker, projection, projectionSuffix, tableProgress),
  }));
  const compatibilityTasks = includeCompatibility ? compatibilityProjectionTasks({
      entriesTables,
      entriesSources,
      countsTable,
      resultEntriesTable,
      resultCountsTable,
      resultEntriesSource,
      tableProgress,
    }) : [];
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
}

export async function refreshResultEntriesSchema(connection, { projectionSuffix = "" } = {}) {
  const resultEntriesTable = `result_entries_single${projectionSuffix}`;
  const resultCountsTable = `result_counts${projectionSuffix}`;
  const resultEntriesSource = `result_entries_single_source${projectionSuffix}`;

  for (const name of [resultCountsTable, resultEntriesTable, resultEntriesSource]) {
    await dropManagedObject(connection, name);
  }

  await ensureIndexes(connection, INDEXES.filter(([, name]) => name === "idx_results_single_event_best"));

  const source = await projectionSql("result_entries_single_source.sql");
  await connection.query(source.replaceAll("result_entries_single_source", resultEntriesSource));
  await runTimedBuildStep(`table ${resultEntriesTable}`, async () => {
    await connection.query(`CREATE TABLE \`${resultEntriesTable}\` AS SELECT * FROM \`${resultEntriesSource}\``);
    for (const statement of statements(await projectionSql("result_entries_single_indexes.sql"))) {
      await connection.query(statement.replace(/^ALTER TABLE result_entries_single\b/, `ALTER TABLE \`${resultEntriesTable}\``));
    }
  });
  await executeTableStatements(
    connection,
    (await projectionSql("result_counts.sql"))
      .replaceAll("result_entries_single", resultEntriesTable)
      .replaceAll("result_counts", resultCountsTable),
  );
}

export async function promoteResultEntriesSchema(connection, { projectionSuffix = "_staging" } = {}) {
  const projections = [
    ["result_entries_single", `result_entries_single${projectionSuffix}`],
    ["result_counts", `result_counts${projectionSuffix}`],
  ];
  const previousTables = projections.map(([published]) => `${published}_previous`);
  for (const table of previousTables) await dropManagedObject(connection, table);

  const renames = [];
  const obsoleteTables = [];
  for (const [published, staging] of projections) {
    if (await tableExists(connection, published)) {
      const previous = `${published}_previous`;
      renames.push(`\`${published}\` TO \`${previous}\``);
      obsoleteTables.push(`\`${previous}\``);
    }
    renames.push(`\`${staging}\` TO \`${published}\``);
  }
  await connection.query(`RENAME TABLE ${renames.join(", ")}`);
  if (obsoleteTables.length > 0) await connection.query(`DROP TABLE ${obsoleteTables.join(", ")}`);
}
