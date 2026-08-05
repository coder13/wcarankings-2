import {
  groupDependencyClosure,
  projectionGroup,
} from "../../projection-catalog/groups.ts";
import type {
  ProjectionBuildMatrix,
  ProjectionBuildMatrixInput,
} from "./types.ts";

interface BuildMatrixCandidate {
  builtDependencies: string[];
  group: string;
  hydrateGroups: string;
}

export function createProjectionBuildMatrix(
  input: ProjectionBuildMatrixInput,
): ProjectionBuildMatrix {
  const { selectedGroups, wave } = input;
  if (![1, 2].includes(wave)) {
    throw new Error("wave must be 1 or 2");
  }
  const selected = new Set(selectedGroups);
  const entries: BuildMatrixCandidate[] = selectedGroups.map((name) => {
    projectionGroup(name);
    const dependencies = groupDependencyClosure([name], {
      includeSelected: false,
    }).map((group) => group.name);
    return {
      group: name,
      hydrateGroups: dependencies.join(","),
      builtDependencies: dependencies.filter((dependency) =>
        selected.has(dependency),
      ),
    };
  });
  const waveOneNames = new Set(
    entries
      .filter((entry) => entry.builtDependencies.length === 0)
      .map((entry) => entry.group),
  );
  const waveTwo = entries.filter((entry) => entry.builtDependencies.length > 0);
  for (const entry of waveTwo) {
    if (
      entry.builtDependencies.some(
        (dependency) => !waveOneNames.has(dependency),
      )
    ) {
      throw new Error(
        `Projection dependency graph requires more than two build waves for ${entry.group}`,
      );
    }
  }
  const selectedWave =
    wave === 1
      ? entries.filter((entry) => waveOneNames.has(entry.group))
      : waveTwo;
  return {
    include: selectedWave.map((entry) => ({
      group: entry.group,
      hydrate_groups: entry.hydrateGroups,
    })),
  };
}
