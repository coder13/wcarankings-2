import type { Job } from "bullmq";
import {
  projectionJobQueue,
  type ProjectionJob,
} from "@wcarankings/projection-jobs";

export class ProjectionSourceAdvancedError extends Error {
  constructor(
    readonly currentVersion: number,
    readonly latestVersion: number,
  ) {
    super(
      `Projection source advanced from ${currentVersion} to ${latestVersion}.`,
    );
    this.name = "ProjectionSourceAdvancedError";
  }
}

export async function retryIfSourceChanged(
  job: Job<ProjectionJob>,
): Promise<void> {
  if (!job.id) throw new Error("Projection job has no ID.");
  const latest = await projectionJobQueue().getJob(job.id);
  if (latest && latest.data.version > job.data.version)
    throw new ProjectionSourceAdvancedError(
      job.data.version,
      latest.data.version,
    );
}
