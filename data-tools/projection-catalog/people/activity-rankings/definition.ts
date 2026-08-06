import type { ProjectionJob } from "../../types.ts";

export const personActivityRankingsJob = {
  id: "person-activity-rankings",
  dependencies: ["result-facts"],
  sqlFiles: ["people/activity-rankings/person_activity_rankings.sql"],
  tables: [
    "person_activity_counts",
    "person_activity_rankings",
    "person_activity_ranking_counts",
  ],
  releaseGroup: "person-activity-rankings",
  releaseOrder: 6,
  releaseSchemaVersion: 1,
  estimatedDurationMs: 180_000,
  enabledByDefault: false,
  subject: "people",
  stat: "activity-rankings",
} as const satisfies ProjectionJob;
