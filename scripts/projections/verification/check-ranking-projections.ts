import mysql from "mysql2/promise";
import { databaseOptions } from "../../lib/database.ts";
import { inspectRankingProjections } from "../../../data-tools/projections/verification/check.ts";

async function main(): Promise<void> {
  const connection = await mysql.createConnection(databaseOptions());
  try {
    const result = await inspectRankingProjections(connection);
    if (!result.ready) {
      throw new Error(
        `Ranking projections need rebuilding:\n- ${result.issues.join("\n- ")}`,
      );
    }
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await connection.end();
  }
}

if (import.meta.main) {
  await main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.stderr.write(
      "Run Flyway migrations, then backfill the missing active projection or rebuild all projections with /app/scripts/refresh-rankings.ts.\n",
    );
    process.exitCode = 1;
  });
}
