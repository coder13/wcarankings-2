import type { ProjectionJob } from "../../types.ts";

export const personPrStreakRankingsJob = {
  id: "person-pr-streak-rankings",
  dependencies: ["result-facts"],
  sqlFiles: ["people/pr-streak-rankings/person_pr_streak_rankings.sql"],
  tables: [
    "person_pr_streak_counts",
    "person_pr_streak_year_counts",
    "person_pr_streak_rankings",
    "person_pr_streak_ranking_counts",
  ],
  releaseGroup: "person-pr-streak-rankings",
  releaseOrder: 5,
  releaseSchemaVersion: 1,
  estimatedDurationMs: 300_000,
  enabledByDefault: true,
  subject: "people",
  stat: "pr-streak",
} as const satisfies ProjectionJob;
