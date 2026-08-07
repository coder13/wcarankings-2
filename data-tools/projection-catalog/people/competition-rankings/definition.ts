import type { ProjectionJob } from "../../types.ts";

export const personCompetitionRankingsJob = {
  id: "person-competition-rankings",
  dependencies: ["person-period-metrics"],
  sqlFiles: ["people/competition-rankings/person_competition_rankings.sql"],
  tables: [
    "person_competition_rankings",
  ],
  releaseGroup: "person-competition-rankings",
  releaseOrder: 5,
  releaseSchemaVersion: 5,
  estimatedDurationMs: 90_000,
  enabledByDefault: true,
  subject: "people",
  stat: "competition-rankings",
} as const satisfies ProjectionJob;
