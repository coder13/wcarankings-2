import type { ProjectionJob } from "../../types.ts";

export const personActivityRankingsJob = {
  id: "person-activity-rankings",
  dependencies: ["person-period-metrics"],
  sqlFiles: ["people/activity-rankings/person_activity_rankings.sql"],
  tables: [
    "person_activity_rankings",
  ],
  releaseGroup: "person-activity-rankings",
  releaseOrder: 6,
  releaseSchemaVersion: 2,
  estimatedDurationMs: 180_000,
  enabledByDefault: false,
  subject: "people",
  stat: "activity-rankings",
} as const satisfies ProjectionJob;
