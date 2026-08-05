import { DEPLOYMENT_PROJECTION_GROUPS } from "../../projection-catalog/groups.ts";
import {
  DEFAULT_PROJECTION_NAMES,
  SEMANTIC_PROJECTION_DEFINITIONS,
} from "../../projection-catalog/tables.ts";
import type { SemanticProjectionDefinition } from "../../projection-catalog/tables.ts";
import type { ProjectionBuildPlan } from "./types.ts";

export function projectionNamesForRefresh(
  selectedNames?: readonly string[],
): readonly string[] {
  return selectedNames ?? DEFAULT_PROJECTION_NAMES;
}

export function projectionDependencyClosure(
  selectedNames: readonly string[],
): SemanticProjectionDefinition[] {
  const byName = new Map(
    SEMANTIC_PROJECTION_DEFINITIONS.map((projection) => [
      projection.name,
      projection,
    ]),
  );
  const ordered: SemanticProjectionDefinition[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(name: string): void {
    if (visited.has(name) || name === "raw-wca") return;
    if (visiting.has(name)) {
      throw new Error(`Projection dependency cycle at ${name}`);
    }
    const projection = byName.get(name);
    if (!projection) {
      throw new Error(`Unknown projection dependency: ${name}`);
    }
    visiting.add(name);
    for (const dependency of projection.dependencies) visit(dependency);
    visiting.delete(name);
    visited.add(name);
    ordered.push(projection);
  }

  for (const name of selectedNames) visit(name);
  return ordered;
}

export function projectionBuildPlan(
  groupNames: readonly string[] = DEPLOYMENT_PROJECTION_GROUPS.map(
    (group) => group.name,
  ),
  satisfiedGroupNames: readonly string[] = [],
): ProjectionBuildPlan {
  const selected = new Set(groupNames);
  const satisfied = new Set(satisfiedGroupNames);
  const groups = DEPLOYMENT_PROJECTION_GROUPS.filter((group) =>
    selected.has(group.name),
  );
  const satisfiedGroups = DEPLOYMENT_PROJECTION_GROUPS.filter((group) =>
    satisfied.has(group.name),
  );
  if (
    groups.length !== selected.size ||
    satisfiedGroups.length !== satisfied.size
  ) {
    const known = new Set(
      DEPLOYMENT_PROJECTION_GROUPS.map((group) => group.name),
    );
    const unknown = [...selected, ...satisfied].filter(
      (name) => !known.has(name),
    );
    throw new Error(
      `Unknown deployment projection group: ${unknown.join(", ")}`,
    );
  }

  return {
    groups: groups.map((group) => group.name),
    projectionNames: [
      ...new Set(groups.flatMap((group) => group.projectionNames)),
    ],
    satisfiedProjectionNames: [
      ...new Set(satisfiedGroups.flatMap((group) => group.projectionNames)),
    ],
    includeRankingTables: groups.some(
      (group) => group.name === "ranking-tables",
    ),
    tables: [...new Set(groups.flatMap((group) => group.tables))],
  };
}
