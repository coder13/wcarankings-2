import type {
  WorkerHealthPayload,
  WorkerHealthState,
} from "@wcarankings/worker-health";

const workerChecks = [
  {
    name: "live-results-poller",
    url:
      process.env.LIVE_RESULTS_POLLER_HEALTH_URL ??
      "http://127.0.0.1:3011/health",
  },
  {
    name: "projection-worker",
    url:
      process.env.PROJECTION_WORKER_HEALTH_URL ??
      "http://127.0.0.1:3012/health",
  },
] as const;

export type WorkerName = (typeof workerChecks)[number]["name"];

export type AdminRuntimeSnapshot = {
  generatedAt: string;
  workers: Array<{
    name: WorkerName;
    status: "online" | "offline";
    state: WorkerHealthState | null;
    processId: number | null;
    startedAt: string | null;
    lastSeenAt: string | null;
    latencyMs: number | null;
    error: string | null;
  }>;
  queue: {
    available: boolean;
    waiting: number;
    active: number;
    delayed: number;
    failed: number;
    error: string | null;
  };
};

async function getQueueCounts() {
  const { getProjectionJobQueueCounts } =
    await import("@wcarankings/projection-jobs/status");
  return getProjectionJobQueueCounts();
}

async function pingWorker(
  check: (typeof workerChecks)[number],
  generatedAt: string,
) {
  const startedAt = performance.now();
  try {
    const response = await fetch(check.url, {
      cache: "no-store",
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok)
      throw new Error(`Worker returned HTTP ${response.status}.`);
    const payload = (await response.json()) as WorkerHealthPayload;
    if (payload.status !== "ok" || payload.worker !== check.name)
      throw new Error("Worker returned an invalid health response.");
    return {
      name: check.name,
      status:
        payload.state === "stopping"
          ? ("offline" as const)
          : ("online" as const),
      state: payload.state,
      processId: payload.processId,
      startedAt: payload.startedAt,
      lastSeenAt: generatedAt,
      latencyMs: Math.round(performance.now() - startedAt),
      error: null,
    };
  } catch (error) {
    return {
      name: check.name,
      status: "offline" as const,
      state: null,
      processId: null,
      startedAt: null,
      lastSeenAt: null,
      latencyMs: Math.round(performance.now() - startedAt),
      error:
        error instanceof Error ? error.message : "Worker health check failed.",
    };
  }
}

export async function restartWorkerProcess(workerName: WorkerName) {
  const check = workerChecks.find(({ name }) => name === workerName);
  if (!check) throw new Error("Unknown worker.");
  const restartUrl = new URL("/restart", check.url);
  const response = await fetch(restartUrl, {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(2_000),
  });
  if (!response.ok)
    throw new Error(`Worker returned HTTP ${response.status}.`);
}

export async function getAdminRuntimeSnapshot(): Promise<AdminRuntimeSnapshot> {
  const generatedAt = new Date().toISOString();
  const [workers, queueResult] = await Promise.all([
    Promise.all(workerChecks.map((check) => pingWorker(check, generatedAt))),
    getQueueCounts().then(
      (counts) => ({ status: "fulfilled" as const, counts }),
      (reason) => ({ status: "rejected" as const, reason }),
    ),
  ]);
  const queue =
    queueResult.status === "fulfilled"
      ? {
          available: true,
          waiting:
            queueResult.counts.waiting +
            queueResult.counts.delayed +
            queueResult.counts.prioritized,
          active: queueResult.counts.active,
          delayed: queueResult.counts.delayed,
          failed: queueResult.counts.failed,
          error: null,
        }
      : {
          available: false,
          waiting: 0,
          active: 0,
          delayed: 0,
          failed: 0,
          error:
            queueResult.reason instanceof Error
              ? queueResult.reason.message
              : "The Redis queue is unavailable.",
        };

  return { generatedAt, workers, queue };
}
