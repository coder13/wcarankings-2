import type { ProjectionJob } from "../../types.ts";

export const personCompetitionRankingsJob = {
  id: "person-competition-rankings",
  dependencies: ["result-facts"],
  sqlFiles: ["people/competition-rankings/person_competition_rankings.sql"],
  tables: [
    "person_competition_counts",
    "person_competition_rankings",
    "person_competition_ranking_counts",
  ],
  releaseGroup: "person-competition-rankings",
  releaseOrder: 5,
  releaseSchemaVersion: 2,
  estimatedDurationMs: 90_000,
  enabledByDefault: true,
  subject: "people",
  stat: "competition-rankings",
} as const satisfies ProjectionJob;
