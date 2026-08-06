import { createHash } from "node:crypto";
import type { BinaryLike } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEPLOYMENT_PROJECTION_GROUPS,
  projectionGroup,
} from "../../projection-catalog/groups.ts";
import {
  MARIADB_COMPATIBILITY_VERSION,
  PROJECTION_ARTIFACT_FORMAT_VERSION,
} from "../../projection-catalog/registry.ts";
import { normalizeExportDate } from "../../shared/date.ts";
import type {
  ArtifactFingerprintGroup,
  ArtifactFingerprintSet,
  ProjectionFingerprintOptions,
  SemanticFingerprintOptions,
  SemanticFingerprintSet,
} from "./types.ts";

const SEMANTIC_FINGERPRINT_FORMAT_VERSION = 3;
const ARTIFACT_FINGERPRINT_FORMAT_VERSION = 3;
const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

function sha256(value: BinaryLike): string {
  return createHash("sha256").update(value).digest("hex");
}

async function migrationFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await migrationFiles(path)));
    if (entry.isFile()) files.push(path);
  }
  return files;
}

interface FileFingerprint {
  path: string;
  sha256: string;
}

async function fileFingerprint(
  root: string,
  path: string,
): Promise<FileFingerprint> {
  const content = await readFile(join(root, path));
  return { path, sha256: sha256(content) };
}

export async function semanticProjectionFingerprints(
  options: SemanticFingerprintOptions = {},
): Promise<SemanticFingerprintSet> {
  const root = options.repositoryRoot ?? repositoryRoot;
  const resultMigrations = (
    await migrationFiles(join(root, "migrations", "mysql", "results"))
  )
    .map((path) => relative(root, path))
    .sort();
  const groups: SemanticFingerprintSet["groups"] = {};

  for (const group of DEPLOYMENT_PROJECTION_GROUPS) {
    const inputs = [
      ...new Set([
        ...group.sqlFiles.map(
          (file) => `data-tools/projection-catalog/${file}`,
        ),
        ...resultMigrations,
      ]),
    ].sort();
    const files = await Promise.all(
      inputs.map((path) => fileFingerprint(root, path)),
    );
    const payload = {
      semanticFingerprintFormatVersion: SEMANTIC_FINGERPRINT_FORMAT_VERSION,
      group: group.name,
      groupSchemaVersion: group.schemaVersion,
      groupDefinition: {
        dependencies: group.dependencies,
        projectionNames: group.projectionNames,
        tables: group.tables,
        sqlFiles: group.sqlFiles,
      },
      files,
    };
    const digest = sha256(`${JSON.stringify(payload)}\n`);
    groups[group.name] = {
      semanticFingerprint: `projection-semantic-${group.name}-v${group.schemaVersion}-${digest}`,
      semanticDigest: digest,
      inputs,
    };
  }

  return { version: SEMANTIC_FINGERPRINT_FORMAT_VERSION, groups };
}

export async function projectionFingerprints(
  options: ProjectionFingerprintOptions = {},
): Promise<ArtifactFingerprintSet> {
  const root = options.repositoryRoot ?? repositoryRoot;
  const normalizedExportId = normalizeExportDate(options.exportId);
  if (!normalizedExportId) {
    throw new Error("exportId must be a valid timestamp");
  }
  const semantics =
    options.semanticFingerprints ??
    (await semanticProjectionFingerprints({ repositoryRoot: root }));
  const groups: Record<string, ArtifactFingerprintGroup> = {};

  function create(groupName: string): ArtifactFingerprintGroup {
    const existing = groups[groupName];
    if (existing) return existing;
    const group = projectionGroup(groupName);
    const dependencies = Object.fromEntries(
      group.dependencies.map((dependency) => [
        dependency,
        create(dependency).artifactFingerprint,
      ]),
    );
    const semantic = semantics.groups[groupName];
    if (!semantic?.semanticFingerprint) {
      throw new Error(`Missing semantic fingerprint for ${groupName}`);
    }
    const payload = {
      artifactFingerprintFormatVersion: ARTIFACT_FINGERPRINT_FORMAT_VERSION,
      group: groupName,
      semanticFingerprint: semantic.semanticFingerprint,
      exportId: normalizedExportId,
      mariaDbCompatibilityVersion: MARIADB_COMPATIBILITY_VERSION,
      artifactFormatVersion: PROJECTION_ARTIFACT_FORMAT_VERSION,
      dependencies,
    };
    const digest = sha256(`${JSON.stringify(payload)}\n`);
    const fingerprint: ArtifactFingerprintGroup = {
      ...semantic,
      artifactFingerprint: `projection-artifact-${groupName}-v${ARTIFACT_FINGERPRINT_FORMAT_VERSION}-${digest}`,
      artifactDigest: digest,
      dependencies,
    };
    groups[groupName] = fingerprint;
    return fingerprint;
  }

  for (const group of DEPLOYMENT_PROJECTION_GROUPS) create(group.name);
  return {
    version: ARTIFACT_FINGERPRINT_FORMAT_VERSION,
    semanticVersion: semantics.version,
    exportId: normalizedExportId,
    mariaDbCompatibilityVersion: MARIADB_COMPATIBILITY_VERSION,
    artifactFormatVersion: PROJECTION_ARTIFACT_FORMAT_VERSION,
    groups,
  };
}
