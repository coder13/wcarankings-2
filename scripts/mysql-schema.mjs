import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
];

const projectionDirectory = join(dirname(fileURLToPath(import.meta.url)), "..", "sql", "ranking-projections");

function statements(sql) {
  return sql.split(/;\s*(?:\n|$)/).map((statement) => statement.trim()).filter(Boolean);
}

async function projectionSql(file) {
  return readFile(join(projectionDirectory, file), "utf8");
}

async function ensureIndexes(connection, indexes) {
  for (const [table, name, columns, columnList] of indexes) {
    if (table === "results" && process.env.WCA_SKIP_LARGE_INDEXES === "1") {
      process.stdout.write(`Skipping large results index ${name} in constrained mode\n`);
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

export async function dropManagedObject(connection, name) {
  const [rows] = await connection.query(
    "SELECT TABLE_TYPE AS type FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1",
    [name],
  );
  if (rows[0]?.type === "VIEW") await connection.query(`DROP VIEW \`${name}\``);
  if (rows[0]?.type === "BASE TABLE") await connection.query(`DROP TABLE \`${name}\``);
}

export async function refreshMysqlSchema(connection, { projectionSuffix = "" } = {}) {
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

  await ensureIndexes(connection, INDEXES);

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

  for (const type of ["single", "average"]) {
    const entriesTable = entriesTables[type];
    const entriesSource = entriesSources[type];
    await connection.query(`CREATE TABLE \`${entriesTable}\` AS SELECT * FROM \`${entriesSource}\``);
    for (const statement of statements(await projectionSql("ranking_entries_indexes.sql"))) {
      await connection.query(statement.replace(/^ALTER TABLE ranking_entries\b/, `ALTER TABLE \`${entriesTable}\``));
    }
  }
  await connection.query(`CREATE TABLE \`${resultEntriesTable}\` AS SELECT * FROM \`${resultEntriesSource}\``);
  for (const statement of statements(await projectionSql("result_entries_single_indexes.sql"))) {
    await connection.query(statement.replace(/^ALTER TABLE result_entries_single\b/, `ALTER TABLE \`${resultEntriesTable}\``));
  }
  for (const statement of statements(await projectionSql("ranking_counts.sql"))) {
    await connection.query(
      statement
        .replaceAll("ranking_entries_single", entriesTables.single)
        .replaceAll("ranking_entries_average", entriesTables.average)
        .replaceAll("ranking_counts", countsTable),
    );
  }
  for (const statement of statements(await projectionSql("result_counts.sql"))) {
    await connection.query(
      statement
        .replaceAll("result_entries_single", resultEntriesTable)
        .replaceAll("result_counts", resultCountsTable),
    );
  }
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
  await connection.query(`CREATE TABLE \`${resultEntriesTable}\` AS SELECT * FROM \`${resultEntriesSource}\``);
  for (const statement of statements(await projectionSql("result_entries_single_indexes.sql"))) {
    await connection.query(statement.replace(/^ALTER TABLE result_entries_single\b/, `ALTER TABLE \`${resultEntriesTable}\``));
  }
  for (const statement of statements(await projectionSql("result_counts.sql"))) {
    await connection.query(
      statement
        .replaceAll("result_entries_single", resultEntriesTable)
        .replaceAll("result_counts", resultCountsTable),
    );
  }
}

async function tableExists(connection, name) {
  const [rows] = await connection.query(
    "SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1",
    [name],
  );
  return rows.length > 0;
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
