import type { ProjectionJob } from "../../types.ts";

export const compatibilityJob = {
  id: "compatibility",
  dependencies: ["result-facts"],
  sqlFiles: [
    "core/compatibility/wca_best_single.sql",
    "core/compatibility/wca_best_average.sql",
    "core/compatibility/ranking_entries_single_source.sql",
    "core/compatibility/ranking_entries_average_source.sql",
    "core/compatibility/result_entries_single_source.sql",
    "core/compatibility/ranking_entries_indexes.sql",
    "core/compatibility/result_entries_single_indexes.sql",
    "core/compatibility/ranking_counts.sql",
    "core/compatibility/result_counts.sql",
  ],
  tables: [
    "ranking_entries_single",
    "ranking_entries_average",
    "ranking_counts",
    "result_entries_single",
    "result_counts",
  ],
  releaseGroup: "compatibility",
  releaseOrder: 0,
  releaseSchemaVersion: 4,
  kind: "compatibility",
} as const satisfies ProjectionJob;
