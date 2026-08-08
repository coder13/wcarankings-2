import mysql from "mysql2/promise";
import type { Connection } from "mysql2/promise";
import { Worker } from "bullmq";
import { databaseOptions } from "@wcarankings/database";
import {
  PROJECTION_JOB_QUEUE_NAME,
  RESULT_RANKING_JOB_QUEUE_NAME,
  closeProjectionJobMetrics,
  projectionJobConnection,
  projectionStatName,
  recordProjectionJobDuration,
  type ProjectionJob,
} from "@wcarankings/projection-jobs";
import { processProjectionJob } from "@wcarankings/projection-jobs/processor";
import { supportsProjectionJob } from "@wcarankings/projection-jobs/supported";
import {
  closeWorkerLogger,
  createWorkerLogger,
} from "@wcarankings/worker-logging";
import {
  createWorkerHealthServer,
  type WorkerHealthServer,
} from "@wcarankings/worker-health";
import { ProjectionSourceAdvancedError, retryIfSourceChanged } from "./jobs.ts";
import { setSessionMaxStatementTimeSql } from "./sql.ts";

const DEFAULT_HEALTH_PORT = 3012;
const SLOW_JOB_THRESHOLD_MS = 5_000;
const DEFAULT_QUERY_TIMEOUT_MS = 5 * 60 * 1_000;
const FORCE_STOP_TIMEOUT_MS = 10_000;

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function queryTimeoutSeconds(): number {
  const configured = Number(process.env.PROJECTION_QUERY_TIMEOUT_MS);
  const timeoutMs =
    Number.isFinite(configured) && configured > 0
      ? configured
      : DEFAULT_QUERY_TIMEOUT_MS;
  return timeoutMs / 1_000;
}

export async function startProjectionWorker(): Promise<void> {
  const logger = createWorkerLogger({
    name: "projection-worker",
    filePath:
      process.env.PROJECTION_WORKER_LOG_FILE ?? "logs/projection-worker.log",
  });
  let healthServer: WorkerHealthServer | undefined;
  const resultRankingConcurrency = positiveInteger(
    process.env.PROJECTION_RESULT_RANKING_CONCURRENCY,
    1,
  );
  const otherConcurrency = positiveInteger(
    process.env.PROJECTION_WORKER_CONCURRENCY,
    2,
  );
  let resultConnections: Connection[] = [];
  let otherConnections: Connection[] = [];
  try {
    healthServer = await createWorkerHealthServer({
      port:
        Number(process.env.PROJECTION_WORKER_HEALTH_PORT) ||
        DEFAULT_HEALTH_PORT,
      workerName: "projection-worker",
      onRestart: () => {
        process.kill(process.pid, "SIGTERM");
      },
    });
    const createConnections = (count: number) =>
      Promise.all(
        Array.from({ length: count }, async () => {
          const connection = await mysql.createConnection(databaseOptions());
          await connection.query(
            setSessionMaxStatementTimeSql(queryTimeoutSeconds()),
          );
          return connection;
        }),
      );
    [resultConnections, otherConnections] = await Promise.all([
      createConnections(resultRankingConcurrency),
      createConnections(otherConcurrency),
    ]);
  } catch (error) {
    logger.error("Projection worker could not start.", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    await Promise.all(
      [...resultConnections, ...otherConnections].map((connection) =>
        connection.end().catch(() => undefined),
      ),
    );
    await healthServer?.close().catch(() => undefined);
    await closeWorkerLogger(logger);
    throw error;
  }
  logger.info("Projection worker started.", {
    resultRankingConcurrency,
    otherConcurrency,
    dbConnectionCount: resultConnections.length + otherConnections.length,
    queryTimeoutMs: queryTimeoutSeconds() * 1_000,
  });
  const processJob = async (
    job: import("bullmq").Job<ProjectionJob>,
    connections: Connection[],
    queue: "result-rankings" | "other",
  ) => {
    const startedAt = performance.now();
    const queueWaitMs = Math.max(0, Date.now() - job.timestamp);
    if (!supportsProjectionJob(job.data)) {
      logger.warn(`Skipped unsupported job: ${job.data.key}.`, {
        jobId: job.id,
        attemptsMade: job.attemptsMade,
        ...job.data,
      });
      return;
    }
    const connection = connections.shift();
    if (!connection)
      throw new Error("No projection worker connection available.");
    try {
      logger.debug("Projection started.", {
        queue,
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
      try {
        await recordProjectionJobDuration(job.data.key, durationMs);
      } catch (error) {
        logger.warn("Projection duration metric could not be recorded.", {
          error: error instanceof Error ? error.message : String(error),
          ...job.data,
        });
      }
      const details = {
        queue,
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
      return { stat: projectionStatName(job.data.key), durationMs };
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
    } finally {
      connections.push(connection);
    }
  };
  const workers = [
    new Worker<ProjectionJob>(
      PROJECTION_JOB_QUEUE_NAME,
      (job) => processJob(job, otherConnections, "other"),
      { connection: projectionJobConnection(), concurrency: otherConcurrency },
    ),
    new Worker<ProjectionJob>(
      RESULT_RANKING_JOB_QUEUE_NAME,
      (job) => processJob(job, resultConnections, "result-rankings"),
      {
        connection: projectionJobConnection(),
        concurrency: resultRankingConcurrency,
      },
    ),
  ];
  healthServer.setState("ready");
  for (const worker of workers) {
    worker.on("error", (error) => {
      logger.error("Projection queue worker error.", {
        error: error.message,
        stack: error.stack,
      });
    });
    worker.on("stalled", (jobId) => {
      logger.warn(`Projection job stalled: ${jobId}.`, { jobId });
    });
  }
  let stopping = false;
  const stop = async (signal: "SIGINT" | "SIGTERM") => {
    if (stopping) return;
    stopping = true;
    healthServer?.setState("stopping");
    logger.info(`Projection worker received ${signal}.`);
    const forceStop = setTimeout(() => {
      logger.error("Projection worker did not stop before the deadline.");
      process.exit(1);
    }, FORCE_STOP_TIMEOUT_MS);
    try {
      await Promise.all(workers.map((worker) => worker.close()));
      await Promise.all(
        [...resultConnections, ...otherConnections].map((connection) =>
          connection.end(),
        ),
      );
      await closeProjectionJobMetrics();
      await healthServer?.close();
      logger.info("Projection worker stopped.");
      await closeWorkerLogger(logger);
    } finally {
      clearTimeout(forceStop);
    }
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
