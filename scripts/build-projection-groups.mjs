import mysql from "mysql2/promise";
import { refreshMysqlSchema } from "./mysql-schema.mjs";
import { argumentValue, listArgument } from "./lib/cli.mjs";
import { databaseOptions } from "./lib/database.mjs";

const projectionNames = listArgument("projection-names");
const satisfiedProjectionNames = listArgument("satisfied-projection-names");
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
