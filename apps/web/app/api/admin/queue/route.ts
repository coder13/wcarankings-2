import {
  readProjectionJobMetrics,
  projectionJobQueues,
  type ProjectionJob,
} from "@wcarankings/projection-jobs";
import { rejectNonAdmin } from "@/lib/admin-access";
import { restartWorkerProcess } from "@/lib/admin-runtime";

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
const paginatedStates = states.filter(
  (state): state is Exclude<QueueState, "active"> => state !== "active",
);
type QueueCursor = Record<string, Record<QueueState, number>>;

type QueueItem = {
  id: string;
  queueName: string;
  state: QueueState;
  kind: ProjectionJob["kind"];
  key: string;
  payload: Record<string, string>;
  createdAt: string;
  startedAt: string | null;
  failedReason: string | null;
  attemptsMade: number;
};

type QueueStatCount = {
  stat: string;
  total: number;
  waiting: number;
  active: number;
  failed: number;
  completed: number;
  totalDurationMs: number;
  averageDurationMs: number | null;
};

function formatItem(
  queueName: string,
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
    queueName,
    state,
    kind: job.data.kind,
    key: job.data.key,
    payload: job.data.payload,
    createdAt: new Date(job.timestamp).toISOString(),
    startedAt: job.processedOn ? new Date(job.processedOn).toISOString() : null,
    failedReason: job.failedReason ?? null,
    attemptsMade: job.attemptsMade,
  };
}

function statName(key: string): string {
  return key.split(":", 1)[0] ?? "unknown";
}

async function loadStatCounts(
  queues: ReturnType<typeof projectionJobQueues>,
): Promise<QueueStatCount[]> {
  const metrics = await readProjectionJobMetrics();
  const jobsByQueue = await Promise.all(
    queues.map(
      async (queue) =>
        [
          queue.name,
          await Promise.all(
            states.map(
              async (state) =>
                [state, await queue.getJobs([state], 0, -1, true)] as const,
            ),
          ),
        ] as const,
    ),
  );
  const statCounts = new Map<string, QueueStatCount>();
  for (const [, jobsByState] of jobsByQueue) {
    for (const [state, jobs] of jobsByState) {
      for (const job of jobs) {
        const stat = statName(job.data.key);
        const current = statCounts.get(stat) ?? {
          stat,
          total: 0,
          waiting: 0,
          active: 0,
          failed: 0,
          completed: 0,
          totalDurationMs: 0,
          averageDurationMs: null,
        };
        current.total += 1;
        if (state === "active") current.active += 1;
        else if (state === "failed") current.failed += 1;
        else current.waiting += 1;
        statCounts.set(stat, current);
      }
    }
  }
  for (const metric of metrics) {
    const current = statCounts.get(metric.stat) ?? {
      stat: metric.stat,
      total: 0,
      waiting: 0,
      active: 0,
      failed: 0,
      completed: 0,
      totalDurationMs: 0,
      averageDurationMs: null,
    };
    current.completed = metric.completed;
    current.totalDurationMs = metric.totalDurationMs;
    current.averageDurationMs = metric.averageDurationMs;
    statCounts.set(metric.stat, current);
  }
  return [...statCounts.values()].sort((left, right) =>
    left.stat.localeCompare(right.stat),
  );
}

async function queueJob(jobId: string) {
  for (const queue of projectionJobQueues()) {
    const job = await queue.getJob(jobId);
    if (job) return { job, queue };
  }
  return null;
}

export async function GET(request: Request) {
  const rejection = await rejectNonAdmin(request);
  if (rejection) return rejection;
  try {
    const queues = projectionJobQueues();
    if (new URL(request.url).searchParams.get("view") === "stats")
      return Response.json(
        { countsByStat: await loadStatCounts(queues) },
        { headers: { "Cache-Control": "no-store" } },
      );
    const rawCursor = new URL(request.url).searchParams.get("cursor");
    let cursor: QueueCursor = Object.fromEntries(
      queues.map((queue) => [
        queue.name,
        Object.fromEntries(states.map((state) => [state, 0])),
      ]),
    ) as QueueCursor;
    if (rawCursor) {
      try {
        const parsed = JSON.parse(decodeURIComponent(rawCursor)) as unknown;
        if (
          !parsed ||
          typeof parsed !== "object" ||
          queues.some((queue) =>
            states.some(
              (state) =>
                !Number.isInteger(
                  (parsed as Record<string, Record<string, unknown>>)[
                    queue.name
                  ]?.[state],
                ) ||
                Number(
                  (parsed as Record<string, Record<string, unknown>>)[
                    queue.name
                  ]?.[state],
                ) < 0,
            ),
          )
        )
          throw new Error("Invalid queue cursor.");
        cursor = parsed as QueueCursor;
      } catch {
        return Response.json(
          { error: "Invalid queue cursor." },
          { status: 400 },
        );
      }
    }
    const queueData = await Promise.all(
      queues.map(async (queue) => ({
        counts: await queue.getJobCounts(...states),
        jobsByState: Object.fromEntries(
          await Promise.all(
            states.map(
              async (state) =>
                [
                  state,
                  await queue.getJobs(
                    [state],
                    state === "active" ? 0 : cursor[queue.name]![state],
                    state === "active"
                      ? -1
                      : cursor[queue.name]![state] + PAGE_SIZE - 1,
                    true,
                  ),
                ] as const,
            ),
          ),
        ) as Record<QueueState, Awaited<ReturnType<typeof queue.getJobs>>>,
        queue,
      })),
    );
    const candidates = queueData.flatMap(({ jobsByState, queue }) =>
      paginatedStates.flatMap((state) =>
        jobsByState[state]
          .map((job) => formatItem(queue.name, state, job))
          .filter((item): item is QueueItem => item !== null)
          .map((item) => ({ item, state })),
      ),
    );
    candidates.sort((left, right) =>
      right.item.createdAt.localeCompare(left.item.createdAt),
    );
    const page = candidates.slice(0, PAGE_SIZE);
    const consumed = structuredClone(cursor);
    for (const candidate of page)
      consumed[candidate.item.queueName]![candidate.state] += 1;
    const total = queueData.reduce(
      (sum, { counts }) =>
        sum +
        states.reduce((count, state) => count + Number(counts[state] ?? 0), 0),
      0,
    );
    const hasMore = queueData.some(({ counts, queue }) =>
      paginatedStates.some(
        (state) => consumed[queue.name]![state] < Number(counts[state] ?? 0),
      ),
    );
    const activeItems = queueData
      .flatMap(({ jobsByState, queue }) =>
        jobsByState.active.map((job) => formatItem(queue.name, "active", job)),
      )
      .filter((item): item is QueueItem => item !== null)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    return Response.json(
      {
        activeItems,
        items: page.map(({ item }) => item),
        countsByStat: [],
        total,
        nextCursor: hasMore
          ? encodeURIComponent(JSON.stringify(consumed))
          : null,
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
    const item = await queueJob(body.jobId);
    if (!item)
      return Response.json(
        { error: "The queue item no longer exists." },
        { status: 404 },
      );
    const state = await item.job.getState();
    if (state === "active")
      return Response.json(
        { error: "An active queue item cannot be removed." },
        { status: 409 },
      );
    await item.job.remove();
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
  let body: { action?: unknown; confirmed?: unknown; jobId?: unknown };
  try {
    body = (await request.json()) as {
      action?: unknown;
      confirmed?: unknown;
      jobId?: unknown;
    };
  } catch {
    return Response.json(
      { error: "Send a JSON request body." },
      { status: 400 },
    );
  }

  if (body.action === "restart") {
    if (typeof body.jobId !== "string" || body.jobId.length === 0)
      return Response.json(
        { error: "A queue job ID is required." },
        { status: 400 },
      );

    try {
      const item = await queueJob(body.jobId);
      if (!item)
        return Response.json(
          { error: "The queue item no longer exists." },
          { status: 404 },
        );
      const state = await item.job.getState();
      if (state === "active")
        return Response.json(
          { error: "An active queue item cannot be restarted." },
          { status: 409 },
        );
      if (state !== "failed")
        return Response.json(
          { error: "Only failed queue items can be restarted." },
          { status: 409 },
        );
      await item.job.retry("failed");
      return Response.json({ restarted: body.jobId });
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "The queue item could not be restarted.",
        },
        { status: 503 },
      );
    }
  }

  if (body.action === "restart-failed") {
    try {
      let restarted = 0;
      for (const queue of projectionJobQueues()) {
        const failedJobs = await queue.getJobs(["failed"], 0, -1, true);
        for (let index = 0; index < failedJobs.length; index += 50) {
          const batch = failedJobs.slice(index, index + 50);
          await Promise.all(batch.map((job) => job.retry("failed")));
          restarted += batch.length;
        }
      }
      return Response.json({ restarted });
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Failed queue items could not be restarted.",
        },
        { status: 503 },
      );
    }
  }

  if (body.action === "restart-worker") {
    try {
      await restartWorkerProcess("projection-worker");
      return Response.json(
        { restarting: "projection-worker" },
        { status: 202 },
      );
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "The projection worker could not be restarted.",
        },
        { status: 503 },
      );
    }
  }

  if (body.confirmed !== true)
    return Response.json(
      { error: "Confirm before you clear the queue." },
      { status: 400 },
    );

  try {
    let removed = 0;
    let active = 0;
    for (const queue of projectionJobQueues()) {
      for (const state of removableStates) {
        while (true) {
          const jobs = await queue.getJobs([state], 0, 999, true);
          if (jobs.length === 0) break;
          await Promise.all(jobs.map((job) => job.remove()));
          removed += jobs.length;
        }
      }
      active += (await queue.getJobs(["active"], 0, -1)).length;
    }
    return Response.json({ removed, active });
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
