import {
  projectionJobQueue,
  type ProjectionJob,
} from "@wcarankings/projection-jobs";
import { rejectNonAdmin } from "@/lib/admin-access";

export const dynamic = "force-dynamic";

const states = [
  "waiting",
  "prioritized",
  "delayed",
  "active",
  "failed",
] as const;
const removableStates = [
  "waiting",
  "prioritized",
  "delayed",
  "failed",
] as const;
type QueueState = (typeof states)[number];

type QueueItem = {
  id: string;
  state: QueueState;
  kind: ProjectionJob["kind"];
  key: string;
  payload: Record<string, string>;
  createdAt: string;
  processedAt: string | null;
  failedReason: string | null;
  attemptsMade: number;
};

function formatItem(
  state: QueueState,
  job: {
    id?: string;
    data: ProjectionJob;
    timestamp: number;
    processedOn?: number;
    failedReason?: string;
    attemptsMade: number;
  },
): QueueItem | null {
  if (!job.id) return null;
  return {
    id: job.id,
    state,
    kind: job.data.kind,
    key: job.data.key,
    payload: job.data.payload,
    createdAt: new Date(job.timestamp).toISOString(),
    processedAt: job.processedOn
      ? new Date(job.processedOn).toISOString()
      : null,
    failedReason: job.failedReason ?? null,
    attemptsMade: job.attemptsMade,
  };
}

export async function GET(request: Request) {
  const rejection = await rejectNonAdmin(request);
  if (rejection) return rejection;
  try {
    const queue = projectionJobQueue();
    const groups = await Promise.all(
      states.map(async (state) => ({
        state,
        jobs: await queue.getJobs([state], 0, 199, true),
      })),
    );
    const items = groups
      .flatMap(({ state, jobs }) => jobs.map((job) => formatItem(state, job)))
      .filter((item): item is QueueItem => item !== null)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    return Response.json(
      { items, limited: items.length === 1_000 },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The projection queue is unavailable.",
      },
      { status: 503 },
    );
  }
}

export async function DELETE(request: Request) {
  const rejection = await rejectNonAdmin(request);
  if (rejection) return rejection;
  let body: { jobId?: unknown };
  try {
    body = (await request.json()) as { jobId?: unknown };
  } catch {
    return Response.json(
      { error: "Send a JSON request body." },
      { status: 400 },
    );
  }
  if (typeof body.jobId !== "string" || body.jobId.length === 0)
    return Response.json(
      { error: "A queue job ID is required." },
      { status: 400 },
    );

  try {
    const queue = projectionJobQueue();
    const job = await queue.getJob(body.jobId);
    if (!job)
      return Response.json(
        { error: "The queue item no longer exists." },
        { status: 404 },
      );
    const state = await job.getState();
    if (state === "active")
      return Response.json(
        { error: "An active queue item cannot be removed." },
        { status: 409 },
      );
    await job.remove();
    return Response.json({ removed: body.jobId });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The queue item could not be removed.",
      },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const rejection = await rejectNonAdmin(request);
  if (rejection) return rejection;
  let body: { confirmed?: unknown };
  try {
    body = (await request.json()) as { confirmed?: unknown };
  } catch {
    return Response.json(
      { error: "Send a JSON request body." },
      { status: 400 },
    );
  }
  if (body.confirmed !== true)
    return Response.json(
      { error: "Confirm before you clear the queue." },
      { status: 400 },
    );

  try {
    const queue = projectionJobQueue();
    let removed = 0;
    for (const state of removableStates) {
      while (true) {
        const jobs = await queue.getJobs([state], 0, 999, true);
        if (jobs.length === 0) break;
        await Promise.all(jobs.map((job) => job.remove()));
        removed += jobs.length;
      }
    }
    const active = await queue.getJobs(["active"], 0, 0);
    return Response.json({ removed, active: active.length });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The queue could not be cleared.",
      },
      { status: 503 },
    );
  }
}
