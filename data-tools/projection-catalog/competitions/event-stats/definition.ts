import type { ProjectionJob } from "../../types.ts";

export const competitionEventStatsJob = {
  id: "competition-event-stats",
  dependencies: ["competition-podium-members"],
  sqlFiles: ["competitions/event-stats/competition_event_stats.sql"],
  tables: ["competition_event_stats"],
  releaseGroup: "competition-rankings",
  releaseSchemaVersion: 1,
  estimatedDurationMs: 90_000,
  enabledByDefault: true,
  subject: "competitions",
  stat: "event-stats",
} as const satisfies ProjectionJob;
