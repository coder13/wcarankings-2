import mysql from "mysql2/promise";
import { promoteResultEntriesSchema, refreshResultEntriesSchema } from "./mysql-schema.mjs";

const force = process.argv.includes("--force");
const TABLES = ["result_entries_single", "result_counts"];

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

async function projectionExists(connection) {
  const [rows] = await connection.query(
    `SELECT table_name AS name FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name IN (${TABLES.map(() => "?").join(", ")})`,
    TABLES,
  );
  return rows.length === TABLES.length;
}

const connection = await mysql.createConnection(databaseOptions());
try {
  if (!force && await projectionExists(connection)) {
    process.stdout.write("Result-level single projection is already present. Nothing to do.\n");
  } else {
    process.stdout.write("Building staged result-level single projection from existing WCA results…\n");
    await refreshResultEntriesSchema(connection, { projectionSuffix: "_staging" });
    await promoteResultEntriesSchema(connection);
    process.stdout.write("Result-level single projection is ready.\n");
  }
} finally {
  await connection.end();
}
