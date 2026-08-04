// @ts-nocheck
import { argumentPresent } from "./lib/arguments.ts";
import { databaseOptions } from "./lib/database.ts";
import mysql from "mysql2/promise";
import {
  buildRegisteredProjections,
  promoteRegisteredProjections,
} from "../data-tools/projections/build.ts";

const projectionNames = ["result-ranking-counts"];
const connection = await mysql.createConnection(databaseOptions());

try {
  const force = argumentPresent("force");
  const [existing] = await connection.query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name IN (
          'result_rankings_single',
          'result_rankings_average',
          'result_ranking_counts'
        )`,
  );
  if (existing.length === 3 && !force) {
    process.stdout.write(
      "Result rankings projection is already present. Nothing to do.\n",
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
