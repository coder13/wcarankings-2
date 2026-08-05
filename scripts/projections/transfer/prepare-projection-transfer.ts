import mysql from "mysql2/promise";
import { argumentValue } from "../../lib/arguments.ts";
import { databaseOptions } from "../../lib/database.ts";
import { projectionGroup } from "../../../data-tools/projection-catalog/groups.ts";
import { prepareProjectionTransfer } from "../../../data-tools/projections/transfer/prepare.ts";

async function main(): Promise<void> {
  const group = projectionGroup(argumentValue("group"));
  const connection = await mysql.createConnection(databaseOptions());
  try {
    const result = await prepareProjectionTransfer({ connection, group });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await connection.end();
  }
}

if (import.meta.main) await main();
