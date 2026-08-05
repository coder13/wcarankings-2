import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { argumentList, argumentValue } from "../../lib/arguments.ts";
import {
  createProjectionReleaseManifest,
  PROJECTION_RELEASE_MANIFEST,
  verifyProjectionReleaseManifest,
} from "../../../data-tools/projections/artifacts/manifest.ts";

async function readJsonFile(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const directory = resolve(argumentValue("directory") || ".");
  const groups = argumentList("groups");
  if (command === "create") {
    const artifactDigestsFile = argumentValue("artifact-digests-file");
    const result = await createProjectionReleaseManifest({
      directory,
      exportId: argumentValue("export-id"),
      exportDate: argumentValue("export-date"),
      groups,
      fingerprints: await readJsonFile(argumentValue("fingerprints-file")),
      sourceSha: argumentValue("source-sha"),
      sourceTree: argumentValue("source-tree"),
      compatibility: await readJsonFile(argumentValue("compatibility-file")),
      rawFile: argumentValue("raw-file") || undefined,
      artifactDigests: artifactDigestsFile
        ? await readJsonFile(artifactDigestsFile)
        : {},
    });
    process.stdout.write(
      `${JSON.stringify({
        manifest: result.manifestPath,
        sha256: result.manifestSha256,
      })}\n`,
    );
    return;
  }
  if (command === "verify") {
    const fingerprintsFile = argumentValue("fingerprints-file");
    const result = await verifyProjectionReleaseManifest({
      directory,
      expectedSha256: argumentValue("sha256"),
      expectedGroups: groups,
      expectedExportId: argumentValue("export-id"),
      expectedSourceSha: argumentValue("source-sha"),
      expectedFingerprints: fingerprintsFile
        ? await readJsonFile(fingerprintsFile)
        : undefined,
    });
    process.stdout.write(
      `${JSON.stringify({
        manifest: join(directory, PROJECTION_RELEASE_MANIFEST),
        sha256: result.manifestSha256,
        groups: Object.keys(result.manifest.groups),
      })}\n`,
    );
    return;
  }
  throw new Error("Use projection-release-artifact.ts create or verify");
}

if (import.meta.main) await main();
