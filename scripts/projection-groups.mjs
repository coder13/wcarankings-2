/**
 * Projection deployment units and their semantic inputs.
 *
 * Keep this module declarative. It is fingerprinted as projection schema
 * input, while scheduler, progress, and deployment implementation are not.
 */
export const MARIADB_COMPATIBILITY_VERSION = "11.8";
export const PROJECTION_ARTIFACT_FORMAT_VERSION = 3;

export const DEPLOYMENT_PROJECTION_GROUPS = [
  {
    name: "compatibility",
    schemaVersion: 1,
    dependencies: [],
    projectionNames: [],
    tables: [
      "ranking_entries_single",
      "ranking_entries_average",
      "ranking_counts",
      "result_entries_single",
      "result_counts",
    ],
    sqlFiles: [
      "wca_best_single.sql",
      "wca_best_average.sql",
      "ranking_entries_single_source.sql",
      "ranking_entries_average_source.sql",
      "result_entries_single_source.sql",
      "ranking_entries_indexes.sql",
      "result_entries_single_indexes.sql",
      "ranking_counts.sql",
      "result_counts.sql",
    ],
  },
  {
    name: "result-facts",
    schemaVersion: 1,
    dependencies: [],
    projectionNames: ["result-facts"],
    tables: ["result_facts"],
    sqlFiles: ["result_facts.sql"],
  },
  {
    name: "result-rankings",
    schemaVersion: 1,
    dependencies: ["result-facts"],
    projectionNames: ["result-rankings", "result-ranking-counts"],
    tables: ["result_rankings_single", "result_rankings_average", "result_ranking_counts"],
    sqlFiles: ["result_rankings_single.sql", "result_rankings_average.sql", "result_ranking_counts.sql"],
  },
  {
    name: "competition-rankings",
    schemaVersion: 1,
    dependencies: [],
    projectionNames: ["competition-podium-members", "competition-event-stats", "competition-stats"],
    tables: ["competition_podium_members", "competition_event_stats", "competition_stats"],
    sqlFiles: ["competition_podium_members.sql", "competition_event_stats.sql", "competition_stats.sql"],
  },
  {
    name: "person-competition-rankings",
    schemaVersion: 1,
    dependencies: [],
    projectionNames: ["person-competition-rankings"],
    tables: [
      "person_competition_counts",
      "person_competition_rankings",
      "person_competition_ranking_counts",
    ],
    sqlFiles: ["person_competition_rankings.sql"],
  },
  {
    name: "city-rankings",
    schemaVersion: 1,
    dependencies: ["result-facts", "competition-rankings"],
    projectionNames: ["city-event-stats", "entity-ranking-counts"],
    tables: ["city_event_stats", "entity_ranking_counts"],
    sqlFiles: ["city_event_stats.sql", "entity_ranking_counts.sql"],
  },
  {
    name: "sum-of-ranks",
    schemaVersion: 1,
    dependencies: [],
    projectionNames: ["sum-of-ranks"],
    tables: ["person_sum_of_ranks_scores"],
    sqlFiles: ["person_sum_of_ranks_scores.sql"],
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
  },
];

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
  return DEPLOYMENT_PROJECTION_GROUPS.filter(({ name }) => selected.has(name));
}
