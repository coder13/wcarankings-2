import type { ProjectionJob } from "../../types.ts";

export const personMetricValuesJob = {
  id: "person-metric-values",
  dependencies: ["person-event-rankings"],
  sqlFiles: ["people/metric-values/person_metric_values.sql"],
  tables: ["person_metric_values"],
  releaseGroup: "person-event-rankings",
  releaseSchemaVersion: 1,
  estimatedDurationMs: 90_000,
  publish: false,
  subject: "people",
  stat: "metric-values",
} as const satisfies ProjectionJob;
