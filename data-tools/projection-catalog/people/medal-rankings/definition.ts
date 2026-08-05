import type { ProjectionJob } from "../../types.ts";

export const personMedalRankingsJob = {
  id: "person-medal-rankings",
  dependencies: ["result-facts"],
  sqlFiles: ["people/medal-rankings/person_medal_rankings.sql"],
  tables: [
    "person_medal_scores",
    "person_medal_rankings",
    "person_medal_ranking_counts",
  ],
  releaseGroup: "person-medal-rankings",
  releaseOrder: 10,
  releaseSchemaVersion: 1,
  estimatedDurationMs: 90_000,
  enabledByDefault: true,
  subject: "people",
  stat: "medal-rankings",
} as const satisfies ProjectionJob;
