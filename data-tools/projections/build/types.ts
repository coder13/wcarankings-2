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

export interface ProjectionTask {
  dependencies: readonly string[];
  estimatedDurationMs: number;
  name: string;
  run(connection: ProjectionConnection): Promise<unknown> | unknown;
}

export interface ProjectionTaskPlan {
  satisfiedTaskNames: string[];
  tasks: readonly ProjectionTask[];
}

export interface ProjectionTaskExecutionResult {
  name: string;
  result: unknown;
}

interface CompletedProjectionTask {
  result: unknown;
  task: ProjectionTask;
}

interface FailedProjectionTask {
  error: unknown;
  task: ProjectionTask;
}

export type ProjectionTaskOutcome =
  CompletedProjectionTask | FailedProjectionTask;

export interface RunningProjectionTask {
  promise: Promise<ProjectionTaskOutcome>;
  task: ProjectionTask;
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

type ProjectionConnectionFactory = () => Promise<ProjectionConnection>;

export interface ProjectionTaskExecutionOptions {
  concurrency?: number;
  connection: ProjectionConnection;
  createConnection?: ProjectionConnectionFactory;
}

export interface BuildProjectionTablesOptions {
  concurrency?: number | string;
  createConnection?: ProjectionConnectionFactory;
  includeRankingTables?: boolean;
  projectionNames?: readonly string[];
  projectionSuffix?: string;
  satisfiedProjectionNames?: readonly string[];
}
