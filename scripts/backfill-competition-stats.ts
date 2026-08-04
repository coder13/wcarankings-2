// @ts-nocheck
import mysql from "mysql2/promise";
import {
  dropManagedObject,
  PROJECTION_REGISTRY,
} from "../data-tools/projections/build.ts";

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

const projection = PROJECTION_REGISTRY.find(
  ({ name }) => name === "competition-stats",
);
if (!projection) throw new Error("competition-stats is not registered");

const connection = await mysql.createConnection(databaseOptions());
try {
  const stagingTable = "competition_stats_staging";
  const previousTable = "competition_stats_previous";
  await dropManagedObject(connection, stagingTable);
  const startedAt = performance.now();
  await projection.build(connection, "_staging");
  const rowCounts = await projection.validate(connection, "_staging");
  await dropManagedObject(connection, previousTable);
  const [existing] = await connection.query(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = 'competition_stats'`,
  );
  const renames = existing.length > 0
    ? "`competition_stats` TO `competition_stats_previous`, `competition_stats_staging` TO `competition_stats`"
    : "`competition_stats_staging` TO `competition_stats`";
  await connection.query(`RENAME TABLE ${renames}`);
  await dropManagedObject(connection, previousTable);
  process.stdout.write(`${JSON.stringify({
    durationMs: Math.round(performance.now() - startedAt),
    rowCounts,
  })}\n`);
} finally {
  await connection.end();
}
