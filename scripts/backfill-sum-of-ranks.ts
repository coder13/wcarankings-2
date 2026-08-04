// @ts-nocheck
import { argumentPresent } from "./lib/arguments.ts";
import { databaseOptions } from "./lib/database.ts";
import mysql from "mysql2/promise";
import {
  promoteRegisteredProjections,
  buildRegisteredProjections,
} from "../data-tools/projections/build.ts";

const connection = await mysql.createConnection(databaseOptions());
try {
  const force = argumentPresent("force");
  const [existing] = await connection.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_name IN (
         'person_sum_of_ranks_scores',
         'person_sum_of_ranks_event_values'
       )`,
  );
  const existingNames = new Set(existing.map(({ table_name }) => table_name));
  if (
    existingNames.has("person_sum_of_ranks_scores") &&
    !existingNames.has("person_sum_of_ranks_event_values") &&
    !force
  ) {
    process.stdout.write(
      "Sum of Ranks projection is already present. Nothing to do.\n",
    );
    process.exitCode = 0;
  } else {
    const projectionNames = ["sum-of-ranks"];
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
