import { DEPLOYMENT_PROJECTION_GROUPS } from "../../projection-catalog/groups.ts";
import {
  DEFAULT_PROJECTION_NAMES,
  SEMANTIC_PROJECTION_DEFINITIONS,
} from "../../projection-catalog/tables.ts";
import type { SemanticProjectionDefinition } from "../../projection-catalog/tables.ts";
import type {
  ProjectionBuildPlan,
  ProjectionTask,
  ProjectionTaskPlan,
} from "./types.ts";

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

export function createProjectionTaskPlan(
  tasks: readonly ProjectionTask[],
  satisfiedTaskNames: readonly string[] = [],
): ProjectionTaskPlan {
  const tasksByName = new Map(tasks.map((task) => [task.name, task]));
  if (tasksByName.size !== tasks.length) {
    throw new Error("Projection task names must be unique");
  }
  const satisfied = new Set(["raw-wca", ...satisfiedTaskNames]);
  const ordered: ProjectionTask[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(task: ProjectionTask): void {
    if (visited.has(task.name)) return;
    if (visiting.has(task.name)) {
      throw new Error(`Projection task dependency cycle at ${task.name}`);
    }
    visiting.add(task.name);
    for (const dependencyName of task.dependencies) {
      if (satisfied.has(dependencyName)) continue;
      const dependency = tasksByName.get(dependencyName);
      if (!dependency) {
        throw new Error(
          `Unknown task dependency ${dependencyName} for ${task.name}`,
        );
      }
      visit(dependency);
    }
    visiting.delete(task.name);
    visited.add(task.name);
    ordered.push(task);
  }

  for (const task of tasks) visit(task);
  return {
    tasks: ordered,
    satisfiedTaskNames: [...satisfied],
  };
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
