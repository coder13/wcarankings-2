import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  MARIADB_COMPATIBILITY_VERSION,
  PROJECTION_ARTIFACT_FORMAT_VERSION,
  projectionGroup,
} from "./projection-groups.mjs";
import { normalizeExportDate } from "./lib/projection-transfer-date.mjs";
import { argumentValue, listArgument } from "./lib/cli.mjs";

export const PROJECTION_RELEASE_MANIFEST = "projection-release.json";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function prefixForGroup(group) {
  return group === "yearly-person-rankings" ? "yearly" : group;
}

async function artifactMetadata(directory, file) {
  const path = join(directory, file);
  const [content, information] = await Promise.all([readFile(path), stat(path)]);
  return {
    file,
    bytes: information.size,
    sha256: sha256(content),
  };
}

export async function createProjectionReleaseManifest({
  directory,
  exportId,
  exportDate,
  groups,
  fingerprints,
  sourceSha,
  sourceTree,
  compatibility,
  rawFile,
  artifactDigests = {},
} = {}) {
  if (!directory) throw new Error("directory is required");
  if (!exportId) throw new Error("exportId is required");
  if (!groups?.length) throw new Error("At least one projection group is required");
  if (
    !Number.isInteger(Number(compatibility?.artifactFormatVersion))
    || !Number.isInteger(Number(compatibility?.datasetSchemaVersion))
  ) {
    throw new Error("Release compatibility versions are required");
  }
  if (rawFile && basename(rawFile) !== rawFile) {
    throw new Error("Raw release artifact must be a basename");
  }
  const manifestGroups = {};

  for (const group of groups) {
    const definition = projectionGroup(group);
    const desired = fingerprints?.groups?.[group];
    const artifactFingerprint = desired?.artifactFingerprint ?? desired?.fingerprint;
    const semanticFingerprint = desired?.semanticFingerprint;
    if (!artifactFingerprint || !semanticFingerprint) {
      throw new Error(`Missing semantic or artifact fingerprint for projection group ${group}`);
    }
    const prefix = prefixForGroup(group);
    const metadataFile = `${prefix}-projection-transfer.json`;
    const transfer = JSON.parse(await readFile(join(directory, metadataFile), "utf8"));
    const archiveFile = transfer.archiveFile || `${prefix}-projection-transfer.sql.gz`;
    if (transfer.group !== group) {
      throw new Error(`Transfer metadata group ${transfer.group || "(missing)"} does not match ${group}`);
    }
    if (normalizeExportDate(transfer.exportDate) !== normalizeExportDate(exportId)) {
      throw new Error(
        `Transfer metadata export ${transfer.exportDate || "(missing)"} does not match ${exportId}`,
      );
    }
    const expectedTransferTables = [
      ...definition.tables.map((table) => `${table}_transfer`),
      `projection_transfer_manifest_${group.replaceAll("-", "_")}`,
      `projection_transfer_indexes_${group.replaceAll("-", "_")}`,
    ].sort();
    if (JSON.stringify([...transfer.tables].sort()) !== JSON.stringify(expectedTransferTables)) {
      throw new Error(`Transfer metadata table ownership does not match ${group}`);
    }
    manifestGroups[group] = {
      semanticFingerprint,
      artifactFingerprint,
      artifactDigest: artifactDigests[group] ?? null,
      tables: definition.tables,
      transferTables: transfer.tables,
      exportDate: transfer.exportDate,
      archive: await artifactMetadata(directory, archiveFile),
      metadata: await artifactMetadata(directory, metadataFile),
    };
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
    sourceSha: sourceSha || null,
    sourceTree: sourceTree || null,
    createdAt: new Date().toISOString(),
    groups: manifestGroups,
    raw: rawFile ? await artifactMetadata(directory, rawFile) : null,
  };
  const manifestPath = join(directory, PROJECTION_RELEASE_MANIFEST);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return {
    manifest,
    manifestPath,
    manifestSha256: sha256(await readFile(manifestPath)),
  };
}

export async function verifyProjectionReleaseManifest({
  directory,
  expectedSha256,
  expectedGroups,
  expectedExportId,
  expectedSourceSha,
  expectedFingerprints,
} = {}) {
  if (!directory) throw new Error("directory is required");
  const manifestPath = join(directory, PROJECTION_RELEASE_MANIFEST);
  const content = await readFile(manifestPath);
  const actualSha256 = sha256(content);
  if (expectedSha256 && actualSha256 !== expectedSha256) {
    throw new Error(`Projection release manifest checksum ${actualSha256} does not match ${expectedSha256}`);
  }
  const manifest = JSON.parse(content);
  if (manifest.version !== 3) throw new Error(`Unsupported projection release manifest version: ${manifest.version}`);
  if (
    !Number.isInteger(manifest.compatibility?.artifactFormatVersion)
    || !Number.isInteger(manifest.compatibility?.datasetSchemaVersion)
  ) {
    throw new Error("Projection release compatibility metadata is invalid");
  }
  if (manifest.compatibility.artifactFormatVersion !== PROJECTION_ARTIFACT_FORMAT_VERSION) {
    throw new Error("Projection release artifact format is not compatible with this data-tools build");
  }
  if (manifest.mariaDbCompatibilityVersion !== MARIADB_COMPATIBILITY_VERSION) {
    throw new Error("Projection release MariaDB compatibility is invalid");
  }
  if (expectedExportId && String(manifest.exportId) !== String(expectedExportId)) {
    throw new Error(`Projection export ${manifest.exportId} does not match ${expectedExportId}`);
  }
  if (expectedSourceSha && manifest.sourceSha !== expectedSourceSha) {
    throw new Error(`Projection source ${manifest.sourceSha || "(missing)"} does not match ${expectedSourceSha}`);
  }
  const groups = expectedGroups?.length ? expectedGroups : Object.keys(manifest.groups || {});
  if (manifest.raw) {
    if (!manifest.raw.file || basename(manifest.raw.file) !== manifest.raw.file) {
      throw new Error("Projection release contains an invalid raw artifact path");
    }
    const actual = await artifactMetadata(directory, manifest.raw.file);
    if (actual.sha256 !== manifest.raw.sha256 || actual.bytes !== manifest.raw.bytes) {
      throw new Error(`Projection release artifact ${manifest.raw.file} failed verification`);
    }
  }
  for (const group of groups) {
    const entry = manifest.groups?.[group];
    if (!entry) throw new Error(`Projection release manifest is missing group ${group}`);
    if (!entry.semanticFingerprint || !entry.artifactFingerprint) {
      throw new Error(`Projection release group ${group} has incomplete fingerprints`);
    }
    const desired = expectedFingerprints?.groups?.[group];
    if (desired && entry.semanticFingerprint !== desired.semanticFingerprint) {
      throw new Error(`Projection release group ${group} has an unexpected semantic fingerprint`);
    }
    if (desired && entry.artifactFingerprint !== desired.artifactFingerprint) {
      throw new Error(`Projection release group ${group} has an unexpected artifact fingerprint`);
    }
    const definition = projectionGroup(group);
    if (JSON.stringify([...entry.tables].sort()) !== JSON.stringify([...definition.tables].sort())) {
      throw new Error(`Projection release group ${group} has invalid table ownership`);
    }
    for (const artifact of [entry.archive, entry.metadata]) {
      if (!artifact?.file || basename(artifact.file) !== artifact.file) {
        throw new Error(`Projection release group ${group} contains an invalid artifact path`);
      }
      const actual = await artifactMetadata(directory, artifact.file);
      if (actual.sha256 !== artifact.sha256 || actual.bytes !== artifact.bytes) {
        throw new Error(`Projection release artifact ${artifact.file} failed verification`);
      }
    }
    const transfer = JSON.parse(await readFile(join(directory, entry.metadata.file), "utf8"));
    if (transfer.group !== group) {
      throw new Error(`Projection release metadata ${entry.metadata.file} does not describe ${group}`);
    }
    if (JSON.stringify([...transfer.tables].sort()) !== JSON.stringify([...entry.transferTables].sort())) {
      throw new Error(`Projection release metadata ${entry.metadata.file} has unexpected tables`);
    }
  }
  return { manifest, manifestSha256: actualSha256 };
}

async function cli() {
  const command = process.argv[2];
  const directory = resolve(argumentValue("directory") || ".");
  const groups = listArgument("groups");
  if (command === "create") {
    const fingerprints = JSON.parse(await readFile(argumentValue("fingerprints-file"), "utf8"));
    const compatibility = JSON.parse(await readFile(argumentValue("compatibility-file"), "utf8"));
    const artifactDigests = argumentValue("artifact-digests-file")
      ? JSON.parse(await readFile(argumentValue("artifact-digests-file"), "utf8"))
      : {};
    const result = await createProjectionReleaseManifest({
      directory,
      exportId: argumentValue("export-id"),
      exportDate: argumentValue("export-date"),
      groups,
      fingerprints,
      sourceSha: argumentValue("source-sha"),
      sourceTree: argumentValue("source-tree"),
      compatibility,
      rawFile: argumentValue("raw-file") || undefined,
      artifactDigests,
    });
    process.stdout.write(`${JSON.stringify({
      manifest: result.manifestPath,
      sha256: result.manifestSha256,
    })}\n`);
    return;
  }
  if (command === "verify") {
    const expectedFingerprints = argumentValue("fingerprints-file")
      ? JSON.parse(await readFile(argumentValue("fingerprints-file"), "utf8"))
      : undefined;
    const result = await verifyProjectionReleaseManifest({
      directory,
      expectedSha256: argumentValue("sha256"),
      expectedGroups: groups,
      expectedExportId: argumentValue("export-id"),
      expectedSourceSha: argumentValue("source-sha"),
      expectedFingerprints,
    });
    process.stdout.write(`${JSON.stringify({
      manifest: join(directory, PROJECTION_RELEASE_MANIFEST),
      sha256: result.manifestSha256,
      groups: Object.keys(result.manifest.groups),
    })}\n`);
    return;
  }
  throw new Error("Use projection-release-artifact.mjs create or verify");
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await cli();
}
