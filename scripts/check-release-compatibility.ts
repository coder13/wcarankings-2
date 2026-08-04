// @ts-nocheck
import { argumentValue } from "./lib/arguments.ts";
import { checkServerDatasetCompatibility } from "./lib/release-compatibility.ts";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { argumentValue } from "./lib/cli.mjs";

async function main() {
  const compatibility = JSON.parse(
    await readFile(argumentValue("compatibility-file"), "utf8"),
  );
  const result = checkServerDatasetCompatibility({
    server: compatibility.server,
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
