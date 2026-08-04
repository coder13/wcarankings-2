import type { ProjectionJob } from "../../types.ts";

export const cityEventStatsJob = {
  id: "city-event-stats",
  dependencies: ["result-facts"],
  sqlFiles: ["cities/event-stats/city_event_stats.sql"],
  tables: ["city_event_stats"],
  releaseGroup: "city-rankings",
  releaseOrder: 5,
  releaseSchemaVersion: 2,
  estimatedDurationMs: 90_000,
} as const satisfies ProjectionJob;
