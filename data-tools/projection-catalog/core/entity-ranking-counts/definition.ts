import type { ProjectionJob } from "../../types.ts";

export const entityRankingCountsJob = {
  id: "entity-ranking-counts",
  dependencies: [
    "competition-event-stats",
    "competition-stats",
    "city-event-stats",
  ],
  sqlFiles: ["core/entity-ranking-counts/entity_ranking_counts.sql"],
  tables: ["entity_ranking_counts"],
  releaseGroup: "city-rankings",
  releaseSchemaVersion: 2,
  estimatedDurationMs: 15_000,
} as const satisfies ProjectionJob;
