import { closeProjectionJobQueue, projectionJobQueue } from "./queue.ts";

const METRICS_KEY = "wcarankings:projection-job-metrics";

type MetricsTransaction = {
  hincrby(key: string, field: string, increment: number): MetricsTransaction;
  hset(
    key: string,
    values: Record<string, string | number>,
  ): MetricsTransaction;
  exec(): Promise<unknown>;
};

type MetricsClient = {
  multi(): MetricsTransaction;
  hgetall(key: string): Promise<Record<string, string>>;
};

type MetricsBackend = {
  client: Promise<MetricsClient>;
};

export type ProjectionJobMetric = {
  stat: string;
  completed: number;
  totalDurationMs: number;
  averageDurationMs: number;
  lastDurationMs: number | null;
  lastCompletedAt: string | null;
};

async function metricsClient(): Promise<MetricsClient> {
  const queue = projectionJobQueue();
  await queue.waitUntilReady();
  return (queue.getBackend() as unknown as MetricsBackend).client;
}

export function projectionStatName(key: string): string {
  return key.split(":", 1)[0] ?? "unknown";
}

export async function recordProjectionJobDuration(
  key: string,
  durationMs: number,
): Promise<void> {
  const stat = projectionStatName(key);
  const client = await metricsClient();
  const prefix = `${stat}:`;
  await client
    .multi()
    .hincrby(METRICS_KEY, `${prefix}completed`, 1)
    .hincrby(METRICS_KEY, `${prefix}totalDurationMs`, durationMs)
    .hset(METRICS_KEY, {
      [`${prefix}lastDurationMs`]: durationMs,
      [`${prefix}lastCompletedAt`]: new Date().toISOString(),
    })
    .exec();
}

export async function readProjectionJobMetrics(): Promise<
  ProjectionJobMetric[]
> {
  const client = await metricsClient();
  const fields = await client.hgetall(METRICS_KEY);
  const stats = new Set(
    Object.keys(fields).map((field) => field.slice(0, field.indexOf(":"))),
  );
  return [...stats]
    .filter(Boolean)
    .map((stat) => {
      const prefix = `${stat}:`;
      const completed = Number(fields[`${prefix}completed`] ?? 0);
      const totalDurationMs = Number(fields[`${prefix}totalDurationMs`] ?? 0);
      return {
        stat,
        completed,
        totalDurationMs,
        averageDurationMs: completed ? totalDurationMs / completed : 0,
        lastDurationMs:
          fields[`${prefix}lastDurationMs`] === undefined
            ? null
            : Number(fields[`${prefix}lastDurationMs`]),
        lastCompletedAt: fields[`${prefix}lastCompletedAt`] ?? null,
      } satisfies ProjectionJobMetric;
    })
    .sort((left, right) => left.stat.localeCompare(right.stat));
}

export async function closeProjectionJobMetrics(): Promise<void> {
  await closeProjectionJobQueue();
}
