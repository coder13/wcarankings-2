import { argumentPresent, argumentValue } from "../../lib/arguments.ts";
import { chunkProjectionDump } from "../../../data-tools/projections/transfer/chunk.ts";

async function main(): Promise<void> {
  await chunkProjectionDump({
    rowsPerInsert: Number(argumentValue("rows-per-insert") || 1000),
    importDump: argumentPresent("import"),
    input: process.stdin,
    output: process.stdout,
  });
}

if (import.meta.main) await main();
