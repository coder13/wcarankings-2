import type { ProjectionJob } from "../../types.ts";

export const countryEventStatsJob = {
  id: "country-event-stats",
  dependencies: ["result-facts"],
  sqlFiles: ["countries/event-stats/country_event_stats.sql"],
  tables: ["country_event_stats"],
  releaseGroup: "country-rankings",
  releaseOrder: 6,
  releaseSchemaVersion: 1,
  estimatedDurationMs: 120_000,
  enabledByDefault: true,
  subject: "countries",
  stat: "event-stats",
} as const satisfies ProjectionJob;
