import { databaseOptions } from "./lib/database.ts";
import { refreshSystemLists } from "./lib/system-lists.ts";
import { pathToFileURL } from "node:url";
import mysql from "mysql2/promise";

async function main() {
  const connection = await mysql.createConnection(databaseOptions());
  try {
    await refreshSystemLists(connection);
  } finally {
    await connection.end();
  }
  process.stdout.write("System lists refreshed.\n");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
    process.exitCode = 1;
  });
}
