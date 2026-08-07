import mysql from "mysql2/promise";
import { argumentValue } from "@wcarankings/cli";
import { databaseOptions } from "@wcarankings/database";
import {
  closeProjectionJobQueue,
  projectionJobQueue,
  type ProjectionJob,
} from "@wcarankings/projection-jobs";
import { processProjectionJob } from "@wcarankings/projection-jobs/processor";

const jobId = argumentValue("job-id");
const runnableStates = new Set(["waiting", "delayed", "failed", "prioritized"]);

const main = async (): Promise<void> => {
  if (!jobId) throw new Error("Pass --job-id for the queue item to process.");
  const queue = projectionJobQueue();
  const job = await queue.getJob(jobId);
  if (!job) throw new Error(`Projection queue job was not found: ${jobId}.`);
  const state = await job.getState();
  if (state === "active")
    throw new Error(
      "Stop the projection worker before processing an active job.",
    );
  if (!runnableStates.has(state))
    throw new Error(`Projection queue job cannot run from state: ${state}.`);
  const connection = await mysql.createConnection(databaseOptions());
  try {
    await processProjectionJob(connection, job.data as ProjectionJob);
    await job.remove();
    process.stdout.write(`Processed projection queue job ${jobId}.\n`);
  } finally {
    await connection.end();
    await closeProjectionJobQueue();
  }
};

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
