import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { projectionGroup } from "../../projection-catalog/groups.ts";
import {
  MARIADB_COMPATIBILITY_VERSION,
  PROJECTION_ARTIFACT_FORMAT_VERSION,
} from "../../projection-catalog/registry.ts";
import type {
  ArtifactCoordinate,
  CoordinateManifestGroup,
  CreateProjectionReleaseCoordinateOptions,
  CreateProjectionReleaseCoordinateResult,
  ProjectionReleaseCoordinateManifest,
  RawArtifactCoordinate,
  VerifyProjectionReleaseCoordinateOptions,
  VerifyProjectionReleaseCoordinateResult,
} from "./types.ts";
import {
  compatibilityFrom,
  isRecord,
  nestedProperty,
  PROJECTION_RELEASE_MANIFEST,
  sha256,
  stringProperty,
} from "./files.ts";

export { PROJECTION_RELEASE_MANIFEST } from "./files.ts";

function validateCoordinate(group: string, value: unknown): ArtifactCoordinate {
  const ref = stringProperty(value, "ref") ?? "";
  const digest = stringProperty(value, "digest") ?? "";
  if (!ref.startsWith("ghcr.io/") || !/@sha256:[0-9a-f]{64}$/.test(ref)) {
    throw new Error(
      `Projection group ${group} does not have a digest-qualified GHCR reference`,
    );
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(digest)) {
    throw new Error(`Projection group ${group} has an invalid digest`);
  }
  if (!ref.endsWith(`@${digest}`)) {
    throw new Error(`Projection group ${group} reference and digest disagree`);
  }
  return { ref, digest };
}

function validateRawCoordinate(value: unknown): RawArtifactCoordinate {
  const coordinate = validateCoordinate("raw export", value);
  const file = stringProperty(value, "file") ?? "";
  const bytes = Number(nestedProperty(value, "bytes"));
  const contentSha256 = stringProperty(value, "sha256") ?? "";
  if (
    !file ||
    !Number.isSafeInteger(bytes) ||
    !/^[0-9a-f]{64}$/.test(contentSha256)
  ) {
    throw new Error("Raw export metadata is incomplete");
  }
  return { ...coordinate, file, bytes, sha256: contentSha256 };
}

function parseManifest(value: unknown): ProjectionReleaseCoordinateManifest {
  if (!isRecord(value) || value.version !== 3) {
    throw new Error("A version 3 generation manifest is required");
  }
  const compatibility = compatibilityFrom(value.compatibility);
  const groupsValue = value.groups;
  if (!isRecord(groupsValue)) {
    throw new Error("Projection release groups are invalid");
  }
  const groups: Record<string, CoordinateManifestGroup> = {};
  for (const [name, entry] of Object.entries(groupsValue)) {
    const coordinate = validateCoordinate(name, {
      ref: stringProperty(entry, "artifactRef"),
      digest: stringProperty(entry, "artifactDigest"),
    });
    const tables = nestedProperty(entry, "tables");
    const transferTables = nestedProperty(entry, "transferTables");
    if (
      !Array.isArray(tables) ||
      !tables.every((table) => typeof table === "string") ||
      !Array.isArray(transferTables) ||
      !transferTables.every((table) => typeof table === "string")
    ) {
      throw new Error(`Projection group ${name} has invalid table ownership`);
    }
    groups[name] = {
      semanticFingerprint: stringProperty(entry, "semanticFingerprint") ?? "",
      artifactFingerprint: stringProperty(entry, "artifactFingerprint") ?? "",
      artifactDigest: coordinate.digest,
      artifactRef: coordinate.ref,
      tables,
      transferTables,
      exportDate: stringProperty(entry, "exportDate") ?? "",
    };
  }
  const raw = value.raw === null ? null : validateRawCoordinate(value.raw);
  return {
    version: 3,
    compatibility,
    mariaDbCompatibilityVersion:
      stringProperty(value, "mariaDbCompatibilityVersion") ?? "",
    exportId: String(value.exportId ?? ""),
    exportDate: String(value.exportDate ?? ""),
    sourceSha: stringProperty(value, "sourceSha") ?? "",
    createdAt: stringProperty(value, "createdAt") ?? "",
    groups,
    raw,
  };
}

export async function createProjectionReleaseCoordinate(
  options: CreateProjectionReleaseCoordinateOptions,
): Promise<CreateProjectionReleaseCoordinateResult> {
  const compatibility = compatibilityFrom(options.compatibility);
  const manifestGroups: Record<string, CoordinateManifestGroup> = {};
  for (const groupName of options.groups) {
    const group = projectionGroup(groupName);
    const fingerprint = nestedProperty(
      nestedProperty(options.fingerprints, "groups"),
      groupName,
    );
    const semanticFingerprint = stringProperty(
      fingerprint,
      "semanticFingerprint",
    );
    const artifactFingerprint = stringProperty(
      fingerprint,
      "artifactFingerprint",
    );
    if (!semanticFingerprint || !artifactFingerprint) {
      throw new Error(`Projection group ${groupName} is missing fingerprints`);
    }
    const coordinate = validateCoordinate(
      groupName,
      nestedProperty(options.coordinates, groupName),
    );
    manifestGroups[groupName] = {
      semanticFingerprint,
      artifactFingerprint,
      artifactDigest: coordinate.digest,
      artifactRef: coordinate.ref,
      tables: group.tables,
      transferTables: [
        ...group.tables.map((table) => `${table}_transfer`),
        `projection_transfer_manifest_${groupName.replaceAll("-", "_")}`,
        `projection_transfer_indexes_${groupName.replaceAll("-", "_")}`,
      ],
      exportDate: options.exportId,
    };
  }
  const raw = options.raw ? validateRawCoordinate(options.raw) : null;
  const manifest: ProjectionReleaseCoordinateManifest = {
    version: 3,
    compatibility,
    mariaDbCompatibilityVersion: MARIADB_COMPATIBILITY_VERSION,
    exportId: options.exportId,
    exportDate: String(options.exportDate || options.exportId).slice(0, 10),
    sourceSha: options.sourceSha,
    createdAt: new Date().toISOString(),
    groups: manifestGroups,
    raw,
  };
  const path = join(options.directory, PROJECTION_RELEASE_MANIFEST);
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, path, sha256: sha256(await readFile(path)) };
}

export async function verifyProjectionReleaseCoordinate(
  options: VerifyProjectionReleaseCoordinateOptions,
): Promise<VerifyProjectionReleaseCoordinateResult> {
  const path = join(options.directory, PROJECTION_RELEASE_MANIFEST);
  const content = await readFile(path);
  const actualSha256 = sha256(content);
  if (options.expectedSha256 && actualSha256 !== options.expectedSha256) {
    throw new Error(
      `Projection release manifest checksum ${actualSha256} does not match ${options.expectedSha256}`,
    );
  }
  const manifest = parseManifest(JSON.parse(content.toString("utf8")));
  if (
    manifest.compatibility.artifactFormatVersion !==
    PROJECTION_ARTIFACT_FORMAT_VERSION
  ) {
    throw new Error("Projection release artifact format is incompatible");
  }
  if (manifest.mariaDbCompatibilityVersion !== MARIADB_COMPATIBILITY_VERSION) {
    throw new Error("Projection release MariaDB compatibility is invalid");
  }
  if (
    options.expectedExportId &&
    manifest.exportId !== options.expectedExportId
  ) {
    throw new Error(
      `Projection export ${manifest.exportId} does not match ${options.expectedExportId}`,
    );
  }
  if (
    options.expectedSourceSha &&
    manifest.sourceSha !== options.expectedSourceSha
  ) {
    throw new Error(
      `Projection source ${manifest.sourceSha || "missing"} does not match ${options.expectedSourceSha}`,
    );
  }
  const groups = options.expectedGroups?.length
    ? options.expectedGroups
    : Object.keys(manifest.groups);
  for (const group of groups) {
    projectionGroup(group);
    const entry = manifest.groups[group];
    if (!entry) {
      throw new Error(`Projection release is missing group ${group}`);
    }
    validateCoordinate(group, {
      ref: entry.artifactRef,
      digest: entry.artifactDigest,
    });
  }
  if (groups.length !== Object.keys(manifest.groups).length) {
    throw new Error("Projection release contains an unexpected group set");
  }
  return { manifest, sha256: actualSha256 };
}
