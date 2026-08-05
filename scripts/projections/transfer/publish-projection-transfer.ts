import mysql from "mysql2/promise";
import {
  argumentList,
  argumentPresent,
  argumentValue,
} from "../../lib/arguments.ts";
import { databaseOptions } from "../../lib/database.ts";
import {
  DEPLOYMENT_PROJECTION_GROUPS,
  projectionGroup,
} from "../../../data-tools/projection-catalog/groups.ts";
import { publishProjectionTransfer } from "../../../data-tools/projections/transfer/publish.ts";
import type { ProjectionTransferPublishMode } from "../../../data-tools/projections/transfer/types.ts";

function publishMode(): ProjectionTransferPublishMode {
  const prepareOnly = argumentPresent("prepare-only");
  const hydrate = argumentPresent("hydrate");
  if (prepareOnly && hydrate) {
    throw new Error("--prepare-only and --hydrate cannot be combined");
  }
  if (prepareOnly) return "prepare";
  if (hydrate) return "hydrate";
  return "publish";
}

async function main(): Promise<void> {
  const selectedNames = argumentList("groups");
  const groups =
    selectedNames.length > 0
      ? selectedNames.map((name) => projectionGroup(name))
      : DEPLOYMENT_PROJECTION_GROUPS;
  const indexConcurrency = Number(
    process.env.WCA_PROJECTION_INDEX_CONCURRENCY ?? 2,
  );
  if (
    !Number.isSafeInteger(indexConcurrency) ||
    indexConcurrency < 1 ||
    indexConcurrency > 4
  ) {
    throw new Error("WCA_PROJECTION_INDEX_CONCURRENCY must be between 1 and 4");
  }
  const options = databaseOptions(undefined, {
    databaseName: process.env.DATABASE_NAME_OVERRIDE,
  });
  const connection = await mysql.createConnection(options);
  try {
    const result = await publishProjectionTransfer({
      connection,
      createConnection: () => mysql.createConnection(options),
      groups,
      expectedExportDate: argumentValue("expected-export-date") || undefined,
      indexConcurrency,
      mode: publishMode(),
      log: (message) =>
        process.stderr.write(`[projection-transfer] ${message}\n`),
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await connection.end();
  }
}

if (import.meta.main) await main();
