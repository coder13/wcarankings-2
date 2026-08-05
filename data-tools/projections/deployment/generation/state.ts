import { PROJECTION_CAPABILITIES } from "../../../projection-catalog/groups.ts";
import type {
  GenerationIdentityInput,
  GenerationState,
  MatchActiveGenerationInput,
} from "./types.ts";

export function mergedGenerationState(
  input: GenerationIdentityInput,
): GenerationState {
  const { activeState, manifest, artifactRunId, artifactId } = input;
  if (manifest.version !== 3) {
    throw new Error("A version 3 generation manifest is required");
  }
  const semanticFingerprints = { ...activeState?.semanticFingerprints };
  const artifactFingerprints = { ...activeState?.artifactFingerprints };
  const artifactDigests = { ...activeState?.artifactDigests };
  for (const [group, release] of Object.entries(manifest.groups)) {
    if (!release.semanticFingerprint || !release.artifactFingerprint) {
      throw new Error(`Missing fingerprints for ${group}`);
    }
    semanticFingerprints[group] = release.semanticFingerprint;
    artifactFingerprints[group] = release.artifactFingerprint;
    artifactDigests[group] = release.artifactDigest ?? null;
  }
  const capabilities = { ...activeState?.capabilities };
  for (const [capability, requiredGroups] of Object.entries(
    PROJECTION_CAPABILITIES,
  )) {
    if (requiredGroups.some((group) => manifest.groups[group])) {
      capabilities[capability] = requiredGroups.every(
        (group) => artifactFingerprints[group] !== undefined,
      );
    }
  }
  const artifactFormatVersion = Number(
    manifest.compatibility.artifactFormatVersion,
  );
  const datasetSchemaVersion = Number(
    manifest.compatibility.datasetSchemaVersion,
  );
  if (
    !Number.isInteger(artifactFormatVersion) ||
    !Number.isInteger(datasetSchemaVersion)
  ) {
    throw new Error("Generation compatibility metadata is invalid");
  }
  return {
    generationId: `${manifest.exportId}:${artifactRunId}:${artifactId}`,
    exportId: String(manifest.exportId),
    artifactFormatVersion,
    datasetSchemaVersion,
    semanticFingerprints,
    artifactFingerprints,
    artifactDigests,
    capabilities,
    sourceSha: manifest.sourceSha,
    artifactRunId: Number(artifactRunId),
    artifactId: Number(artifactId),
    activationTables: activeState?.activationTables ?? [],
    previousTables: activeState?.previousTables ?? [],
  };
}

export function matchesActiveGeneration(
  input: MatchActiveGenerationInput,
): boolean {
  const { activeState, manifest, artifactRunId, artifactId } = input;
  if (!activeState || !manifest) return false;
  if (
    activeState.exportId !== String(manifest.exportId) ||
    activeState.artifactRunId !== Number(artifactRunId) ||
    activeState.artifactId !== Number(artifactId)
  ) {
    return false;
  }
  return Object.entries(manifest.groups).every(
    ([group, release]) =>
      activeState.semanticFingerprints[group] === release.semanticFingerprint &&
      activeState.artifactFingerprints[group] === release.artifactFingerprint,
  );
}
