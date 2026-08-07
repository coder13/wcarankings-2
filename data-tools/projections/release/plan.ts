import {
  DEPLOYMENT_PROJECTION_GROUPS,
  projectionGroup,
} from "../../projection-catalog/groups.ts";
import { normalizeExportDate } from "../../shared/date.ts";
import { projectionFingerprints } from "./fingerprints.ts";
import { projectionSemanticPlan } from "./semantic-plan.ts";
import { sourceReusePlan } from "./source-reuse.ts";
import {
  activeFingerprint,
  isRecord,
  nestedProperty,
  stringProperty,
} from "./state.ts";
import type {
  ArtifactFingerprintGroup,
  ProjectionReleasePlan,
  ProjectionReleasePlanOptions,
} from "./types.ts";

interface AvailableArtifact {
  artifactFingerprint?: string;
  fingerprint?: string;
  valid?: boolean;
}

function activeArtifactFingerprint(
  state: unknown,
  groupName: string,
): string | null {
  return activeFingerprint(
    state,
    "artifactFingerprints",
    groupName,
    "artifactFingerprint",
  );
}

function availableArtifact(
  artifacts: unknown,
  groupName: string,
  desired: ArtifactFingerprintGroup,
): AvailableArtifact | null {
  const candidate = nestedProperty(artifacts, groupName);
  if (!isRecord(candidate) || candidate.valid === false) return null;
  const artifact: AvailableArtifact = {
    valid: candidate.valid === true ? true : undefined,
    artifactFingerprint: stringProperty(candidate, "artifactFingerprint"),
    fingerprint: stringProperty(candidate, "fingerprint"),
  };
  const fingerprint =
    artifact.artifactFingerprint ?? artifact.fingerprint ?? null;
  return fingerprint === desired.artifactFingerprint ? artifact : null;
}

export async function projectionReleasePlan(
  options: ProjectionReleasePlanOptions = {},
): Promise<ProjectionReleasePlan> {
  const semanticPlan = await projectionSemanticPlan({
    productionState: options.productionState,
    selectedGroups: options.selectedGroups,
    forceRebuild: options.forceRebuild,
    repositoryRoot: options.repositoryRoot,
  });
  const fingerprints = await projectionFingerprints({
    exportId: options.exportId,
    repositoryRoot: options.repositoryRoot,
    semanticFingerprints: semanticPlan,
  });
  const normalizedExportId = normalizeExportDate(options.exportId);
  if (!normalizedExportId) {
    throw new Error("exportId must be a valid timestamp");
  }
  const normalizedProductionExportId = options.productionExportId
    ? normalizeExportDate(options.productionExportId)
    : null;
  const exportChanged =
    !normalizedProductionExportId ||
    normalizedProductionExportId !== normalizedExportId;
  const selected =
    exportChanged || options.forceRebuild
      ? DEPLOYMENT_PROJECTION_GROUPS.map((group) => group.name)
      : semanticPlan.changedGroups;

  const activeGroups: string[] = [];
  const cachedGroups: string[] = [];
  const buildGroups: string[] = [];
  for (const name of selected) {
    const desired = fingerprints.groups[name];
    if (!desired) throw new Error(`Missing fingerprints for ${name}`);
    if (
      !exportChanged &&
      !options.forceRebuild &&
      activeArtifactFingerprint(options.productionState, name) ===
        desired.artifactFingerprint
    ) {
      activeGroups.push(name);
    } else if (availableArtifact(options.availableArtifacts, name, desired)) {
      cachedGroups.push(name);
    } else {
      buildGroups.push(name);
    }
  }

  const hydrateGroups = new Set<string>();
  const builds = new Set(buildGroups);
  function satisfyDependencies(groupName: string): void {
    for (const dependency of projectionGroup(groupName).dependencies) {
      if (builds.has(dependency)) {
        satisfyDependencies(dependency);
        continue;
      }
      const desired = fingerprints.groups[dependency];
      if (!desired) {
        throw new Error(`Missing fingerprints for ${dependency}`);
      }
      if (availableArtifact(options.availableArtifacts, dependency, desired)) {
        hydrateGroups.add(dependency);
      } else {
        builds.add(dependency);
        satisfyDependencies(dependency);
      }
    }
  }
  for (const group of [...builds]) satisfyDependencies(group);

  const orderedBuildGroups = DEPLOYMENT_PROJECTION_GROUPS.filter((group) =>
    builds.has(group.name),
  ).map((group) => group.name);
  const orderedHydrateGroups = DEPLOYMENT_PROJECTION_GROUPS.filter(
    (group) => hydrateGroups.has(group.name) && !builds.has(group.name),
  ).map((group) => group.name);
  const releaseGroups = selected.filter((name) => !activeGroups.includes(name));
  const sourcePlan = options.sourceManifest
    ? sourceReusePlan(
        options.sourceManifest,
        options.previousSourceManifest,
        options.currentYear ?? new Date(normalizedExportId).getUTCFullYear(),
      )
    : null;

  return {
    ...fingerprints,
    productionExportId: options.productionExportId ?? null,
    exportChanged,
    semanticChangeRequired: semanticPlan.required,
    changedGroups: semanticPlan.changedGroups,
    required: releaseGroups.length > 0,
    selectedGroups: selected,
    activeGroups,
    cachedGroups,
    buildGroups: orderedBuildGroups,
    hydrateGroups: orderedHydrateGroups,
    releaseGroups,
    requiredGroups: releaseGroups,
    requiredGroupsCsv: releaseGroups.join(","),
    buildGroupsCsv: orderedBuildGroups.join(","),
    hydrateGroupsCsv: orderedHydrateGroups.join(","),
    sourceManifest: options.sourceManifest,
    previousSourceManifest: options.previousSourceManifest,
    dirtyYears: sourcePlan?.dirtyYears ?? [],
    reusedYears: sourcePlan?.reusedYears ?? [],
    dirtyCompetitionIds: sourcePlan?.dirtyCompetitionIds ?? [],
    sourceManifestReasons: sourcePlan?.reasons ?? [],
  };
}
