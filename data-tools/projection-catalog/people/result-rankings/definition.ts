import type { ProjectionJob } from "../../types.ts";

export const resultRankingsJobs = [
  {
    id: "result-rankings",
    dependencies: ["result-facts"],
    sqlFiles: [
      "people/result-rankings/solve_facts.sql",
      "people/result-rankings/result_rankings_single.sql",
      "people/result-rankings/result_rankings_average.sql",
      "people/result-rankings/result_gender_rankings_single.sql",
      "people/result-rankings/result_gender_rankings_average.sql",
      "people/result-rankings/solve_facts_cleanup.sql",
    ],
    tables: [
      "result_rankings_single",
      "result_rankings_average",
      "result_gender_rankings_single",
      "result_gender_rankings_average",
    ],
    releaseGroup: "result-rankings",
    releaseOrder: 2,
    releaseSchemaVersion: 2,
    estimatedDurationMs: 150_000,
    enabledByDefault: true,
    subject: "people",
    stat: "result-rankings",
  },
  {
    id: "result-ranking-counts",
    dependencies: ["result-rankings"],
    sqlFiles: [
      "people/result-rankings/result_ranking_counts.sql",
      "people/result-rankings/result_gender_ranking_counts.sql",
    ],
    tables: ["result_ranking_counts", "result_gender_ranking_counts"],
    releaseGroup: "result-rankings",
    releaseSchemaVersion: 2,
    estimatedDurationMs: 15_000,
    enabledByDefault: true,
    subject: "people",
    stat: "result-ranking-counts",
  },
] as const satisfies readonly ProjectionJob[];
