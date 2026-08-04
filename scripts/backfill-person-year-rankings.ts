// @ts-nocheck
import { argumentPresent } from "./lib/arguments.ts";
import { databaseOptions } from "./lib/database.ts";
import mysql from "mysql2/promise";
import {
  buildRegisteredProjections,
  promoteRegisteredProjections,
} from "../data-tools/projections/build.ts";

const projectionNames = ["person-year-rankings"];
const connection = await mysql.createConnection(databaseOptions());
try {
  const force = argumentPresent("force");
  const tables = [
    "person_year_ranking_cohorts",
    "person_year_rankings_single",
    "person_year_rankings_average",
    "person_year_ranking_counts",
  ];
  const [existing] = await connection.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN (${tables.map(() => "?").join(", ")})`,
    tables,
  );
  if (existing.length === tables.length && !force)
    process.stdout.write(
      "Yearly person rankings projection is already present. Nothing to do.\n",
    );
  else {
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
