import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { projectionGroup } from "../../projection-catalog/groups.ts";
import {
  MARIADB_COMPATIBILITY_VERSION,
  PROJECTION_ARTIFACT_FORMAT_VERSION,
} from "../../projection-catalog/registry.ts";
import {
  artifactMetadata,
  compatibilityFrom,
  isRecord,
  nestedProperty,
  parseArtifactMetadata,
  PROJECTION_RELEASE_MANIFEST,
  sha256,
  stringArray,
  stringProperty,
  transferMetadata,
} from "./files.ts";
import type {
  ProjectionReleaseManifest,
  ProjectionReleaseManifestGroup,
  ReleaseArtifactMetadata,
  VerifyProjectionReleaseManifestOptions,
  VerifyProjectionReleaseManifestResult,
} from "./types.ts";

function parseManifest(value: unknown): ProjectionReleaseManifest {
  if (!isRecord(value) || value.version !== 3) {
    throw new Error(
      `Unsupported projection release manifest version: ${isRecord(value) ? String(value.version) : "missing"}`,
    );
  }
  const compatibility = compatibilityFrom(value.compatibility);
  if (!isRecord(value.groups)) {
    throw new Error("Projection release groups are invalid");
  }
  const groups: Record<string, ProjectionReleaseManifestGroup> = {};
  for (const [name, entry] of Object.entries(value.groups)) {
    if (!isRecord(entry)) {
      throw new Error(`Projection release group ${name} is invalid`);
    }
    groups[name] = {
      semanticFingerprint: stringProperty(entry, "semanticFingerprint") ?? "",
      artifactFingerprint: stringProperty(entry, "artifactFingerprint") ?? "",
      artifactDigest: stringProperty(entry, "artifactDigest") ?? null,
      tables: stringArray(entry.tables, `${name} tables`),
      transferTables: stringArray(
        entry.transferTables,
        `${name} transfer tables`,
      ),
      exportDate: stringProperty(entry, "exportDate") ?? "",
      archive: parseArtifactMetadata(entry.archive, `${name} archive`),
      metadata: parseArtifactMetadata(entry.metadata, `${name} metadata`),
    };
  }
  return {
    version: 3,
    compatibility,
    mariaDbCompatibilityVersion:
      stringProperty(value, "mariaDbCompatibilityVersion") ?? "",
    exportId: String(value.exportId ?? ""),
    exportDate: String(value.exportDate ?? ""),
    sourceSha: stringProperty(value, "sourceSha") ?? null,
    sourceTree: stringProperty(value, "sourceTree") ?? null,
    createdAt: stringProperty(value, "createdAt") ?? "",
    groups,
    raw:
      value.raw === null
        ? null
        : parseArtifactMetadata(value.raw, "Raw release artifact"),
  };
}

async function verifyArtifact(
  directory: string,
  expected: ReleaseArtifactMetadata,
): Promise<void> {
  const actual = await artifactMetadata(directory, expected.file);
  if (actual.sha256 !== expected.sha256 || actual.bytes !== expected.bytes) {
    throw new Error(
      `Projection release artifact ${expected.file} failed verification`,
    );
  }
}

export async function verifyProjectionReleaseManifest(
  options: VerifyProjectionReleaseManifestOptions = {},
): Promise<VerifyProjectionReleaseManifestResult> {
  const { directory } = options;
  if (!directory) throw new Error("directory is required");
  const manifestPath = join(directory, PROJECTION_RELEASE_MANIFEST);
  const content = await readFile(manifestPath);
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
    throw new Error(
      "Projection release artifact format is not compatible with this data-tools build",
    );
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
      `Projection source ${manifest.sourceSha || "(missing)"} does not match ${options.expectedSourceSha}`,
    );
  }
  const groups = options.expectedGroups?.length
    ? options.expectedGroups
    : Object.keys(manifest.groups);
  if (manifest.raw) await verifyArtifact(directory, manifest.raw);
  for (const group of groups) {
    const entry = manifest.groups[group];
    if (!entry) {
      throw new Error(`Projection release manifest is missing group ${group}`);
    }
    if (!entry.semanticFingerprint || !entry.artifactFingerprint) {
      throw new Error(
        `Projection release group ${group} has incomplete fingerprints`,
      );
    }
    const desired = nestedProperty(
      nestedProperty(options.expectedFingerprints, "groups"),
      group,
    );
    const expectedSemantic = stringProperty(desired, "semanticFingerprint");
    const expectedArtifact = stringProperty(desired, "artifactFingerprint");
    if (expectedSemantic && entry.semanticFingerprint !== expectedSemantic) {
      throw new Error(
        `Projection release group ${group} has an unexpected semantic fingerprint`,
      );
    }
    if (expectedArtifact && entry.artifactFingerprint !== expectedArtifact) {
      throw new Error(
        `Projection release group ${group} has an unexpected artifact fingerprint`,
      );
    }
    const definition = projectionGroup(group);
    if (
      JSON.stringify([...entry.tables].sort()) !==
      JSON.stringify([...definition.tables].sort())
    ) {
      throw new Error(
        `Projection release group ${group} has invalid table ownership`,
      );
    }
    await verifyArtifact(directory, entry.archive);
    await verifyArtifact(directory, entry.metadata);
    const transfer = await transferMetadata(directory, entry.metadata.file);
    if (transfer.group !== group) {
      throw new Error(
        `Projection release metadata ${entry.metadata.file} does not describe ${group}`,
      );
    }
    if (
      JSON.stringify([...transfer.tables].sort()) !==
      JSON.stringify([...entry.transferTables].sort())
    ) {
      throw new Error(
        `Projection release metadata ${entry.metadata.file} has unexpected tables`,
      );
    }
  }
  return { manifest, manifestSha256: actualSha256 };
}
