import {
  projectionJobQueue,
  projectionJobEvents,
  resultRankingJobEvents,
  resultRankingJobQueue,
} from "@wcarankings/projection-jobs";
import { rejectNonAdmin } from "@/lib/admin-access";

export const dynamic = "force-dynamic";

const encoder = new TextEncoder();
const MINIMUM_EVENT_INTERVAL_MS = 1_000;
type QueueEventName = "waiting" | "active" | "completed" | "failed" | "stalled";
type QueueEventListener = (...args: unknown[]) => void;
type QueueEventStream = {
  on(event: string, listener: QueueEventListener): void;
  off(event: string, listener: QueueEventListener): void;
};

type ActiveQueueItem = {
  id: string;
  queueName: string;
  state: "active";
  kind: string;
  key: string;
  payload: Record<string, string>;
  createdAt: string;
  startedAt: string | null;
  failedReason: null;
  attemptsMade: number;
};

function eventMessage(data: Record<string, unknown>) {
  return encoder.encode(`event: queue\ndata: ${JSON.stringify(data)}\n\n`);
}

function keepAliveMessage() {
  return encoder.encode(": keep-alive\n\n");
}

async function activeSnapshot(
  queueSources: Array<{
    queue: ReturnType<typeof projectionJobQueue>;
  }>,
): Promise<{
  activeByStat: Record<string, number>;
  activeItems: ActiveQueueItem[];
}> {
  const activeItems = (
    await Promise.all(
      queueSources.map(async ({ queue }) =>
        (await queue.getJobs(["active"], 0, -1, true))
          .filter((job): job is typeof job & { id: string } => Boolean(job.id))
          .map(
            (job) =>
              ({
                id: job.id,
                queueName: queue.name,
                state: "active",
                kind: job.data.kind,
                key: job.data.key,
                payload: job.data.payload,
                createdAt: new Date(job.timestamp).toISOString(),
                startedAt: job.processedOn
                  ? new Date(job.processedOn).toISOString()
                  : null,
                failedReason: null,
                attemptsMade: job.attemptsMade,
              }) satisfies ActiveQueueItem,
          ),
      ),
    )
  )
    .flat()
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const activeByStat: Record<string, number> = {};
  for (const item of activeItems) {
    const stat = item.key.split(":", 1)[0] ?? "unknown";
    activeByStat[stat] = (activeByStat[stat] ?? 0) + 1;
  }
  return { activeByStat, activeItems };
}

export async function GET(request: Request) {
  const rejection = await rejectNonAdmin(request);
  if (rejection) return rejection;

  const queueSources = [
    { events: projectionJobEvents(), queue: projectionJobQueue() },
    { events: resultRankingJobEvents(), queue: resultRankingJobQueue() },
  ];

  try {
    await Promise.all(
      queueSources.map(({ events }) => events.waitUntilReady()),
    );
  } catch (error) {
    await Promise.all(queueSources.map(({ events }) => events.close()));
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

  let closed = false;
  let keepAlive: ReturnType<typeof setInterval> | undefined;
  let snapshotInterval: ReturnType<typeof setInterval> | undefined;
  let eventTimeout: ReturnType<typeof setTimeout> | undefined;
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  let lastEventAt = 0;
  let pendingSnapshot: Record<string, unknown> | undefined;
  const pendingEvents = new Map<string, Record<string, unknown>>();
  const flushEvents = () => {
    eventTimeout = undefined;
    if (!controller || closed) return;
    const snapshot = pendingSnapshot;
    pendingSnapshot = undefined;
    const events = [...pendingEvents.values()];
    pendingEvents.clear();
    if (snapshot) controller.enqueue(eventMessage(snapshot));
    else if (events.length)
      controller.enqueue(eventMessage({ event: "batch", events }));
    else return;
    lastEventAt = Date.now();
    if (pendingSnapshot || pendingEvents.size) scheduleEventFlush();
  };
  const scheduleEventFlush = () => {
    if (eventTimeout || !controller || closed) return;
    const delay = Math.max(
      0,
      MINIMUM_EVENT_INTERVAL_MS - (Date.now() - lastEventAt),
    );
    eventTimeout = setTimeout(flushEvents, delay);
  };
  const queueEvent = (event: Record<string, unknown>) => {
    const key =
      typeof event.jobId === "string"
        ? event.jobId
        : `${event.event}:${pendingEvents.size}`;
    pendingEvents.set(key, event);
    scheduleEventFlush();
  };
  const notify = async (
    queue: ReturnType<typeof projectionJobQueue>,
    event: string,
    args: { jobId?: string; prev?: string; returnvalue?: unknown },
  ) => {
    if (!controller || closed) return;
    const job = args.jobId ? await queue.getJob(args.jobId) : undefined;
    let returnValue: { stat?: string; durationMs?: number } | undefined;
    if (typeof args.returnvalue === "string") {
      try {
        returnValue = JSON.parse(args.returnvalue) as {
          stat?: string;
          durationMs?: number;
        };
      } catch {
        returnValue = undefined;
      }
    } else if (args.returnvalue && typeof args.returnvalue === "object") {
      returnValue = args.returnvalue as {
        stat?: string;
        durationMs?: number;
      };
    }
    const jobData = job?.data;
    let itemState: "waiting" | "active" | "failed" = "waiting";
    if (event === "active") itemState = "active";
    else if (event === "failed") itemState = "failed";
    const data = {
      event,
      jobId: args.jobId ?? null,
      previousState: args.prev ?? null,
      stat: jobData?.key.split(":", 1)[0] ?? returnValue?.stat ?? null,
      durationMs: returnValue?.durationMs ?? null,
      item:
        job && event !== "completed"
          ? {
              id: job.id,
              queueName: queue.name,
              state: itemState,
              kind: job.data.kind,
              key: job.data.key,
              payload: job.data.payload,
              createdAt: new Date(job.timestamp).toISOString(),
              startedAt: job.processedOn
                ? new Date(job.processedOn).toISOString()
                : null,
              failedReason: job.failedReason ?? null,
              attemptsMade: job.attemptsMade,
            }
          : null,
    };
    queueEvent(data);
  };
  const sendActiveSnapshot = async () => {
    if (!controller || closed) return;
    try {
      pendingSnapshot = {
        event: "snapshot",
        ...(await activeSnapshot(queueSources)),
      };
      scheduleEventFlush();
    } catch {
      // A later snapshot repairs the client state after a transient Redis error.
    }
  };
  const listeners: {
    event: QueueEventName;
    listener: QueueEventListener;
    stream: QueueEventStream;
  }[] = [];
  const listen = (
    queue: ReturnType<typeof projectionJobQueue>,
    stream: QueueEventStream,
    event: QueueEventName,
  ) => {
    const listener = ((args: {
      jobId?: string;
      prev?: string;
      returnvalue?: unknown;
    }) => void notify(queue, event, args)) as QueueEventListener;
    listeners.push({ event, listener, stream });
    stream.on(event, listener);
  };

  const close = () => {
    if (closed) return;
    closed = true;
    if (keepAlive) clearInterval(keepAlive);
    if (snapshotInterval) clearInterval(snapshotInterval);
    if (eventTimeout) clearTimeout(eventTimeout);
    for (const { event, listener, stream } of listeners)
      stream.off(event, listener);
    void Promise.all(queueSources.map(({ events }) => events.close()));
  };

  const stream = new ReadableStream<Uint8Array>({
    start(nextController) {
      controller = nextController;
      for (const { events, queue } of queueSources) {
        const stream = events as unknown as QueueEventStream;
        listen(queue, stream, "waiting");
        listen(queue, stream, "active");
        listen(queue, stream, "completed");
        listen(queue, stream, "failed");
        listen(queue, stream, "stalled");
      }
      void sendActiveSnapshot();
      keepAlive = setInterval(
        () => controller?.enqueue(keepAliveMessage()),
        15_000,
      );
      snapshotInterval = setInterval(() => void sendActiveSnapshot(), 15_000);
      request.signal.addEventListener("abort", close, { once: true });
    },
    cancel: close,
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
      "X-Accel-Buffering": "no",
    },
  });
}
