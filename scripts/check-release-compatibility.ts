import { readFile } from "node:fs/promises";
import { checkServerDatasetCompatibility } from "../data-tools/projections/deployment/compatibility.ts";
import type { ServerDatasetCompatibility } from "../data-tools/projections/deployment/types.ts";
import { argumentValue } from "./lib/cli.ts";

interface CompatibilityFile {
  server?: ServerDatasetCompatibility;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isServerDatasetCompatibility(
  value: unknown,
): value is ServerDatasetCompatibility {
  if (!isRecord(value)) return false;
  const minimum = value.minimumDatasetSchemaVersion;
  const maximum = value.maximumDatasetSchemaVersion;
  return (
    (minimum === undefined || typeof minimum === "number") &&
    (maximum === undefined || typeof maximum === "number")
  );
}

function isCompatibilityFile(value: unknown): value is CompatibilityFile {
  if (!isRecord(value)) return false;
  return (
    value.server === undefined || isServerDatasetCompatibility(value.server)
  );
}

async function main(): Promise<void> {
  const parsedCompatibility: unknown = JSON.parse(
    await readFile(argumentValue("compatibility-file"), "utf8"),
  );
  if (!isCompatibilityFile(parsedCompatibility)) {
    throw new Error("Compatibility file must contain an object.");
  }
  const result = checkServerDatasetCompatibility({
    server: parsedCompatibility.server,
    datasetSchemaVersion: argumentValue("dataset-schema-version"),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.main) await main();
