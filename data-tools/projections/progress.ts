// @ts-nocheck
export function elapsedMs(startedAt) {
  return Math.round(performance.now() - startedAt);
}

export function writeBuildLog(message) {
  process.stdout.write(`[projection-build] ${message}\n`);
}

export function createTableProgress(total) {
  let started = 0;
  return {
    start() {
      started += 1;
      return `[${started}/${total}]`;
    },
  };
}

export async function runTimedBuildStep(
  label,
  build,
  { tableProgress, tableName } = {},
) {
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
