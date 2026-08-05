import { argumentPresent, argumentValue } from "../../lib/arguments.ts";
import { runPool } from "../../lib/async.ts";
import { databaseOptions } from "../../lib/database.ts";
import mysql from "mysql2/promise";
import {
  DEPLOYMENT_PROJECTION_GROUPS,
  dropManagedObject,
  promoteProjectionTables,
} from "../../../data-tools/projections/build.ts";
import { normalizeExportDate } from "../../../data-tools/shared/date.ts";

const selectedNames = argumentValue("groups").split(",").filter(Boolean);
const prepareOnly = argumentPresent("prepare-only");
const hydrate = argumentPresent("hydrate");
if (prepareOnly && hydrate)
  throw new Error("--prepare-only and --hydrate cannot be combined.");
const expectedExportDate = argumentValue("expected-export-date") || undefined;
const groups =
  selectedNames.length === 0
    ? DEPLOYMENT_PROJECTION_GROUPS
    : DEPLOYMENT_PROJECTION_GROUPS.filter(({ name }) =>
        selectedNames.includes(name),
      );
if (
  groups.length === 0 ||
  (groups.length !== selectedNames.length && selectedNames.length > 0)
)
  throw new Error("Unknown deployment projection group.");
const transferTables = groups.flatMap(({ tables }) => tables);
const manifestTables = groups.map(
  ({ name }) => `projection_transfer_manifest_${name.replaceAll("-", "_")}`,
);
const indexesTables = groups.map(
  ({ name }) => `projection_transfer_indexes_${name.replaceAll("-", "_")}`,
);
const indexConcurrency = Number(
  process.env.WCA_PROJECTION_INDEX_CONCURRENCY || 2,
);
if (
  !Number.isSafeInteger(indexConcurrency) ||
  indexConcurrency < 1 ||
  indexConcurrency > 4
) {
  throw new Error("WCA_PROJECTION_INDEX_CONCURRENCY must be between 1 and 4");
}

async function tableExists(connection, table) {
  const [rows] = await connection.query(
    `SELECT 1
       FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = ?
      LIMIT 1`,
    [table],
  );
  return rows.length > 0;
}

const options = databaseOptions(undefined, {
  databaseName: process.env.DATABASE_NAME_OVERRIDE,
});
const connection = await mysql.createConnection(options);
try {
  await connection.query("SET SESSION max_statement_time = 0");

  for (const table of manifestTables)
    if (!(await tableExists(connection, table)))
      throw new Error(`The projection transfer manifest ${table} is missing.`);

  const manifestResults = await Promise.all(
    manifestTables.map((table) =>
      connection.query(`SELECT export_date FROM \`${table}\` LIMIT 1`),
    ),
  );
  const transferDates = manifestResults.map(([rows]) => rows[0]?.export_date);
  const transferDate = transferDates[0];
  const normalizedTransferDate = normalizeExportDate(transferDate);
  const expectedDate =
    prepareOnly || hydrate
      ? normalizeExportDate(expectedExportDate)
      : normalizeExportDate(
          (
            await connection.query(
              "SELECT value AS export_date FROM export_metadata WHERE `key` = 'export_date' LIMIT 1",
            )
          )[0][0]?.export_date,
        );
  if (
    !normalizedTransferDate ||
    !expectedDate ||
    normalizedTransferDate !== expectedDate ||
    transferDates.some(
      (date) => normalizeExportDate(date) !== normalizedTransferDate,
    )
  ) {
    throw new Error(
      `Projection export date ${transferDate || "(missing)"} does not match ${prepareOnly || hydrate ? "expected" : "production raw"} export date ${expectedDate || "(missing)"}.`,
    );
  }

  for (const table of transferTables) {
    const transfer = `${table}_transfer`;
    if (!(await tableExists(connection, transfer))) {
      throw new Error(`Transferred projection table ${transfer} is missing.`);
    }
    const [rows] = await connection.query(
      `SELECT COUNT(*) AS count FROM \`${transfer}\``,
    );
    if (Number(rows[0]?.count ?? 0) === 0) {
      throw new Error(`Transferred projection table ${transfer} is empty.`);
    }
  }

  const deferredIndexes = (
    await Promise.all(
      indexesTables.map(
        async (table) =>
          (
            await connection.query(
              `SELECT table_name, index_name, index_sql FROM \`${table}\` ORDER BY table_name, index_name`,
            )
          )[0],
      ),
    )
  ).flat();
  process.stdout.write(
    `Building ${deferredIndexes.length} deferred projection indexes with concurrency ${indexConcurrency}…\n`,
  );
  const indexBuildStartedAt = performance.now();
  const indexBuildTimings = [];
  const indexesByTable = new Map();
  for (const index of deferredIndexes) {
    const indexes = indexesByTable.get(index.table_name) ?? [];
    indexes.push(index);
    indexesByTable.set(index.table_name, indexes);
  }
  let builtIndexCount = 0;
  await runPool(
    [...indexesByTable.entries()],
    indexConcurrency,
    async ([table, indexes]) => {
      const indexConnection = await mysql.createConnection(options);
      const startedAt = performance.now();
      try {
        await indexConnection.query("SET SESSION max_statement_time = 0");
        await indexConnection.query(
          `ALTER TABLE \`${table}\` ${indexes.map((index) => index.index_sql).join(", ")}`,
        );
      } finally {
        await indexConnection.end();
      }
      const durationMs = Math.round(performance.now() - startedAt);
      indexBuildTimings.push({
        table,
        indexCount: indexes.length,
        durationMs,
      });
      builtIndexCount += indexes.length;
      process.stdout.write(
        `Built ${indexes.length} indexes on ${table} in ${durationMs}ms (${builtIndexCount}/${deferredIndexes.length}).\n`,
      );
    },
  );
  const totalIndexBuildDurationMs = Math.round(
    performance.now() - indexBuildStartedAt,
  );
  const slowestTables = [...indexBuildTimings]
    .sort((left, right) => right.durationMs - left.durationMs)
    .slice(0, 5);
  process.stdout.write(
    `Deferred projection index summary: ${JSON.stringify({
      concurrency: indexConcurrency,
      indexCount: deferredIndexes.length,
      tableCount: indexBuildTimings.length,
      totalDurationMs: totalIndexBuildDurationMs,
      slowestTables,
    })}\n`,
  );

  if (hydrate) {
    const renames = [];
    for (const table of transferTables) {
      await dropManagedObject(connection, table);
      renames.push(`\`${table}_transfer\` TO \`${table}\``);
    }
    await connection.query(`RENAME TABLE ${renames.join(", ")}`);
    for (const table of [...indexesTables, ...manifestTables])
      await dropManagedObject(connection, table);
    process.stdout.write(
      `Hydrated ${groups.map(({ name }) => name).join(", ")} for ${normalizedTransferDate}.\n`,
    );
  } else if (prepareOnly) {
    for (const table of indexesTables)
      await connection.query(`DELETE FROM \`${table}\``);
    process.stdout.write(
      `Prepared transferred projection generation for ${normalizedTransferDate}; publication was not requested.\n`,
    );
  } else {
    const renames = [];
    for (const table of transferTables) {
      const staging = `${table}_staging`;
      await dropManagedObject(connection, staging);
      renames.push(`\`${table}_transfer\` TO \`${staging}\``);
    }
    await connection.query(`RENAME TABLE ${renames.join(", ")}`);
    await promoteProjectionTables(connection, { tables: transferTables });
    for (const table of [...indexesTables, ...manifestTables])
      await dropManagedObject(connection, table);
    process.stdout.write(
      `Published transferred projection generation for ${normalizedTransferDate}.\n`,
    );
  }
} finally {
  await connection.end();
}
