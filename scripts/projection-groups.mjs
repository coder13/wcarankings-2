/**
 * Projection deployment units and their semantic inputs.
 *
 * Keep this module declarative. It is fingerprinted as projection schema
 * input, while scheduler, progress, and deployment implementation are not.
 */
export const MARIADB_COMPATIBILITY_VERSION = "11.8";
export const PROJECTION_ARTIFACT_FORMAT_VERSION = 4;

export const DEPLOYMENT_PROJECTION_GROUPS = [
  {
    name: "compatibility",
    schemaVersion: 5,
    dependencies: ["result-facts"],
    projectionNames: [],
    tables: [
      "ranking_entries_single",
      "ranking_entries_average",
      "ranking_counts",
    ],
    sqlFiles: [
      "wca_best_single.sql",
      "wca_best_average.sql",
      "ranking_entries_single_source.sql",
      "ranking_entries_average_source.sql",
      "ranking_entries_indexes.sql",
      "ranking_counts.sql",
    ],
    indexSources: [
      { table: "ranking_entries_single", sourceTable: "ranking_entries", file: "ranking_entries_indexes.sql" },
      { table: "ranking_entries_average", sourceTable: "ranking_entries", file: "ranking_entries_indexes.sql" },
    ],
    retiredTables: ["result_entries_single", "result_counts"],
  },
  {
    name: "result-facts",
    schemaVersion: 3,
    dependencies: [],
    projectionNames: ["result-facts"],
    tables: ["result_facts"],
    sqlFiles: ["result_facts.sql"],
    indexSources: [
      { table: "result_facts", file: "result_facts.sql", deferDuringBuild: false },
    ],
  },
  {
    name: "result-rankings",
    schemaVersion: 7,
    dependencies: ["result-facts"],
    projectionNames: ["result-rankings", "result-ranking-counts"],
    tables: ["result_rankings_single", "result_rankings_average", "result_ranking_counts"],
    sqlFiles: ["solve_facts.sql", "result_rankings_single.sql", "result_rankings_average.sql", "solve_facts_cleanup.sql", "result_ranking_counts.sql"],
    indexSources: [
      { table: "result_rankings_single", file: "result_rankings_single.sql" },
      { table: "result_rankings_average", file: "result_rankings_average.sql" },
    ],
    retiredTables: [
      "result_gender_ranking_counts",
      "result_gender_rankings_average",
      "result_gender_rankings_single",
      "solve_facts",
      "solve_personal_rankings",
    ],
  },
  {
    name: "competition-rankings",
    schemaVersion: 1,
    dependencies: [],
    projectionNames: ["competition-podium-members", "competition-event-stats", "competition-stats"],
    tables: ["competition_podium_members", "competition_event_stats", "competition_stats"],
    sqlFiles: ["competition_podium_members.sql", "competition_event_stats.sql", "competition_stats.sql"],
    indexSources: [
      { table: "competition_podium_members", file: "competition_podium_members.sql" },
      { table: "competition_event_stats", file: "competition_event_stats.sql" },
      { table: "competition_stats", file: "competition_stats.sql" },
    ],
  },
  {
    name: "person-competition-rankings",
    schemaVersion: 5,
    dependencies: ["result-facts"],
    projectionNames: ["person-event-rankings", "person-ranking-counts", "person-competition-rankings"],
    tables: [
      "person_event_rankings",
      "person_ranking_counts",
      "person_competition_counts",
      "person_competition_rankings",
      "person_competition_ranking_counts",
    ],
    sqlFiles: ["person_event_rankings.sql", "projection_counts.sql", "person_competition_rankings.sql"],
    indexSources: [
      { table: "person_event_rankings", file: "person_event_rankings.sql" },
      { table: "person_competition_rankings", file: "person_competition_rankings.sql" },
    ],
    retiredTables: [
      "person_metric_values",
      "person_metric_scores",
      "person_metric_counts",
    ],
  },
  {
    name: "city-rankings",
    schemaVersion: 2,
    dependencies: ["result-facts", "competition-rankings"],
    projectionNames: ["city-event-stats", "entity-ranking-counts"],
    tables: ["city_event_stats", "entity_ranking_counts"],
    sqlFiles: ["city_event_stats.sql", "entity_ranking_counts.sql"],
    indexSources: [
      { table: "city_event_stats", file: "city_event_stats.sql" },
    ],
  },
  {
    name: "sum-of-ranks",
    schemaVersion: 3,
    dependencies: ["result-facts"],
    projectionNames: ["sum-of-ranks"],
    tables: ["person_sum_of_ranks_scores"],
    sqlFiles: ["person_sum_of_ranks_scores.sql"],
    indexSources: [
      { table: "person_sum_of_ranks_scores", file: "person_sum_of_ranks_scores.sql" },
    ],
    retiredTables: ["person_sum_of_ranks_event_values"],
  },
  {
    name: "yearly-person-rankings",
    schemaVersion: 1,
    dependencies: ["result-facts"],
    projectionNames: ["person-year-rankings"],
    tables: [
      "person_year_ranking_cohorts",
      "person_year_rankings_single",
      "person_year_rankings_average",
      "person_year_ranking_counts",
    ],
    sqlFiles: [
      "person_year_ranking_cohorts.sql",
      "person_year_rankings_single.sql",
      "person_year_rankings_average.sql",
      "person_year_ranking_counts.sql",
    ],
    indexSources: [
      { table: "person_year_ranking_cohorts", file: "person_year_ranking_cohorts.sql" },
      { table: "person_year_rankings_single", file: "person_year_rankings_single.sql" },
      { table: "person_year_rankings_average", file: "person_year_rankings_average.sql" },
    ],
  },
];

export const RETIRED_PROJECTION_TABLES = [...new Set(
  DEPLOYMENT_PROJECTION_GROUPS.flatMap(({ retiredTables = [] }) => retiredTables),
)];

export const DEFERRED_PROJECTION_INDEX_TABLES = new Set(
  DEPLOYMENT_PROJECTION_GROUPS.flatMap(({ indexSources = [] }) =>
    indexSources
      .filter(({ deferDuringBuild = true }) => deferDuringBuild)
      .map(({ table }) => table)),
);

export const PROJECTION_CAPABILITIES = {
  core: ["compatibility"],
  resultRankings: ["result-rankings"],
  competitionRankings: ["competition-rankings"],
  personCompetitionRankings: ["person-competition-rankings"],
  cityEventStats: ["city-rankings"],
  sumOfRanks: ["sum-of-ranks"],
  yearlyPersonRankings: ["yearly-person-rankings"],
};

export function projectionGroup(name) {
  const group = DEPLOYMENT_PROJECTION_GROUPS.find((candidate) => candidate.name === name);
  if (!group) throw new Error(`Unknown deployment projection group: ${name}`);
  return group;
}

export function groupDependencyClosure(names, { includeSelected = true } = {}) {
  const selected = new Set(names);
  const ordered = [];
  const visiting = new Set();
  const visited = new Set();

  function visit(name) {
    if (visited.has(name)) return;
    if (visiting.has(name)) throw new Error(`Projection group dependency cycle at ${name}`);
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

export function downstreamGroupClosure(names) {
  const selected = new Set(names);
  let changed = true;
  while (changed) {
    changed = false;
    for (const group of DEPLOYMENT_PROJECTION_GROUPS) {
      if (!selected.has(group.name) && group.dependencies.some((dependency) => selected.has(dependency))) {
        selected.add(group.name);
        changed = true;
      }
    }
  }
  const ordered = [];
  const visited = new Set();
  function visit(name) {
    if (visited.has(name)) return;
    const group = projectionGroup(name);
    for (const dependency of group.dependencies) {
      if (selected.has(dependency)) visit(dependency);
    }
    visited.add(name);
    ordered.push(group);
  }
  for (const { name } of DEPLOYMENT_PROJECTION_GROUPS) {
    if (selected.has(name)) visit(name);
  }
  return ordered;
}
