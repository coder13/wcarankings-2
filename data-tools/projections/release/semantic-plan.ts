import {
  DEPLOYMENT_PROJECTION_GROUPS,
  downstreamGroupClosure,
} from "../../projection-catalog/groups.ts";
import { semanticProjectionFingerprints } from "./fingerprints.ts";
import { activeFingerprint } from "./state.ts";
import type {
  ProjectionSemanticPlan,
  ProjectionSemanticPlanOptions,
} from "./types.ts";

function activeSemanticFingerprint(
  state: unknown,
  groupName: string,
): string | null {
  return activeFingerprint(
    state,
    "semanticFingerprints",
    groupName,
    "semanticFingerprint",
  );
}

function requestedGroups(selectedGroups?: readonly string[]): Set<string> {
  const requested = selectedGroups?.length
    ? new Set(selectedGroups)
    : new Set(DEPLOYMENT_PROJECTION_GROUPS.map((group) => group.name));
  const unknown = [...requested].filter(
    (name) =>
      !DEPLOYMENT_PROJECTION_GROUPS.some((group) => group.name === name),
  );
  if (unknown.length > 0) {
    throw new Error(
      `Unknown deployment projection group: ${unknown.join(", ")}`,
    );
  }
  return requested;
}

export async function projectionSemanticPlan(
  options: ProjectionSemanticPlanOptions = {},
): Promise<ProjectionSemanticPlan> {
  const semantics = await semanticProjectionFingerprints({
    repositoryRoot: options.repositoryRoot,
  });
  const requested = requestedGroups(options.selectedGroups);
  const changedRoots = options.forceRebuild
    ? [...requested]
    : [...requested].filter(
        (name) =>
          activeSemanticFingerprint(options.productionState, name) !==
          semantics.groups[name]?.semanticFingerprint,
      );
  const changedGroups = downstreamGroupClosure(changedRoots).map(
    (group) => group.name,
  );
  return {
    ...semantics,
    required: changedGroups.length > 0,
    changedRoots,
    changedGroups,
    changedGroupsCsv: changedGroups.join(","),
  };
}
