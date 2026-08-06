import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { argumentList, argumentValue } from "../../lib/arguments.ts";
import {
  createProjectionReleaseCoordinate,
  PROJECTION_RELEASE_MANIFEST,
  verifyProjectionReleaseCoordinate,
} from "../../../data-tools/projections/artifacts/coordinate.ts";

async function readJsonFile(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const directory = resolve(argumentValue("directory") || ".");
  const groups = argumentList("groups");
  if (command === "create") {
    const rawFile = argumentValue("raw-file");
    const result = await createProjectionReleaseCoordinate({
      directory,
      exportId: argumentValue("export-id"),
      exportDate: argumentValue("export-date"),
      groups,
      fingerprints: await readJsonFile(argumentValue("fingerprints-file")),
      coordinates: await readJsonFile(argumentValue("coordinates-file")),
      sourceSha: argumentValue("source-sha"),
      compatibility: await readJsonFile(argumentValue("compatibility-file")),
      raw: rawFile ? await readJsonFile(rawFile) : null,
    });
    process.stdout.write(
      `${JSON.stringify({ manifest: result.path, sha256: result.sha256 })}\n`,
    );
    return;
  }
  if (command === "verify") {
    const result = await verifyProjectionReleaseCoordinate({
      directory,
      expectedSha256: argumentValue("sha256"),
      expectedGroups: groups,
      expectedExportId: argumentValue("export-id"),
      expectedSourceSha: argumentValue("source-sha"),
    });
    process.stdout.write(
      `${JSON.stringify({ manifest: join(directory, PROJECTION_RELEASE_MANIFEST), sha256: result.sha256 })}\n`,
    );
    return;
  }
  throw new Error("Use projection-release-coordinate.ts create or verify");
}

if (import.meta.main) await main();
