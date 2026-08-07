import type { ProjectionJob } from "../../types.ts";

export const personPeriodMetricsJob = {
  id: "person-period-metrics",
  dependencies: ["result-facts"],
  sqlFiles: ["people/shared/person_period_metrics.sql"],
  tables: ["person_period_metrics"],
  releaseGroup: "person-shared-grains",
  releaseOrder: 2,
  releaseSchemaVersion: 1,
  estimatedDurationMs: 180_000,
  enabledByDefault: true,
} as const satisfies ProjectionJob;

export const personEventBestsJob = {
  id: "person-event-bests",
  dependencies: ["result-facts"],
  sqlFiles: ["people/shared/person_event_bests.sql"],
  tables: ["person_event_bests"],
  releaseGroup: "person-shared-grains",
  releaseOrder: 2,
  releaseSchemaVersion: 1,
  estimatedDurationMs: 180_000,
  enabledByDefault: true,
} as const satisfies ProjectionJob;
