import { readdir } from "node:fs/promises";
import mysql from "mysql2/promise";

const LEGACY_TABLE = "flyway_schema_history";
const APP_TABLE = "flyway_schema_history_app";
const RESULTS_TABLE = "flyway_schema_history_results";

function databaseOptions(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const url = new URL(connectionString);
  return { host: url.hostname, port: Number(url.port || 3306), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database: decodeURIComponent(url.pathname.replace(/^\//, "")) };
}

function identifier(value) {
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(value)) throw new Error(`Unsafe table identifier: ${value}`);
  return `\`${value}\``;
}

async function migrationVersions(directory) {
  return (await readdir(directory)).map((file) => file.match(/^V([^_]+)__/)).filter(Boolean).map((match) => match[1]);
}

async function tableExists(connection, table) {
  const [rows] = await connection.query("SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1", [table]);
  return rows.length > 0;
}

async function copyLane(connection, target, versions) {
  const placeholders = versions.map(() => "?").join(", ");
  await connection.query(`CREATE TABLE IF NOT EXISTS ${identifier(target)} LIKE ${identifier(LEGACY_TABLE)}`);
  await connection.query(`INSERT IGNORE INTO ${identifier(target)} SELECT * FROM ${identifier(LEGACY_TABLE)} WHERE version IS NULL OR version IN (${placeholders})`, versions);
}

const connection = await mysql.createConnection(databaseOptions());
try {
  if (!(await tableExists(connection, LEGACY_TABLE))) {
    process.stdout.write("No legacy Flyway history table found; fresh databases need no transition.\n");
  } else {
    const [appVersions, resultVersions] = await Promise.all([migrationVersions("/app/migrations/mysql/app"), migrationVersions("/app/migrations/mysql/results")]);
    await copyLane(connection, APP_TABLE, appVersions);
    await copyLane(connection, RESULTS_TABLE, resultVersions);
    process.stdout.write(`Prepared ${APP_TABLE} and ${RESULTS_TABLE} from ${LEGACY_TABLE}.\n`);
  }
} finally {
  await connection.end();
}
