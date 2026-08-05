import type { ProjectionConnection } from "../shared/database-types.ts";

export interface DependencyTask {
  dependencies: readonly string[];
  estimatedDurationMs: number;
  name: string;
  run(connection: ProjectionConnection): Promise<unknown> | unknown;
}

export type SchedulerConnectionFactory = () => Promise<ProjectionConnection>;

export interface DependencyTaskSchedulerOptions {
  concurrency?: number;
  connection: ProjectionConnection;
  createConnection?: SchedulerConnectionFactory;
  satisfiedDependencies?: readonly string[];
}

export interface CompletedDependencyTask {
  result: unknown;
  task: DependencyTask;
}

export interface FailedDependencyTask {
  error: unknown;
  task: DependencyTask;
}

export type DependencyTaskOutcome =
  CompletedDependencyTask | FailedDependencyTask;

export interface RunningDependencyTask {
  promise: Promise<DependencyTaskOutcome>;
  task: DependencyTask;
}
