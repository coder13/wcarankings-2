import mysql from "mysql2/promise";
import { Worker } from "bullmq";
import { databaseOptions, recordWorkerHeartbeat } from "@wcarankings/database";
import {
  PROJECTION_JOB_QUEUE_NAME,
  projectionJobConnection,
  type ProjectionJob,
} from "@wcarankings/projection-jobs";
import { processProjectionJob } from "@wcarankings/projection-jobs/processor";
import { supportsProjectionJob } from "@wcarankings/projection-jobs/supported";
import {
  closeWorkerLogger,
  createWorkerLogger,
} from "@wcarankings/worker-logging";
import { ProjectionSourceAdvancedError, retryIfSourceChanged } from "./jobs.ts";

const HEARTBEAT_INTERVAL_MS = 15_000;
const HEARTBEAT_TIMEOUT_SECONDS = 90;
const SLOW_JOB_THRESHOLD_MS = 5_000;

export async function startProjectionWorker(): Promise<void> {
  const logger = createWorkerLogger({
    name: "projection-worker",
    filePath:
      process.env.PROJECTION_WORKER_LOG_FILE ?? "logs/projection-worker.log",
  });
  let connection: mysql.Connection;
  try {
    connection = await mysql.createConnection(databaseOptions());
  } catch (error) {
    logger.error("Projection worker could not start.", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    await closeWorkerLogger(logger);
    throw error;
  }
  let lastHeartbeatAt = 0;
  const heartbeat = async (force = false) => {
    const now = Date.now();
    if (!force && now - lastHeartbeatAt < HEARTBEAT_INTERVAL_MS) return;
    try {
      await recordWorkerHeartbeat(connection, {
        workerName: "projection-worker",
        timeoutSeconds: HEARTBEAT_TIMEOUT_SECONDS,
        details: { concurrency: 1 },
      });
      lastHeartbeatAt = now;
    } catch (error) {
      logger.error("Projection worker heartbeat failed.", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  };
  await heartbeat(true);
  logger.info("Projection worker started.", { concurrency: 1 });
  const heartbeatTimer = setInterval(
    () => void heartbeat().catch(() => undefined),
    HEARTBEAT_INTERVAL_MS,
  );
  heartbeatTimer.unref();
  const worker = new Worker<ProjectionJob>(
    PROJECTION_JOB_QUEUE_NAME,
    async (job) => {
      const startedAt = performance.now();
      const queueWaitMs = Math.max(0, Date.now() - job.timestamp);
      await heartbeat();
      if (!supportsProjectionJob(job.data)) {
        logger.warn(`Skipped unsupported job: ${job.data.key}.`, {
          jobId: job.id,
          attemptsMade: job.attemptsMade,
          ...job.data,
        });
        return;
      }
      try {
        logger.debug("Projection started.", {
          jobId: job.id,
          attemptsMade: job.attemptsMade,
          queueWaitMs,
          ...job.data,
        });
        const projectionStartedAt = performance.now();
        await processProjectionJob(connection, job.data);
        const projectionDurationMs = Math.round(
          performance.now() - projectionStartedAt,
        );
        const validationStartedAt = performance.now();
        await retryIfSourceChanged(job);
        const validationDurationMs = Math.round(
          performance.now() - validationStartedAt,
        );
        const durationMs = Math.round(performance.now() - startedAt);
        const details = {
          jobId: job.id,
          attemptsMade: job.attemptsMade,
          queueWaitMs,
          projectionDurationMs,
          validationDurationMs,
          durationMs,
          ...job.data,
        };
        if (durationMs > SLOW_JOB_THRESHOLD_MS)
          logger.warn(
            `Projection slow: ${job.data.key} (${durationMs}ms).`,
            details,
          );
        else
          logger.info(
            `Projection completed: ${job.data.key} (${durationMs}ms).`,
            details,
          );
      } catch (error) {
        const durationMs = Math.round(performance.now() - startedAt);
        if (error instanceof ProjectionSourceAdvancedError) {
          logger.info(`Projection superseded: ${job.data.key}.`, {
            jobId: job.id,
            attemptsMade: job.attemptsMade,
            queueWaitMs,
            durationMs,
            currentVersion: error.currentVersion,
            latestVersion: error.latestVersion,
            ...job.data,
          });
          throw error;
        }
        const attemptLimit = Number(job.opts.attempts ?? 1);
        const remainingAttempts = Math.max(
          0,
          attemptLimit - job.attemptsMade - 1,
        );
        logger.error(`Projection failed: ${job.data.key} (${durationMs}ms).`, {
          jobId: job.id,
          attemptsMade: job.attemptsMade,
          attemptLimit,
          remainingAttempts,
          finalAttempt: remainingAttempts === 0,
          nextRetryDelayMs: retryDelayMs(job),
          queueWaitMs,
          durationMs,
          ...job.data,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        throw error;
      }
    },
    { connection: projectionJobConnection(), concurrency: 1 },
  );
  worker.on("completed", () => void heartbeat().catch(() => undefined));
  worker.on("failed", () => void heartbeat().catch(() => undefined));
  worker.on("error", (error) => {
    logger.error("Projection queue worker error.", {
      error: error.message,
      stack: error.stack,
    });
  });
  worker.on("stalled", (jobId) => {
    logger.warn(`Projection job stalled: ${jobId}.`, { jobId });
  });
  let stopping = false;
  const stop = async (signal: "SIGINT" | "SIGTERM") => {
    if (stopping) return;
    stopping = true;
    clearInterval(heartbeatTimer);
    logger.info(`Projection worker received ${signal}.`);
    await worker.close();
    await connection.end();
    logger.info("Projection worker stopped.");
    await closeWorkerLogger(logger);
  };
  process.once("SIGINT", () => void stop("SIGINT"));
  process.once("SIGTERM", () => void stop("SIGTERM"));
}

function retryDelayMs(job: import("bullmq").Job<ProjectionJob>): number | null {
  const backoff = job.opts.backoff;
  if (typeof backoff === "number") return backoff;
  if (!backoff || typeof backoff.delay !== "number") return null;
  return backoff.type === "exponential"
    ? backoff.delay * 2 ** job.attemptsMade
    : backoff.delay;
}
