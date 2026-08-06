import { readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { projectionGroup } from "../../projection-catalog/groups.ts";
import { MARIADB_COMPATIBILITY_VERSION } from "../../projection-catalog/registry.ts";
import { normalizeExportDate } from "../../shared/date.ts";
import {
  artifactMetadata,
  compatibilityFrom,
  nestedProperty,
  PROJECTION_RELEASE_MANIFEST,
  sha256,
  stringProperty,
  transferMetadata,
} from "./files.ts";
import type {
  CreateProjectionReleaseManifestOptions,
  CreateProjectionReleaseManifestResult,
  ProjectionReleaseManifest,
  ProjectionReleaseManifestGroup,
} from "./types.ts";

function prefixForGroup(group: string): string {
  return group === "yearly-person-rankings" ? "yearly" : group;
}

export async function createProjectionReleaseManifest(
  options: CreateProjectionReleaseManifestOptions = {},
): Promise<CreateProjectionReleaseManifestResult> {
  const { directory, exportId, groups } = options;
  if (!directory) throw new Error("directory is required");
  if (!exportId) throw new Error("exportId is required");
  if (!groups?.length) {
    throw new Error("At least one projection group is required");
  }
  const compatibility = compatibilityFrom(options.compatibility);
  if (options.rawFile && basename(options.rawFile) !== options.rawFile) {
    throw new Error("Raw release artifact must be a basename");
  }
  const manifestGroups: Record<string, ProjectionReleaseManifestGroup> = {};

  for (const group of groups) {
    const definition = projectionGroup(group);
    const desired = nestedProperty(
      nestedProperty(options.fingerprints, "groups"),
      group,
    );
    const artifactFingerprint =
      stringProperty(desired, "artifactFingerprint") ??
      stringProperty(desired, "fingerprint");
    const semanticFingerprint = stringProperty(desired, "semanticFingerprint");
    if (!artifactFingerprint || !semanticFingerprint) {
      throw new Error(
        `Missing semantic or artifact fingerprint for projection group ${group}`,
      );
    }
    const prefix = prefixForGroup(group);
    const metadataFile = `${prefix}-projection-transfer.json`;
    const transfer = await transferMetadata(directory, metadataFile);
    const archiveFile =
      transfer.archiveFile || `${prefix}-projection-transfer.sql.gz`;
    if (transfer.group !== group) {
      throw new Error(
        `Transfer metadata group ${transfer.group || "(missing)"} does not match ${group}`,
      );
    }
    if (
      normalizeExportDate(transfer.exportDate) !== normalizeExportDate(exportId)
    ) {
      throw new Error(
        `Transfer metadata export ${transfer.exportDate || "(missing)"} does not match ${exportId}`,
      );
    }
    const expectedTransferTables = [
      ...definition.tables.map((table) => `${table}_transfer`),
      `projection_transfer_manifest_${group.replaceAll("-", "_")}`,
      `projection_transfer_indexes_${group.replaceAll("-", "_")}`,
    ].sort();
    if (
      JSON.stringify([...transfer.tables].sort()) !==
      JSON.stringify(expectedTransferTables)
    ) {
      throw new Error(
        `Transfer metadata table ownership does not match ${group}`,
      );
    }
    manifestGroups[group] = {
      semanticFingerprint,
      artifactFingerprint,
      artifactDigest: stringProperty(options.artifactDigests, group) ?? null,
      tables: definition.tables,
      transferTables: transfer.tables,
      exportDate: transfer.exportDate,
      archive: await artifactMetadata(directory, archiveFile),
      metadata: await artifactMetadata(directory, metadataFile),
    };
  }

  const manifest: ProjectionReleaseManifest = {
    version: 3,
    compatibility,
    mariaDbCompatibilityVersion: MARIADB_COMPATIBILITY_VERSION,
    exportId,
    exportDate: String(options.exportDate || exportId).slice(0, 10),
    sourceSha: options.sourceSha ?? null,
    sourceTree: options.sourceTree ?? null,
    createdAt: new Date().toISOString(),
    groups: manifestGroups,
    raw: options.rawFile
      ? await artifactMetadata(directory, options.rawFile)
      : null,
  };
  const manifestPath = join(directory, PROJECTION_RELEASE_MANIFEST);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return {
    manifest,
    manifestPath,
    manifestSha256: sha256(await readFile(manifestPath)),
  };
}
