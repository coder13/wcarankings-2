// @ts-nocheck
import mysql from "mysql2/promise";
import {
  buildRegisteredProjections,
  promoteRegisteredProjections,
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

const projectionNames = ["competition-event-stats"];
const connection = await mysql.createConnection(databaseOptions());

try {
  const force = hasArgument("force");
  const [existing] = await connection.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_name IN (
         'competition_podium_members',
         'competition_event_stats'
       )`,
  );
  if (existing.length === 2 && !force) {
    process.stdout.write(
      "Competition event stats projection is already present. Nothing to do.\n",
    );
  } else {
    const timings = await buildRegisteredProjections(connection, {
      projectionSuffix: "_staging",
      projectionNames,
    });
    await promoteRegisteredProjections(connection, {
      projectionSuffix: "_staging",
      projectionNames,
    });
    process.stdout.write(`${JSON.stringify({ projections: timings })}\n`);
  }
} finally {
  await connection.end();
}
