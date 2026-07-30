import mysql from "mysql2/promise";
import { refreshMysqlSchema } from "./mysql-schema.mjs";

function databaseOptions(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const url = new URL(connectionString);
  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
    multipleStatements: false,
  };
}

const connection = await mysql.createConnection(databaseOptions());
try {
  await refreshMysqlSchema(connection, {
    createConnection: () => mysql.createConnection(databaseOptions()),
  });
  process.stdout.write("Ranking projections refreshed.\n");
} finally {
  await connection.end();
}
