import mysql from "mysql2/promise";
import { refreshMysqlSchema } from "./mysql-schema.mjs";

function argumentValue(name) {
  const prefix = `--${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : "";
}

function listArgument(name) {
  return argumentValue(name).split(",").map((value) => value.trim()).filter(Boolean);
}

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
