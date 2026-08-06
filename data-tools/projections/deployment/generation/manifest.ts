import type { GenerationManifest, GenerationManifestGroup } from "./types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Generation manifest ${name} is invalid`);
  }
  return value;
}

export function parseGenerationManifest(value: unknown): GenerationManifest {
  if (!isRecord(value) || value.version !== 3) {
    throw new Error("A version 3 generation manifest is required");
  }
  if (!isRecord(value.compatibility) || !isRecord(value.groups)) {
    throw new Error("Generation manifest structure is invalid");
  }
  const artifactFormatVersion = Number(
    value.compatibility.artifactFormatVersion,
  );
  const datasetSchemaVersion = Number(value.compatibility.datasetSchemaVersion);
  if (
    !Number.isInteger(artifactFormatVersion) ||
    !Number.isInteger(datasetSchemaVersion)
  ) {
    throw new Error("Generation manifest compatibility is invalid");
  }
  const groups: Record<string, GenerationManifestGroup> = {};
  for (const [name, entry] of Object.entries(value.groups)) {
    if (!isRecord(entry)) {
      throw new Error(`Generation manifest group ${name} is invalid`);
    }
    const artifactDigest = entry.artifactDigest;
    if (
      artifactDigest !== undefined &&
      artifactDigest !== null &&
      typeof artifactDigest !== "string"
    ) {
      throw new Error(`Generation manifest group ${name} digest is invalid`);
    }
    groups[name] = {
      semanticFingerprint: requiredString(
        entry.semanticFingerprint,
        `${name} semantic fingerprint`,
      ),
      artifactFingerprint: requiredString(
        entry.artifactFingerprint,
        `${name} artifact fingerprint`,
      ),
      artifactDigest,
    };
  }
  return {
    version: 3,
    compatibility: { artifactFormatVersion, datasetSchemaVersion },
    exportId: requiredString(value.exportId, "export identity"),
    sourceSha: requiredString(value.sourceSha, "source SHA"),
    groups,
    raw: value.raw ?? null,
  };
}
