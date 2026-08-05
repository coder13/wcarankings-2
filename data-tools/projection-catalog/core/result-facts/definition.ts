import type { ProjectionJob } from "../../types.ts";

export const resultFactsJob = {
  id: "result-facts",
  dependencies: ["raw-wca"],
  sqlFiles: ["core/result-facts/result_facts.sql"],
  tables: ["result_facts"],
  releaseGroup: "result-facts",
  releaseOrder: 1,
  releaseSchemaVersion: 2,
  estimatedDurationMs: 150_000,
  enabledByDefault: true,
} as const satisfies ProjectionJob;
