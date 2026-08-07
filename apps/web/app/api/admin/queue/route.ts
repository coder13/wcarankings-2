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
const PAGE_SIZE = 50;
type QueueCursor = Record<QueueState, number>;

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
    const rawCursor = new URL(request.url).searchParams.get("cursor");
    let cursor: QueueCursor = Object.fromEntries(
      states.map((state) => [state, 0]),
    ) as QueueCursor;
    if (rawCursor) {
      try {
        const parsed = JSON.parse(decodeURIComponent(rawCursor)) as unknown;
        if (
          !parsed ||
          typeof parsed !== "object" ||
          states.some(
            (state) =>
              !Number.isInteger((parsed as Record<string, unknown>)[state]) ||
              Number((parsed as Record<string, unknown>)[state]) < 0,
          )
        )
          throw new Error("Invalid queue cursor.");
        cursor = parsed as QueueCursor;
      } catch {
        return Response.json({ error: "Invalid queue cursor." }, { status: 400 });
      }
    }
    const counts = await queue.getJobCounts(...states);
    const groups = await Promise.all(
      states.map(async (state) => ({
        state,
        jobs: await queue.getJobs(
          [state],
          cursor[state],
          cursor[state] + PAGE_SIZE - 1,
          true,
        ),
      })),
    );
    const candidates = groups.flatMap(({ state, jobs }) =>
      jobs
        .map((job) => formatItem(state, job))
        .filter((item): item is QueueItem => item !== null)
        .map((item) => ({ item, state })),
    );
    candidates.sort((left, right) =>
      right.item.createdAt.localeCompare(left.item.createdAt),
    );
    const page = candidates.slice(0, PAGE_SIZE);
    const consumed = Object.fromEntries(
      states.map((state) => [state, cursor[state]]),
    ) as QueueCursor;
    for (const candidate of page) consumed[candidate.state] += 1;
    const total = states.reduce(
      (sum, state) => sum + Number(counts[state] ?? 0),
      0,
    );
    const hasMore = states.some(
      (state) => consumed[state] < Number(counts[state] ?? 0),
    );

    return Response.json(
      {
        items: page.map(({ item }) => item),
        total,
        nextCursor: hasMore ? encodeURIComponent(JSON.stringify(consumed)) : null,
      },
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
