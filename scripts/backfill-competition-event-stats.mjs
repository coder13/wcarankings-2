import mysql from "mysql2/promise";
import {
  buildRegisteredProjections,
  promoteRegisteredProjections,
} from "./mysql-schema.mjs";
import { databaseOptions } from "./lib/database.mjs";
import { hasArgument } from "./lib/cli.mjs";

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
