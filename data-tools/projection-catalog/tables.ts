import { PROJECTION_JOBS } from "./registry.ts";

export interface SemanticProjectionDefinition {
  dependencies: string[];
  enabledByDefault: boolean;
  estimatedDurationMs: number;
  files: string[];
  name: string;
  tables: string[];
}

export const SEMANTIC_PROJECTION_DEFINITIONS: readonly SemanticProjectionDefinition[] =
  PROJECTION_JOBS.filter((job) => job.kind !== "core").map((job) => ({
    name: job.id,
    dependencies: [...job.dependencies],
    files: [...job.sqlFiles],
    tables: [...job.tables],
    enabledByDefault: job.enabledByDefault ?? false,
    estimatedDurationMs: job.estimatedDurationMs ?? 0,
  }));

export const SEMANTIC_PROJECTION_TABLES =
  SEMANTIC_PROJECTION_DEFINITIONS.flatMap((definition) => definition.tables);

export const DEFAULT_PROJECTION_NAMES = SEMANTIC_PROJECTION_DEFINITIONS.filter(
  (definition) => definition.enabledByDefault,
).map((definition) => definition.name);

const ACTIVE_SEMANTIC_PROJECTION_TABLES =
  SEMANTIC_PROJECTION_DEFINITIONS.filter(
    (definition) => definition.enabledByDefault,
  ).flatMap((definition) => definition.tables);

export const CORE_RANKING_TABLES = [
  "ranking_entries_single",
  "ranking_entries_average",
  "ranking_counts",
] as const;

export const PUBLISHED_PROJECTION_TABLES = [
  ...CORE_RANKING_TABLES,
  ...ACTIVE_SEMANTIC_PROJECTION_TABLES,
];
