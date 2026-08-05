import type {
  BuildStartTime,
  BuildStep,
  TableProgress,
  TimedBuildStepOptions,
  TimedBuildStepResult,
} from "./progress-types.ts";

export function elapsedMs(startedAt: BuildStartTime): number {
  return Math.round(performance.now() - startedAt);
}

export function writeBuildLog(message: string): void {
  process.stdout.write(`[projection-build] ${message}\n`);
}

export function createTableProgress(total: number): TableProgress {
  let started = 0;
  return {
    start() {
      started += 1;
      return `[${started}/${total}]`;
    },
  };
}

export async function runTimedBuildStep(
  label: string,
  build: BuildStep,
  options: TimedBuildStepOptions = {},
): Promise<TimedBuildStepResult> {
  const { tableProgress, tableName } = options;
  const startedAt = performance.now();
  const progress =
    tableProgress && tableName ? `${tableProgress.start(tableName)} ` : "";
  writeBuildLog(`${progress}Starting ${label}…`);
  try {
    const result = await build();
    const durationMs = elapsedMs(startedAt);
    writeBuildLog(`Finished ${label} in ${durationMs}ms.`);
    return { result, durationMs };
  } catch (error) {
    writeBuildLog(`Failed ${label} after ${elapsedMs(startedAt)}ms.`);
    throw error;
  }
}
