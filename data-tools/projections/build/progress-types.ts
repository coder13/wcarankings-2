export type BuildStartTime = number;

export type BuildStep = () => Promise<unknown>;

export type StopBuildHeartbeat = () => void;

export interface TableProgress {
  start(tableName?: string): string;
}

export interface TimedBuildStepOptions {
  tableName?: string;
  tableProgress?: TableProgress;
}

export interface TimedBuildStepResult {
  durationMs: number;
  result: unknown;
}

export interface BuildPhase {
  durationMs: number;
  name: string;
}
