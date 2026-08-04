// @ts-nocheck
import { argumentList, argumentValue } from "../../lib/arguments.ts";
import { databaseOptions } from "../../lib/database.ts";
import mysql from "mysql2/promise";
import { refreshMysqlSchema } from "../../../data-tools/projections/build.ts";

const projectionNames = argumentList("projection-names");
const satisfiedProjectionNames = argumentList("satisfied-projection-names");
const includeCompatibility = argumentValue("include-compatibility") === "true";

if (projectionNames.length === 0 && !includeCompatibility) {
  throw new Error("No projection work was selected");
}

const options = databaseOptions();
const connection = await mysql.createConnection(options);
try {
  await refreshMysqlSchema(connection, {
    projectionNames,
    satisfiedProjectionNames,
    includeCompatibility,
    createConnection: () => mysql.createConnection(options),
  });
} finally {
  await connection.end();
}
