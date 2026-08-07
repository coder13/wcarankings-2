import { query } from "@/db";

const workerNames = ["live-results-poller", "projection-worker"] as const;

type WorkerName = (typeof workerNames)[number];
type WorkerRow = {
  worker_name: WorkerName;
  process_id: number;
  started_at: string;
  heartbeat_at: string;
  heartbeat_timeout_seconds: number;
};

export type AdminRuntimeSnapshot = {
  generatedAt: string;
  workers: Array<{
    name: WorkerName;
    status: "online" | "offline";
    processId: number | null;
    startedAt: string | null;
    lastSeenAt: string | null;
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

function workerStatus(row: WorkerRow | undefined): "online" | "offline" {
  if (!row) return "offline";
  const lastSeenAt = new Date(row.heartbeat_at).getTime();
  return Date.now() - lastSeenAt <= row.heartbeat_timeout_seconds * 1_000
    ? "online"
    : "offline";
}

export async function getAdminRuntimeSnapshot(): Promise<AdminRuntimeSnapshot> {
  const [workersResult, queueResult] = await Promise.allSettled([
    query<WorkerRow>(
      `SELECT worker_name, process_id, started_at, heartbeat_at,
              heartbeat_timeout_seconds
       FROM worker_runtime_status
       WHERE worker_name IN (?, ?)`,
      [...workerNames],
    ),
    getQueueCounts(),
  ]);
  const rows =
    workersResult.status === "fulfilled" ? workersResult.value.rows : [];
  const workersByName = new Map(rows.map((row) => [row.worker_name, row]));
  const queue =
    queueResult.status === "fulfilled"
      ? {
          available: true,
          waiting:
            queueResult.value.waiting +
            queueResult.value.delayed +
            queueResult.value.prioritized,
          active: queueResult.value.active,
          delayed: queueResult.value.delayed,
          failed: queueResult.value.failed,
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

  return {
    generatedAt: new Date().toISOString(),
    workers: workerNames.map((name) => {
      const row = workersByName.get(name);
      return {
        name,
        status: workerStatus(row),
        processId: row?.process_id ?? null,
        startedAt: row?.started_at ?? null,
        lastSeenAt: row?.heartbeat_at ?? null,
      };
    }),
    queue,
  };
}
