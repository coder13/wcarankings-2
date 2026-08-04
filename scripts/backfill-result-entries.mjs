import mysql from "mysql2/promise";
import { PUBLISHED_PROJECTION_TABLES, promoteProjectionTables, refreshMysqlSchema } from "./mysql-schema.mjs";
import { databaseOptions } from "./lib/database.mjs";
import { hasArgument } from "./lib/cli.mjs";

const force = hasArgument("force");
const TABLES = PUBLISHED_PROJECTION_TABLES;

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
    process.stdout.write("Projection generation is already present. Nothing to do.\n");
  } else {
    process.stdout.write("Building a complete staged projection generation…\n");
    await refreshMysqlSchema(connection, { projectionSuffix: "_staging" });
    await promoteProjectionTables(connection);
    process.stdout.write("Projection generation is ready.\n");
  }
} finally {
  await connection.end();
}
