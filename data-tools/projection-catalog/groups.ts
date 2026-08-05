import { PROJECTION_JOBS } from "./registry.ts";

export interface DeploymentProjectionGroup {
  dependencies: string[];
  name: string;
  projectionNames: string[];
  schemaVersion: number;
  sqlFiles: string[];
  tables: string[];
}

export interface ProjectionCapabilities {
  [capability: string]: readonly string[];
  cityEventStats: readonly string[];
  competitionRankings: readonly string[];
  core: readonly string[];
  personActivityRankings: readonly string[];
  personCompetitionRankings: readonly string[];
  personMedalRankings: readonly string[];
  personEventRankings: readonly string[];
  resultRankings: readonly string[];
  sumOfRanks: readonly string[];
  yearlyPersonRankings: readonly string[];
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

const jobById = new Map(PROJECTION_JOBS.map((job) => [job.id, job]));

function releaseOrder(groupName: string): number {
  return (
    PROJECTION_JOBS.find((job) => job.releaseGroup === groupName)
      ?.releaseOrder ?? 99
  );
}

export const DEPLOYMENT_PROJECTION_GROUPS: readonly DeploymentProjectionGroup[] =
  unique(PROJECTION_JOBS.map((job) => job.releaseGroup))
    .map((name) => {
      const jobs = PROJECTION_JOBS.filter((job) => job.releaseGroup === name);
      const firstJob = jobs[0];
      if (!firstJob) {
        throw new Error(`Projection group ${name} has no jobs`);
      }
      return {
        name,
        schemaVersion: firstJob.releaseSchemaVersion,
        dependencies: unique(
          jobs
            .flatMap((job) => job.dependencies)
            .filter((dependency) => dependency !== "raw-wca")
            .map((dependency) => jobById.get(dependency)?.releaseGroup)
            .filter(
              (dependency): dependency is string =>
                dependency !== undefined && dependency !== name,
            ),
        ),
        projectionNames: jobs
          .filter((job) => job.kind !== "core")
          .map((job) => job.id),
        tables: jobs.flatMap((job) => [...job.tables]),
        sqlFiles: unique(jobs.flatMap((job) => job.sqlFiles)),
      };
    })
    .sort((left, right) => releaseOrder(left.name) - releaseOrder(right.name));

export const PROJECTION_CAPABILITIES: ProjectionCapabilities = {
  core: ["ranking-tables"],
  resultRankings: ["result-rankings"],
  competitionRankings: ["competition-rankings"],
  personActivityRankings: ["person-activity-rankings"],
  personCompetitionRankings: ["person-competition-rankings"],
  personMedalRankings: ["person-medal-rankings"],
  personEventRankings: ["person-event-rankings"],
  cityEventStats: ["city-rankings"],
  sumOfRanks: ["sum-of-ranks"],
  yearlyPersonRankings: ["yearly-person-rankings"],
};

export function projectionGroup(name: string): DeploymentProjectionGroup {
  const group = DEPLOYMENT_PROJECTION_GROUPS.find(
    (candidate) => candidate.name === name,
  );
  if (!group) {
    throw new Error(`Unknown deployment projection group: ${name}`);
  }
  return group;
}

export interface GroupDependencyClosureOptions {
  includeSelected?: boolean;
}

export function groupDependencyClosure(
  names: readonly string[],
  options: GroupDependencyClosureOptions = {},
): DeploymentProjectionGroup[] {
  const { includeSelected = true } = options;
  const selected = new Set(names);
  const ordered: DeploymentProjectionGroup[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(name: string): void {
    if (visited.has(name)) return;
    if (visiting.has(name)) {
      throw new Error(`Projection group dependency cycle at ${name}`);
    }
    const group = projectionGroup(name);
    visiting.add(name);
    for (const dependency of group.dependencies) visit(dependency);
    visiting.delete(name);
    visited.add(name);
    if (includeSelected || !selected.has(name)) ordered.push(group);
  }

  for (const name of names) visit(name);
  return ordered;
}

export function downstreamGroupClosure(
  names: readonly string[],
): DeploymentProjectionGroup[] {
  const selected = new Set(names);
  let changed = true;
  while (changed) {
    changed = false;
    for (const group of DEPLOYMENT_PROJECTION_GROUPS) {
      if (
        !selected.has(group.name) &&
        group.dependencies.some((dependency) => selected.has(dependency))
      ) {
        selected.add(group.name);
        changed = true;
      }
    }
  }

  const ordered: DeploymentProjectionGroup[] = [];
  const visited = new Set<string>();
  function visit(name: string): void {
    if (visited.has(name)) return;
    const group = projectionGroup(name);
    for (const dependency of group.dependencies) {
      if (selected.has(dependency)) visit(dependency);
    }
    visited.add(name);
    ordered.push(group);
  }
  for (const group of DEPLOYMENT_PROJECTION_GROUPS) {
    if (selected.has(group.name)) visit(group.name);
  }
  return ordered;
}
