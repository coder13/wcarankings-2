import { readdir } from "node:fs/promises";
import mysql from "mysql2/promise";
import { databaseOptions } from "./lib/database.mjs";

const LEGACY_TABLE = "flyway_schema_history";
const APP_TABLE = "flyway_schema_history_app";
const RESULTS_TABLE = "flyway_schema_history_results";
const MIGRATIONS_ROOT = process.env.FLYWAY_MIGRATIONS_ROOT || "/app/migrations/mysql";

function identifier(value) {
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(value)) throw new Error(`Unsafe table identifier: ${value}`);
  return `\`${value}\``;
}

async function migrations(directory) {
  return (await readdir(directory)).flatMap((script) => {
    const match = script.match(/^V([^_]+)__.+\.sql$/);
    return match ? [{ version: match[1], script }] : [];
  });
}

async function tableExists(connection, table) {
  const [rows] = await connection.query("SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1", [table]);
  return rows.length > 0;
}

async function copyLane(connection, target, laneMigrations) {
  const versions = laneMigrations.map(({ version }) => version);
  const scripts = laneMigrations.map(({ script }) => script);
  const versionPlaceholders = versions.map(() => "?").join(", ");
  const scriptPlaceholders = scripts.map(() => "?").join(", ");
  await connection.query(`CREATE TABLE IF NOT EXISTS ${identifier(target)} LIKE ${identifier(LEGACY_TABLE)}`);
  // Versions overlap across lanes. Match immutable filenames so an app V8
  // cannot impersonate a results V8 in the split history. Remove only rows
  // whose version is owned by this lane but whose script is not. Flyway's
  // synthetic baseline row has no migration filename, so retain it only in
  // the lane that owns its baseline version.
  await connection.query(
    `DELETE FROM ${identifier(target)}
      WHERE type = 'BASELINE'
        AND (version IS NULL OR version NOT IN (${versionPlaceholders}))`,
    versions,
  );
  await connection.query(
    `DELETE FROM ${identifier(target)}
      WHERE version IN (${versionPlaceholders})
        AND script NOT IN (${scriptPlaceholders})
        AND NOT (type = 'BASELINE' AND version IN (${versionPlaceholders}))`,
    [...versions, ...scripts, ...versions],
  );
  await connection.query(
    `INSERT IGNORE INTO ${identifier(target)}
      SELECT * FROM ${identifier(LEGACY_TABLE)}
      WHERE version IS NULL
         OR script IN (${scriptPlaceholders})
         OR (type = 'BASELINE' AND version IN (${versionPlaceholders}))`,
    [...scripts, ...versions],
  );
}

const connection = await mysql.createConnection(databaseOptions());
try {
  if (!(await tableExists(connection, LEGACY_TABLE))) {
    process.stdout.write("No legacy Flyway history table found; fresh databases need no transition.\n");
  } else {
    const [appMigrations, resultMigrations] = await Promise.all([
      migrations(`${MIGRATIONS_ROOT}/app`),
      migrations(`${MIGRATIONS_ROOT}/results`),
    ]);
    await copyLane(connection, APP_TABLE, appMigrations);
    await copyLane(connection, RESULTS_TABLE, resultMigrations);
    process.stdout.write(`Prepared ${APP_TABLE} and ${RESULTS_TABLE} from ${LEGACY_TABLE}.\n`);
  }
} finally {
  await connection.end();
}
