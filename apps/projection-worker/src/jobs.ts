import type { Job } from "bullmq";
import {
  projectionJobQueue,
  type ProjectionJob,
} from "@wcarankings/projection-jobs";

export async function retryIfSourceChanged(
  job: Job<ProjectionJob>,
): Promise<void> {
  if (!job.id) throw new Error("Projection job has no ID.");
  const latest = await projectionJobQueue().getJob(job.id);
  if (latest && latest.data.version > job.data.version)
    throw new Error(
      `Projection source advanced from ${job.data.version} to ${latest.data.version}.`,
    );
}
