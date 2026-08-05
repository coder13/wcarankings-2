import type { RowDataPacket } from "mysql2/promise";
import type { ProjectionConnection } from "../shared/database-types.ts";
import type { BuildPhase, TableProgress } from "./progress-types.ts";

export interface CountRow extends RowDataPacket {
  count: number | string;
}

export interface ProjectionBuildPlan {
  groups: string[];
  includeRankingTables: boolean;
  projectionNames: string[];
  satisfiedProjectionNames: string[];
  tables: string[];
}

export interface ProjectionBuildMatrixInput {
  selectedGroups: readonly string[];
  wave: number;
}

export interface ProjectionBuildMatrixEntry {
  group: string;
  hydrate_groups: string;
}

export interface ProjectionBuildMatrix {
  include: ProjectionBuildMatrixEntry[];
}

export interface ProjectionBuildTiming {
  durationMs: number;
  name: string;
  phases: BuildPhase[];
  rowCounts: Record<string, number>;
}

export interface ProjectionRegistryEntry {
  build(
    connection: ProjectionConnection,
    suffix: string,
    tableProgress: TableProgress,
  ): Promise<BuildPhase[]>;
  dependencies: string[];
  enabledByDefault: boolean;
  estimatedDurationMs: number;
  files: string[];
  name: string;
  tables: string[];
  validate(
    connection: ProjectionConnection,
    suffix: string,
  ): Promise<Record<string, number>>;
}

export type ProjectionConnectionFactory = () => Promise<ProjectionConnection>;

export interface RefreshMysqlSchemaOptions {
  concurrency?: number | string;
  createConnection?: ProjectionConnectionFactory;
  includeRankingTables?: boolean;
  projectionNames?: readonly string[];
  projectionSuffix?: string;
  satisfiedProjectionNames?: readonly string[];
}
