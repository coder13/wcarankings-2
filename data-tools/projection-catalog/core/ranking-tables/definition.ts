import type { ProjectionJob } from "../../types.ts";

export const rankingTablesJob = {
  id: "ranking-tables",
  dependencies: ["result-facts"],
  sqlFiles: [
    "core/ranking-tables/wca_best_single.sql",
    "core/ranking-tables/wca_best_average.sql",
    "core/ranking-tables/ranking_entries_single_source.sql",
    "core/ranking-tables/ranking_entries_average_source.sql",
    "core/ranking-tables/ranking_entries_indexes.sql",
    "core/ranking-tables/ranking_counts.sql",
  ],
  tables: [
    "ranking_entries_single",
    "ranking_entries_average",
    "ranking_counts",
  ],
  releaseGroup: "ranking-tables",
  releaseOrder: 0,
  releaseSchemaVersion: 4,
  kind: "core",
} as const satisfies ProjectionJob;
