import { cityEventStatsJob } from "../projection-catalog/cities/event-stats/definition.ts";
import { competitionEventStatsJob } from "../projection-catalog/competitions/event-stats/definition.ts";
import { competitionPodiumMembersJob } from "../projection-catalog/competitions/podium-members/definition.ts";
import { competitionStatsJob } from "../projection-catalog/competitions/stats/definition.ts";
import { rankingTablesJob } from "../projection-catalog/core/ranking-tables/definition.ts";
import { entityRankingCountsJob } from "../projection-catalog/core/entity-ranking-counts/definition.ts";
import { resultFactsJob } from "../projection-catalog/core/result-facts/definition.ts";
import { personCompetitionRankingsJob } from "../projection-catalog/people/competition-rankings/definition.ts";
import { personEventRankingsJobs } from "../projection-catalog/people/event-rankings/definition.ts";
import { personMetricScoresJob } from "../projection-catalog/people/metric-scores/definition.ts";
import { personMetricValuesJob } from "../projection-catalog/people/metric-values/definition.ts";
import { resultRankingsJobs } from "../projection-catalog/people/result-rankings/definition.ts";
import { sumOfRanksJob } from "../projection-catalog/people/sum-of-ranks/definition.ts";
import { personYearRankingsJob } from "../projection-catalog/people/year-rankings/definition.ts";
export type {
  ProjectionJob,
  ProjectionJobKind,
  ProjectionSubject,
} from "../projection-catalog/types.ts";
import type { ProjectionJob } from "../projection-catalog/types.ts";

export const MARIADB_COMPATIBILITY_VERSION = "11.8";
export const PROJECTION_ARTIFACT_FORMAT_VERSION = 4;

export const PROJECTION_JOBS: readonly ProjectionJob[] = [
  rankingTablesJob,
  resultFactsJob,
  sumOfRanksJob,
  competitionPodiumMembersJob,
  competitionEventStatsJob,
  competitionStatsJob,
  ...resultRankingsJobs,
  ...personEventRankingsJobs,
  personYearRankingsJob,
  personMetricValuesJob,
  personMetricScoresJob,
  personCompetitionRankingsJob,
  cityEventStatsJob,
  entityRankingCountsJob,
] as const;

function unique<T>(values: readonly T[]) {
  return [...new Set(values)];
}

const jobById = new Map(PROJECTION_JOBS.map((job) => [job.id, job]));

export const DEPLOYMENT_PROJECTION_GROUPS = unique(
  PROJECTION_JOBS.filter((job) => job.publish !== false).map(
    (job) => job.releaseGroup,
  ),
)
  .map((name) => {
    const jobs = PROJECTION_JOBS.filter(
      (job) => job.publish !== false && job.releaseGroup === name,
    );
    return {
      name,
      schemaVersion: jobs[0].releaseSchemaVersion,
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
      tables: jobs.flatMap((job) => job.tables),
      sqlFiles: unique(jobs.flatMap((job) => job.sqlFiles)),
    };
  })
  .sort((left, right) =>
    left.schemaVersion === right.schemaVersion
      ? (PROJECTION_JOBS.find((job) => job.releaseGroup === left.name)
          ?.releaseOrder ?? 99) -
        (PROJECTION_JOBS.find((job) => job.releaseGroup === right.name)
          ?.releaseOrder ?? 99)
      : (PROJECTION_JOBS.find((job) => job.releaseGroup === left.name)
          ?.releaseOrder ?? 99) -
        (PROJECTION_JOBS.find((job) => job.releaseGroup === right.name)
          ?.releaseOrder ?? 99),
  );

export const PROJECTION_CAPABILITIES = {
  core: ["ranking-tables"],
  resultRankings: ["result-rankings"],
  competitionRankings: ["competition-rankings"],
  personCompetitionRankings: ["person-competition-rankings"],
  cityEventStats: ["city-rankings"],
  sumOfRanks: ["sum-of-ranks"],
  yearlyPersonRankings: ["yearly-person-rankings"],
};

export function projectionGroup(name: string) {
  const group = DEPLOYMENT_PROJECTION_GROUPS.find(
    (candidate) => candidate.name === name,
  );
  if (!group) throw new Error(`Unknown deployment projection group: ${name}`);
  return group;
}

export function groupDependencyClosure(
  names: readonly string[],
  { includeSelected = true } = {},
) {
  const selected = new Set(names);
  const ordered: (typeof DEPLOYMENT_PROJECTION_GROUPS)[number][] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(name: string) {
    if (visited.has(name)) return;
    if (visiting.has(name))
      throw new Error(`Projection group dependency cycle at ${name}`);
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

export function downstreamGroupClosure(names: readonly string[]) {
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
  const ordered: (typeof DEPLOYMENT_PROJECTION_GROUPS)[number][] = [];
  const visited = new Set<string>();
  function visit(name: string) {
    if (visited.has(name)) return;
    const group = projectionGroup(name);
    for (const dependency of group.dependencies)
      if (selected.has(dependency)) visit(dependency);
    visited.add(name);
    ordered.push(group);
  }
  for (const { name } of DEPLOYMENT_PROJECTION_GROUPS)
    if (selected.has(name)) visit(name);
  return ordered;
}
