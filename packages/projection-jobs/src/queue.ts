import { Queue, QueueEvents, type JobsOptions } from "bullmq";

export type ProjectionJobKind = "projection-rebuild" | "list-ranking-rebuild";

export interface ProjectionJob {
  kind: ProjectionJobKind;
  key: string;
  version: number;
  payload: Record<string, string>;
}

export const PROJECTION_JOB_QUEUE_NAME = "wcarankings-projection-jobs";
let queue: Queue<ProjectionJob> | undefined;

export function projectionJobConnection() {
  const value = process.env.REDIS_URL;
  if (!value) throw new Error("REDIS_URL is required for projection jobs.");
  const url = new URL(value);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    tls: url.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

export function projectionJobQueue(): Queue<ProjectionJob> {
  queue ??= new Queue<ProjectionJob>(PROJECTION_JOB_QUEUE_NAME, {
    connection: projectionJobConnection(),
  });
  return queue;
}

export function projectionJobEvents(): QueueEvents {
  return new QueueEvents(PROJECTION_JOB_QUEUE_NAME, {
    connection: projectionJobConnection(),
  });
}

function jobId(job: ProjectionJob): string {
  return `${job.kind}-${job.key}`.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function mergeDelimitedValues(current = "", next = ""): string {
  return [...new Set([...current.split(","), ...next.split(",")])]
    .filter(Boolean)
    .sort()
    .join(",");
}

function mergeJobData(
  current: ProjectionJob,
  next: ProjectionJob,
): ProjectionJob {
  const payload = { ...current.payload, ...next.payload };
  for (const key of Object.keys(payload)) {
    if (!key.endsWith("Ids")) continue;
    payload[key] = mergeDelimitedValues(
      current.payload[key],
      next.payload[key],
    );
  }
  return { ...next, payload };
}

const jobOptions: JobsOptions = {
  attempts: 8,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: true,
  removeOnFail: false,
};

/**
 * Keeps one queue job per rebuild key. A later source version overwrites the
 * waiting job data. Workers reload the job before acknowledging it, so an
 * update during an active build produces one follow-up build, not many jobs.
 */
export async function enqueueProjectionJob(job: ProjectionJob): Promise<void> {
  const queue = projectionJobQueue();
  const id = jobId(job);
  const existing = await queue.getJob(id);
  if (existing) {
    const current = existing.data;
    if (job.version > current.version)
      await existing.updateData(mergeJobData(current, job));
    return;
  }
  await queue.add(job.kind, job, { ...jobOptions, jobId: id });
}

export async function closeProjectionJobQueue(): Promise<void> {
  await queue?.close();
  queue = undefined;
}
