import { databaseOptions } from "./lib/database.ts";
import mysql from "mysql2/promise";
import { refreshMysqlSchema } from "../data-tools/projections/build.ts";

const connection = await mysql.createConnection(databaseOptions());
try {
  await refreshMysqlSchema(connection, {
    createConnection: () => mysql.createConnection(databaseOptions()),
  });
  process.stdout.write("Ranking projections refreshed.\n");
} finally {
  await connection.end();
}
