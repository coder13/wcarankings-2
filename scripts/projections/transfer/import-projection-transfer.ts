import { resolve } from "node:path";
import { argumentValue } from "../../lib/arguments.ts";
import { databaseOptions } from "../../lib/database.ts";
import { importProjectionTransfer } from "../../../data-tools/projections/transfer/import.ts";

async function main(): Promise<void> {
  const directory = argumentValue("directory");
  const metadata = argumentValue("metadata");
  if (!directory || !metadata) {
    throw new Error("--directory and --metadata are required");
  }
  const concurrency = Number(
    argumentValue("concurrency") ||
      process.env.WCA_PROJECTION_IMPORT_CONCURRENCY ||
      2,
  );
  if (
    !Number.isSafeInteger(concurrency) ||
    concurrency < 1 ||
    concurrency > 4
  ) {
    throw new Error("Projection import concurrency must be between 1 and 4");
  }
  const result = await importProjectionTransfer({
    directory: resolve(directory),
    metadataPath: resolve(metadata),
    concurrency,
    options: databaseOptions(undefined, {
      databaseName: process.env.DATABASE_NAME_OVERRIDE,
    }),
    log: (message) =>
      process.stderr.write(`[projection-transfer] ${message}\n`),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.main) await main();
