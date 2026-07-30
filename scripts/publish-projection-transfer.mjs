import mysql from "mysql2/promise";
import {
  DEPLOYMENT_PROJECTION_GROUPS,
  dropManagedObject,
  promoteProjectionTables,
} from "./mysql-schema.mjs";
import { normalizeExportDate } from "./projection-transfer-date.mjs";

const selectedNames = (process.argv.find((value) => value.startsWith("--groups="))?.slice("--groups=".length) || "")
  .split(",").filter(Boolean);
const groups = selectedNames.length === 0
  ? DEPLOYMENT_PROJECTION_GROUPS
  : DEPLOYMENT_PROJECTION_GROUPS.filter(({ name }) => selectedNames.includes(name));
if (groups.length === 0 || groups.length !== selectedNames.length && selectedNames.length > 0) throw new Error("Unknown deployment projection group.");
const transferTables = groups.flatMap(({ tables }) => tables);
const manifestTables = groups.map(({ name }) => `projection_transfer_manifest_${name.replaceAll("-", "_")}`);
const indexesTables = groups.map(({ name }) => `projection_transfer_indexes_${name.replaceAll("-", "_")}`);

function databaseOptions(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const url = new URL(connectionString);
  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
  };
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

const connection = await mysql.createConnection(databaseOptions());
try {
  for (const table of manifestTables) if (!await tableExists(connection, table)) throw new Error(`The projection transfer manifest ${table} is missing.`);

  const [publishedResult, ...manifestResults] = await Promise.all([
    connection.query("SELECT value AS export_date FROM export_metadata WHERE `key` = 'export_date' LIMIT 1"),
    ...manifestTables.map((table) => connection.query(`SELECT export_date FROM \`${table}\` LIMIT 1`)),
  ]);
  const transferDates = manifestResults.map(([rows]) => rows[0]?.export_date);
  const transferDate = transferDates[0];
  const publishedDate = publishedResult[0][0]?.export_date;
  const normalizedTransferDate = normalizeExportDate(transferDate);
  const normalizedPublishedDate = normalizeExportDate(publishedDate);
  if (
    !normalizedTransferDate
    || normalizedTransferDate !== normalizedPublishedDate || transferDates.some((date) => normalizeExportDate(date) !== normalizedTransferDate)
  ) {
    throw new Error(
      `Projection export date ${transferDate || "(missing)"} does not match production raw export date ${publishedDate || "(missing)"}.`,
    );
  }

  for (const table of transferTables) {
    const transfer = `${table}_transfer`;
    if (!await tableExists(connection, transfer)) {
      throw new Error(`Transferred projection table ${transfer} is missing.`);
    }
    const [rows] = await connection.query(`SELECT COUNT(*) AS count FROM \`${transfer}\``);
    if (Number(rows[0]?.count ?? 0) === 0) {
      throw new Error(`Transferred projection table ${transfer} is empty.`);
    }
  }

  const deferredIndexes = (await Promise.all(indexesTables.map(async (table) => (await connection.query(`SELECT table_name, index_name, index_sql FROM \`${table}\` ORDER BY table_name, index_name`))[0]))).flat();
  process.stdout.write(`Building ${deferredIndexes.length} deferred projection indexes…\n`);
  const indexesByTable = new Map();
  for (const index of deferredIndexes) {
    const indexes = indexesByTable.get(index.table_name) ?? [];
    indexes.push(index);
    indexesByTable.set(index.table_name, indexes);
  }
  let builtIndexCount = 0;
  for (const [table, indexes] of indexesByTable) {
    const startedAt = performance.now();
    await connection.query(
      `ALTER TABLE \`${table}\` ${indexes.map((index) => index.index_sql).join(", ")}`,
    );
    builtIndexCount += indexes.length;
    process.stdout.write(
      `Built ${indexes.length} indexes on ${table} in ${Math.round(performance.now() - startedAt)}ms (${builtIndexCount}/${deferredIndexes.length}).\n`,
    );
  }

  const renames = [];
  for (const table of transferTables) {
    const staging = `${table}_staging`;
    await dropManagedObject(connection, staging);
    renames.push(`\`${table}_transfer\` TO \`${staging}\``);
  }
  await connection.query(`RENAME TABLE ${renames.join(", ")}`);
  await promoteProjectionTables(connection, { tables: transferTables });
  for (const table of [...indexesTables, ...manifestTables]) await dropManagedObject(connection, table);
  process.stdout.write(`Published transferred projection generation for ${normalizedTransferDate}.\n`);
} finally {
  await connection.end();
}
