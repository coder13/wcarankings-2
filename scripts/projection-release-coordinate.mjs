import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  MARIADB_COMPATIBILITY_VERSION,
  PROJECTION_ARTIFACT_FORMAT_VERSION,
  projectionGroup,
} from "./projection-groups.mjs";

export const PROJECTION_RELEASE_MANIFEST = "projection-release.json";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function argumentValue(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || "";
}

function validateCoordinate(group, coordinate) {
  if (!coordinate?.ref?.startsWith("ghcr.io/") || !/@sha256:[0-9a-f]{64}$/.test(coordinate.ref)) {
    throw new Error(`Projection group ${group} does not have a digest-qualified GHCR reference`);
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(coordinate.digest || "")) {
    throw new Error(`Projection group ${group} has an invalid digest`);
  }
  if (!coordinate.ref.endsWith(`@${coordinate.digest}`)) {
    throw new Error(`Projection group ${group} reference and digest disagree`);
  }
}

export async function createProjectionReleaseCoordinate({
  directory,
  exportId,
  exportDate,
  groups,
  fingerprints,
  coordinates,
  sourceSha,
  compatibility,
  raw,
}) {
  const manifestGroups = {};
  for (const groupName of groups) {
    const group = projectionGroup(groupName);
    const fingerprint = fingerprints?.groups?.[groupName];
    const coordinate = coordinates?.[groupName];
    if (!fingerprint?.semanticFingerprint || !fingerprint?.artifactFingerprint) {
      throw new Error(`Projection group ${groupName} is missing fingerprints`);
    }
    validateCoordinate(groupName, coordinate);
    manifestGroups[groupName] = {
      semanticFingerprint: fingerprint.semanticFingerprint,
      artifactFingerprint: fingerprint.artifactFingerprint,
      artifactDigest: coordinate.digest,
      artifactRef: coordinate.ref,
      tables: group.tables,
      transferTables: [
        ...group.tables.map((table) => `${table}_transfer`),
        `projection_transfer_manifest_${groupName.replaceAll("-", "_")}`,
        `projection_transfer_indexes_${groupName.replaceAll("-", "_")}`,
      ],
      exportDate: exportId,
    };
  }
  if (raw) {
    if (!raw.ref?.startsWith("ghcr.io/") || !/@sha256:[0-9a-f]{64}$/.test(raw.ref)) {
      throw new Error("Raw export coordinate is invalid");
    }
    if (!/^sha256:[0-9a-f]{64}$/.test(raw.digest || "") || !raw.ref.endsWith(`@${raw.digest}`)) {
      throw new Error("Raw export digest is invalid");
    }
    if (!raw.file || !Number.isSafeInteger(raw.bytes) || !/^[0-9a-f]{64}$/.test(raw.sha256 || "")) {
      throw new Error("Raw export metadata is incomplete");
    }
  }
  const manifest = {
    version: 3,
    compatibility: {
      artifactFormatVersion: Number(compatibility.artifactFormatVersion),
      datasetSchemaVersion: Number(compatibility.datasetSchemaVersion),
    },
    mariaDbCompatibilityVersion: MARIADB_COMPATIBILITY_VERSION,
    exportId: String(exportId),
    exportDate: String(exportDate || exportId).slice(0, 10),
    sourceSha,
    createdAt: new Date().toISOString(),
    groups: manifestGroups,
    raw: raw || null,
  };
  const path = join(directory, PROJECTION_RELEASE_MANIFEST);
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, path, sha256: sha256(await readFile(path)) };
}

export async function verifyProjectionReleaseCoordinate({
  directory,
  expectedSha256,
  expectedGroups,
  expectedExportId,
  expectedSourceSha,
}) {
  const path = join(directory, PROJECTION_RELEASE_MANIFEST);
  const content = await readFile(path);
  const actualSha256 = sha256(content);
  if (expectedSha256 && actualSha256 !== expectedSha256) {
    throw new Error(`Projection release manifest checksum ${actualSha256} does not match ${expectedSha256}`);
  }
  const manifest = JSON.parse(content);
  if (manifest.version !== 3) throw new Error("A version 3 generation manifest is required");
  if (manifest.compatibility?.artifactFormatVersion !== PROJECTION_ARTIFACT_FORMAT_VERSION) {
    throw new Error("Projection release artifact format is incompatible");
  }
  if (manifest.mariaDbCompatibilityVersion !== MARIADB_COMPATIBILITY_VERSION) {
    throw new Error("Projection release MariaDB compatibility is invalid");
  }
  if (expectedExportId && String(manifest.exportId) !== String(expectedExportId)) {
    throw new Error(`Projection export ${manifest.exportId} does not match ${expectedExportId}`);
  }
  if (expectedSourceSha && manifest.sourceSha !== expectedSourceSha) {
    throw new Error(`Projection source ${manifest.sourceSha || "missing"} does not match ${expectedSourceSha}`);
  }
  const groups = expectedGroups?.length ? expectedGroups : Object.keys(manifest.groups || {});
  for (const group of groups) {
    projectionGroup(group);
    validateCoordinate(group, {
      ref: manifest.groups?.[group]?.artifactRef,
      digest: manifest.groups?.[group]?.artifactDigest,
    });
  }
  if (groups.length !== Object.keys(manifest.groups || {}).length) {
    throw new Error("Projection release contains an unexpected group set");
  }
  return { manifest, sha256: actualSha256 };
}

async function cli() {
  const command = process.argv[2];
  const directory = resolve(argumentValue("directory") || ".");
  const groups = argumentValue("groups").split(",").filter(Boolean);
  if (command === "create") {
    const fingerprints = JSON.parse(await readFile(argumentValue("fingerprints-file"), "utf8"));
    const coordinates = JSON.parse(await readFile(argumentValue("coordinates-file"), "utf8"));
    const compatibility = JSON.parse(await readFile(argumentValue("compatibility-file"), "utf8"));
    const raw = argumentValue("raw-file")
      ? JSON.parse(await readFile(argumentValue("raw-file"), "utf8"))
      : null;
    const result = await createProjectionReleaseCoordinate({
      directory,
      exportId: argumentValue("export-id"),
      exportDate: argumentValue("export-date"),
      groups,
      fingerprints,
      coordinates,
      sourceSha: argumentValue("source-sha"),
      compatibility,
      raw,
    });
    process.stdout.write(`${JSON.stringify({ manifest: result.path, sha256: result.sha256 })}\n`);
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
    process.stdout.write(`${JSON.stringify({ manifest: join(directory, PROJECTION_RELEASE_MANIFEST), sha256: result.sha256 })}\n`);
    return;
  }
  throw new Error("Use projection-release-coordinate.mjs create or verify");
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await cli();
