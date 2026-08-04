import type { ProjectionJob } from "../../types.ts";

export const personMetricScoresJob = {
  id: "person-metric-scores",
  dependencies: ["person-metric-values"],
  sqlFiles: ["people/metric-scores/person_metric_scores.sql"],
  tables: ["person_metric_scores", "person_metric_counts"],
  releaseGroup: "person-event-rankings",
  releaseSchemaVersion: 1,
  estimatedDurationMs: 45_000,
  publish: false,
  subject: "people",
  stat: "metric-scores",
} as const satisfies ProjectionJob;
