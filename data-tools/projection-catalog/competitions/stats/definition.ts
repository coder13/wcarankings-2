import type { ProjectionJob } from "../../types.ts";

export const competitionStatsJob = {
  id: "competition-stats",
  dependencies: [],
  sqlFiles: ["competitions/stats/competition_stats.sql"],
  tables: ["competition_stats"],
  releaseGroup: "competition-rankings",
  releaseSchemaVersion: 1,
  estimatedDurationMs: 30_000,
  enabledByDefault: true,
  subject: "competitions",
  stat: "stats",
} as const satisfies ProjectionJob;
