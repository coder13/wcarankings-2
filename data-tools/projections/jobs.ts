/**
 * The projection job list is the source of truth for builds and releases.
 * A subject is the item that the stored stat sorts. Supporting jobs have no
 * subject or stat.
 */
export const MARIADB_COMPATIBILITY_VERSION = "11.8";
export const PROJECTION_ARTIFACT_FORMAT_VERSION = 4;

export type ProjectionSubject = "people" | "competitions" | "countries";
export type ProjectionJobKind = "semantic" | "compatibility";

export interface ProjectionJob {
  id: string;
  dependencies: readonly string[];
  sqlFiles: readonly string[];
  tables: readonly string[];
  releaseGroup: string;
  releaseOrder?: number;
  releaseSchemaVersion: number;
  kind?: ProjectionJobKind;
  publish?: boolean;
  enabledByDefault?: boolean;
  subject?: ProjectionSubject;
  stat?: string;
}

export const PROJECTION_JOBS: readonly ProjectionJob[] = [
  { id: "compatibility", dependencies: ["result-facts"], sqlFiles: ["wca_best_single.sql", "wca_best_average.sql", "ranking_entries_single_source.sql", "ranking_entries_average_source.sql", "result_entries_single_source.sql", "ranking_entries_indexes.sql", "result_entries_single_indexes.sql", "ranking_counts.sql", "result_counts.sql"], tables: ["ranking_entries_single", "ranking_entries_average", "ranking_counts", "result_entries_single", "result_counts"], releaseGroup: "compatibility", releaseOrder: 0, releaseSchemaVersion: 4, kind: "compatibility" },
  { id: "result-facts", dependencies: ["raw-wca"], sqlFiles: ["result_facts.sql"], tables: ["result_facts"], releaseGroup: "result-facts", releaseOrder: 1, releaseSchemaVersion: 2, enabledByDefault: true },
  { id: "sum-of-ranks", dependencies: ["result-facts"], sqlFiles: ["person_sum_of_ranks_scores.sql"], tables: ["person_sum_of_ranks_scores"], releaseGroup: "sum-of-ranks", releaseOrder: 6, releaseSchemaVersion: 2, enabledByDefault: true, subject: "people", stat: "sum-of-ranks" },
  { id: "competition-podium-members", dependencies: [], sqlFiles: ["competition_podium_members.sql"], tables: ["competition_podium_members"], releaseGroup: "competition-rankings", releaseOrder: 3, releaseSchemaVersion: 1, enabledByDefault: true, subject: "competitions", stat: "podium-members" },
  { id: "competition-event-stats", dependencies: ["competition-podium-members"], sqlFiles: ["competition_event_stats.sql"], tables: ["competition_event_stats"], releaseGroup: "competition-rankings", releaseSchemaVersion: 1, enabledByDefault: true, subject: "competitions", stat: "event-stats" },
  { id: "competition-stats", dependencies: [], sqlFiles: ["competition_stats.sql"], tables: ["competition_stats"], releaseGroup: "competition-rankings", releaseSchemaVersion: 1, enabledByDefault: true, subject: "competitions", stat: "stats" },
  { id: "result-rankings", dependencies: ["result-facts"], sqlFiles: ["result_rankings_single.sql", "result_rankings_average.sql", "result_gender_rankings_single.sql", "result_gender_rankings_average.sql"], tables: ["result_rankings_single", "result_rankings_average", "result_gender_rankings_single", "result_gender_rankings_average"], releaseGroup: "result-rankings", releaseOrder: 2, releaseSchemaVersion: 2, enabledByDefault: true, subject: "people", stat: "result-rankings" },
  { id: "result-ranking-counts", dependencies: ["result-rankings"], sqlFiles: ["result_ranking_counts.sql", "result_gender_ranking_counts.sql"], tables: ["result_ranking_counts", "result_gender_ranking_counts"], releaseGroup: "result-rankings", releaseSchemaVersion: 2, enabledByDefault: true, subject: "people", stat: "result-ranking-counts" },
  { id: "person-event-rankings", dependencies: ["result-facts"], sqlFiles: ["person_event_rankings.sql"], tables: ["person_event_rankings"], releaseGroup: "person-event-rankings", releaseSchemaVersion: 1, publish: false, subject: "people", stat: "event-rankings" },
  { id: "person-year-rankings", dependencies: ["result-facts"], sqlFiles: ["person_year_ranking_cohorts.sql", "person_year_rankings_single.sql", "person_year_rankings_average.sql", "person_year_ranking_counts.sql"], tables: ["person_year_ranking_cohorts", "person_year_rankings_single", "person_year_rankings_average", "person_year_ranking_counts"], releaseGroup: "yearly-person-rankings", releaseOrder: 7, releaseSchemaVersion: 1, enabledByDefault: true, subject: "people", stat: "year-rankings" },
  { id: "person-ranking-counts", dependencies: ["person-event-rankings"], sqlFiles: ["projection_counts.sql"], tables: ["person_ranking_counts"], releaseGroup: "person-event-rankings", releaseSchemaVersion: 1, publish: false, subject: "people", stat: "ranking-counts" },
  { id: "person-metric-values", dependencies: ["person-event-rankings"], sqlFiles: ["person_metric_values.sql"], tables: ["person_metric_values"], releaseGroup: "person-event-rankings", releaseSchemaVersion: 1, publish: false, subject: "people", stat: "metric-values" },
  { id: "person-metric-scores", dependencies: ["person-metric-values"], sqlFiles: ["person_metric_scores.sql"], tables: ["person_metric_scores", "person_metric_counts"], releaseGroup: "person-event-rankings", releaseSchemaVersion: 1, publish: false, subject: "people", stat: "metric-scores" },
  { id: "person-competition-rankings", dependencies: ["result-facts"], sqlFiles: ["person_competition_rankings.sql"], tables: ["person_competition_counts", "person_competition_rankings", "person_competition_ranking_counts"], releaseGroup: "person-competition-rankings", releaseOrder: 4, releaseSchemaVersion: 2, enabledByDefault: true, subject: "people", stat: "competition-rankings" },
  { id: "city-event-stats", dependencies: ["result-facts"], sqlFiles: ["city_event_stats.sql"], tables: ["city_event_stats"], releaseGroup: "city-rankings", releaseOrder: 5, releaseSchemaVersion: 2 },
  { id: "entity-ranking-counts", dependencies: ["competition-event-stats", "competition-stats", "city-event-stats"], sqlFiles: ["entity_ranking_counts.sql"], tables: ["entity_ranking_counts"], releaseGroup: "city-rankings", releaseSchemaVersion: 2 },
] as const;

function unique<T>(values: readonly T[]) { return [...new Set(values)]; }

const jobById = new Map(PROJECTION_JOBS.map((job) => [job.id, job]));

export const DEPLOYMENT_PROJECTION_GROUPS = unique(PROJECTION_JOBS.filter((job) => job.publish !== false).map((job) => job.releaseGroup)).map((name) => {
  const jobs = PROJECTION_JOBS.filter((job) => job.publish !== false && job.releaseGroup === name);
  return {
    name,
    schemaVersion: jobs[0].releaseSchemaVersion,
    dependencies: unique(jobs.flatMap((job) => job.dependencies)
      .filter((dependency) => dependency !== "raw-wca")
      .map((dependency) => jobById.get(dependency)?.releaseGroup)
      .filter((dependency): dependency is string => dependency !== undefined && dependency !== name)),
    projectionNames: jobs.filter((job) => job.kind !== "compatibility").map((job) => job.id),
    tables: jobs.flatMap((job) => job.tables),
    sqlFiles: unique(jobs.flatMap((job) => job.sqlFiles)),
  };
}).sort((left, right) => left.schemaVersion === right.schemaVersion
  ? (PROJECTION_JOBS.find((job) => job.releaseGroup === left.name)?.releaseOrder ?? 99) - (PROJECTION_JOBS.find((job) => job.releaseGroup === right.name)?.releaseOrder ?? 99)
  : (PROJECTION_JOBS.find((job) => job.releaseGroup === left.name)?.releaseOrder ?? 99) - (PROJECTION_JOBS.find((job) => job.releaseGroup === right.name)?.releaseOrder ?? 99));

export const PROJECTION_CAPABILITIES = { core: ["compatibility"], resultRankings: ["result-rankings"], competitionRankings: ["competition-rankings"], personCompetitionRankings: ["person-competition-rankings"], cityEventStats: ["city-rankings"], sumOfRanks: ["sum-of-ranks"], yearlyPersonRankings: ["yearly-person-rankings"] };

export function projectionGroup(name: string) {
  const group = DEPLOYMENT_PROJECTION_GROUPS.find((candidate) => candidate.name === name);
  if (!group) throw new Error(`Unknown deployment projection group: ${name}`);
  return group;
}

export function groupDependencyClosure(names: readonly string[], { includeSelected = true } = {}) {
  const selected = new Set(names); const ordered: (typeof DEPLOYMENT_PROJECTION_GROUPS)[number][] = []; const visiting = new Set<string>(); const visited = new Set<string>();
  function visit(name: string) { if (visited.has(name)) return; if (visiting.has(name)) throw new Error(`Projection group dependency cycle at ${name}`); const group = projectionGroup(name); visiting.add(name); for (const dependency of group.dependencies) visit(dependency); visiting.delete(name); visited.add(name); if (includeSelected || !selected.has(name)) ordered.push(group); }
  for (const name of names) visit(name); return ordered;
}

export function downstreamGroupClosure(names: readonly string[]) {
  const selected = new Set(names); let changed = true;
  while (changed) {
    changed = false;
    for (const group of DEPLOYMENT_PROJECTION_GROUPS) {
      if (!selected.has(group.name) && group.dependencies.some((dependency) => selected.has(dependency))) {
        selected.add(group.name); changed = true;
      }
    }
  }
  const ordered: (typeof DEPLOYMENT_PROJECTION_GROUPS)[number][] = []; const visited = new Set<string>();
  function visit(name: string) { if (visited.has(name)) return; const group = projectionGroup(name); for (const dependency of group.dependencies) if (selected.has(dependency)) visit(dependency); visited.add(name); ordered.push(group); }
  for (const { name } of DEPLOYMENT_PROJECTION_GROUPS) if (selected.has(name)) visit(name);
  return ordered;
}
