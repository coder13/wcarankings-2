import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export function checkServerDatasetCompatibility({ server, datasetSchemaVersion }) {
  const version = Number(datasetSchemaVersion);
  const minimum = Number(server?.minimumDatasetSchemaVersion);
  const maximum = Number(server?.maximumDatasetSchemaVersion);
  if (![version, minimum, maximum].every(Number.isInteger)) {
    throw new Error("Compatibility versions must be integers");
  }
  if (version < minimum || version > maximum) {
    throw new Error(
      `Dataset schema version ${version} is outside the server's supported range ${minimum}-${maximum}`,
    );
  }
  return { compatible: true, datasetSchemaVersion: version, minimum, maximum };
}

function argumentValue(name) {
  const prefix = `--${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : "";
}

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

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}
