import { resolve } from "node:path";
import { argumentValue } from "@wcarankings/cli";
import { exportProjectionTransfer } from "../../../data-tools/projections/transfer/export.ts";

async function main(): Promise<void> {
  const metadata = argumentValue("metadata");
  const output = argumentValue("output");
  if (!metadata || !output) {
    throw new Error("--metadata and --output are required");
  }
  await exportProjectionTransfer({
    metadataPath: resolve(metadata),
    outputPath: resolve(output),
  });
}

if (import.meta.main) await main();
