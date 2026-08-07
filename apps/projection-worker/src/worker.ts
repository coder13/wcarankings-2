import mysql from "mysql2/promise";
import { Worker } from "bullmq";
import { databaseOptions, recordWorkerHeartbeat } from "@wcarankings/database";
import {
  PROJECTION_JOB_QUEUE_NAME,
  projectionJobConnection,
  type ProjectionJob,
} from "@wcarankings/projection-jobs";
import { processProjectionJob } from "@wcarankings/projection-jobs/processor";
import { retryIfSourceChanged } from "./jobs.ts";
import { ProjectionWorkerLogger } from "./logging.ts";

const HEARTBEAT_INTERVAL_MS = 15_000;
const HEARTBEAT_TIMEOUT_SECONDS = 90;
const SLOW_JOB_THRESHOLD_MS = 5_000;

export async function startProjectionWorker(): Promise<void> {
  const connection = await mysql.createConnection(databaseOptions());
  let lastHeartbeatAt = 0;
  const heartbeat = async (force = false) => {
    const now = Date.now();
    if (!force && now - lastHeartbeatAt < HEARTBEAT_INTERVAL_MS) return;
    await recordWorkerHeartbeat(connection, {
      workerName: "projection-worker",
      timeoutSeconds: HEARTBEAT_TIMEOUT_SECONDS,
      details: { concurrency: 1 },
    });
    lastHeartbeatAt = now;
  };
  await heartbeat(true);
  const logger = new ProjectionWorkerLogger();
  const heartbeatTimer = setInterval(
    () => void heartbeat(),
    HEARTBEAT_INTERVAL_MS,
  );
  heartbeatTimer.unref();
  const worker = new Worker<ProjectionJob>(
    PROJECTION_JOB_QUEUE_NAME,
    async (job) => {
      const startedAt = performance.now();
      await heartbeat();
      try {
        await processProjectionJob(connection, job.data);
        await retryIfSourceChanged(job);
      } finally {
        const durationMs = Math.round(performance.now() - startedAt);
        const level = durationMs > SLOW_JOB_THRESHOLD_MS ? "slow" : "complete";
        logger.write(
          `[projection-worker] ${level} ${job.data.key} in ${durationMs}ms.\n`,
        );
      }
    },
    { connection: projectionJobConnection(), concurrency: 1 },
  );
  worker.on("completed", () => void heartbeat());
  worker.on("failed", () => void heartbeat());
  const stop = async () => {
    clearInterval(heartbeatTimer);
    await worker.close();
    await logger.flush();
    await connection.end();
  };
  process.once("SIGINT", () => void stop());
  process.once("SIGTERM", () => void stop());
}
