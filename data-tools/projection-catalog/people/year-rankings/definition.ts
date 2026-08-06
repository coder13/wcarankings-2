import type { ProjectionJob } from "../../types.ts";

export const personYearRankingsJob = {
  id: "person-year-rankings",
  dependencies: ["result-facts"],
  sqlFiles: [
    "people/year-rankings/person_year_ranking_cohorts.sql",
    "people/year-rankings/person_year_rankings_single.sql",
    "people/year-rankings/person_year_rankings_average.sql",
    "people/year-rankings/person_year_ranking_counts.sql",
  ],
  tables: [
    "person_year_ranking_cohorts",
    "person_year_rankings_single",
    "person_year_rankings_average",
    "person_year_ranking_counts",
  ],
  releaseGroup: "yearly-person-rankings",
  releaseOrder: 8,
  releaseSchemaVersion: 1,
  estimatedDurationMs: 150_000,
  enabledByDefault: true,
  subject: "people",
  stat: "year-rankings",
} as const satisfies ProjectionJob;
