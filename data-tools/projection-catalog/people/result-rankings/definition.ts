import type { ProjectionJob } from "../../types.ts";

export const resultRankingsJobs = [
  {
    id: "result-rankings",
    dependencies: ["result-facts"],
    sqlFiles: [
      "people/result-rankings/solve_facts.sql",
      "people/result-rankings/result_rankings_single.sql",
      "people/result-rankings/solve_facts_cleanup.sql",
      "people/result-rankings/result_rankings_average.sql",
    ],
    tables: ["result_rankings_single", "result_rankings_average"],
    releaseGroup: "result-rankings",
    releaseOrder: 2,
    releaseSchemaVersion: 4,
    estimatedDurationMs: 150_000,
    enabledByDefault: true,
    subject: "people",
    stat: "result-rankings",
  },
] as const satisfies readonly ProjectionJob[];
