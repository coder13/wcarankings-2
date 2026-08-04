import type { ProjectionJob } from "../../types.ts";

export const sumOfRanksJob = {
  id: "sum-of-ranks",
  dependencies: ["result-facts"],
  sqlFiles: ["people/sum-of-ranks/person_sum_of_ranks_scores.sql"],
  tables: ["person_sum_of_ranks_scores"],
  releaseGroup: "sum-of-ranks",
  releaseOrder: 6,
  releaseSchemaVersion: 2,
  estimatedDurationMs: 180_000,
  enabledByDefault: true,
  subject: "people",
  stat: "sum-of-ranks",
} as const satisfies ProjectionJob;
