import { argumentPresent } from "./lib/arguments.ts";
import { refreshBoardList, refreshDelegatesList } from "./lib/board-lists.ts";
import { databaseOptions } from "./lib/database.ts";
import { pathToFileURL } from "node:url";
import mysql from "mysql2/promise";

async function main() {
  const connection = await mysql.createConnection(databaseOptions());
  const refreshDelegates = argumentPresent("delegates");
  try {
    if (refreshDelegates) await refreshDelegatesList(connection);
    else await refreshBoardList(connection);
  } finally {
    await connection.end();
  }
  process.stdout.write(
    `${refreshDelegates ? "Delegates" : "Board"} list refreshed.\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
    process.exitCode = 1;
  });
}
