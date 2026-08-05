import { checkServerDatasetCompatibility } from "./lib/release-compatibility.ts";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { argumentValue } from "./lib/cli.ts";

interface CompatibilityFile {
  server?: {
    maximumDatasetSchemaVersion?: number;
    minimumDatasetSchemaVersion?: number;
  };
}

function isCompatibilityFile(value: unknown): value is CompatibilityFile {
  return typeof value === "object" && value !== null;
}

async function main() {
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

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  await main();
}
