import type { ProjectionJob } from "../../types.ts";

export const personYearRankingsJob = {
  id: "person-year-rankings",
  dependencies: ["person-event-bests"],
  sqlFiles: [
    "people/year-rankings/person_year_ranking_cohorts.sql",
    "people/year-rankings/person_year_rankings_single.sql",
    "people/year-rankings/person_year_rankings_average.sql",
  ],
  tables: [
    "person_year_ranking_cohorts",
    "person_year_rankings_single",
    "person_year_rankings_average",
  ],
  releaseGroup: "yearly-person-rankings",
  releaseOrder: 8,
  releaseSchemaVersion: 2,
  estimatedDurationMs: 150_000,
  enabledByDefault: true,
  subject: "people",
  stat: "year-rankings",
} as const satisfies ProjectionJob;
