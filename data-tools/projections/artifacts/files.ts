import { createHash } from "node:crypto";
import type { BinaryLike } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import type { ReleaseArtifactMetadata, ReleaseCompatibility } from "./types.ts";

export const PROJECTION_RELEASE_MANIFEST = "projection-release.json";

export interface TransferMetadata {
  archiveFile?: string;
  exportDate: string;
  group: string;
  tables: string[];
}

export function sha256(value: BinaryLike): string {
  return createHash("sha256").update(value).digest("hex");
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function stringProperty(
  value: unknown,
  name: string,
): string | undefined {
  if (!isRecord(value)) return undefined;
  const property = value[name];
  return typeof property === "string" ? property : undefined;
}

export function nestedProperty(value: unknown, name: string): unknown {
  return isRecord(value) ? value[name] : undefined;
}

export function stringArray(value: unknown, label: string): string[] {
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === "string")
  ) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

export function compatibilityFrom(value: unknown): ReleaseCompatibility {
  const artifactFormatVersion = Number(
    nestedProperty(value, "artifactFormatVersion"),
  );
  const datasetSchemaVersion = Number(
    nestedProperty(value, "datasetSchemaVersion"),
  );
  if (
    !Number.isInteger(artifactFormatVersion) ||
    !Number.isInteger(datasetSchemaVersion)
  ) {
    throw new Error("Release compatibility versions are required");
  }
  return { artifactFormatVersion, datasetSchemaVersion };
}

export async function artifactMetadata(
  directory: string,
  file: string,
): Promise<ReleaseArtifactMetadata> {
  const path = join(directory, file);
  const [content, information] = await Promise.all([
    readFile(path),
    stat(path),
  ]);
  return { file, bytes: information.size, sha256: sha256(content) };
}

export async function transferMetadata(
  directory: string,
  file: string,
): Promise<TransferMetadata> {
  const value: unknown = JSON.parse(
    await readFile(join(directory, file), "utf8"),
  );
  if (!isRecord(value)) {
    throw new Error(`Transfer metadata ${file} is invalid`);
  }
  return {
    group: stringProperty(value, "group") ?? "",
    exportDate: stringProperty(value, "exportDate") ?? "",
    archiveFile: stringProperty(value, "archiveFile"),
    tables: stringArray(value.tables, `Transfer metadata ${file} tables`),
  };
}

export function parseArtifactMetadata(
  value: unknown,
  label: string,
): ReleaseArtifactMetadata {
  const file = stringProperty(value, "file") ?? "";
  const bytes = Number(nestedProperty(value, "bytes"));
  const contentSha256 = stringProperty(value, "sha256") ?? "";
  if (
    !file ||
    basename(file) !== file ||
    !Number.isSafeInteger(bytes) ||
    !/^[0-9a-f]{64}$/.test(contentSha256)
  ) {
    throw new Error(`${label} is invalid`);
  }
  return { file, bytes, sha256: contentSha256 };
}
