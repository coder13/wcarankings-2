import { argumentList, argumentValue } from "../../lib/arguments.ts";
import { databaseOptions } from "../../lib/database.ts";
import mysql from "mysql2/promise";
import { refreshMysqlSchema } from "../../../data-tools/projections/build.ts";

const projectionNames = argumentList("projection-names");
const satisfiedProjectionNames = argumentList("satisfied-projection-names");
const includeRankingTablesValue = argumentValue("include-ranking-tables");
const useDefaultBuild =
  projectionNames.length === 0 && includeRankingTablesValue === "";
const includeRankingTables =
  useDefaultBuild || includeRankingTablesValue === "true";
const selectedProjectionNames = useDefaultBuild ? undefined : projectionNames;

const options = databaseOptions();
const connection = await mysql.createConnection(options);
try {
  await refreshMysqlSchema(connection, {
    projectionNames: selectedProjectionNames,
    satisfiedProjectionNames,
    includeRankingTables,
    createConnection: () => mysql.createConnection(options),
  });
} finally {
  await connection.end();
}
