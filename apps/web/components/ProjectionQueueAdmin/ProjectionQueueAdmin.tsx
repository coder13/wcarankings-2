"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AdminPage } from "@/components/AdminPage/AdminPage";
import { ListDialog } from "@/components/ListOwnerControls/shared";
import styles from "@/components/AdminHealth/AdminHealth.module.css";

type QueueItem = {
  id: string;
  state: "waiting" | "prioritized" | "delayed" | "active" | "failed";
  kind: string;
  key: string;
  payload: Record<string, string>;
  createdAt: string;
  startedAt: string | null;
  failedReason: string | null;
  attemptsMade: number;
};

type QueueResponse = {
  activeItems: QueueItem[];
  countsByStat: Array<{
    stat: string;
    total: number;
    waiting: number;
    active: number;
    failed: number;
    completed: number;
    totalDurationMs: number;
    averageDurationMs: number | null;
  }>;
  items: QueueItem[];
  total: number;
  nextCursor: string | null;
  error?: string;
};
type QueueEvent = {
  event:
    | "waiting"
    | "active"
    | "completed"
    | "failed"
    | "stalled"
    | "connected"
    | "snapshot"
    | "batch";
  jobId?: string | null;
  previousState?: QueueItem["state"] | null;
  stat?: string | null;
  durationMs?: number | null;
  item?: QueueItem | null;
  activeItems?: QueueItem[];
  activeByStat?: Record<string, number>;
  events?: QueueEvent[];
};
type AlertMessage = { text: string; tone: "success" | "error" };
type JobStat = QueueResponse["countsByStat"][number];

function DateTime({ value }: { value: string | null }) {
  if (!value) return <span className={styles.empty}>—</span>;

  const date = new Date(value);
  return (
    <time className={styles.dateTime} dateTime={value}>
      <span>{date.toLocaleDateString()}</span>
      <span>
        {date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
      </span>
    </time>
  );
}

const jobTitles: Record<string, string> = {
  "city-stats": "City stats",
  "competition-stats": "Competition stats",
  "competition-event-stats": "Competition event stats",
  "competition-rankings": "Competition rankings",
  "medal-rankings": "Medal rankings",
  "person-event-bests": "Person event bests",
  "person-event-rankings": "Person event rankings",
  "person-stats": "Person stats",
  "result-rankings": "Result rankings",
  "sum-of-ranks": "Sum of ranks",
  "yearly-rankings": "Yearly rankings",
};

const jobStatGroups = [
  {
    id: "people",
    title: "People",
    stats: new Set([
      "person-event-bests",
      "person-event-rankings",
      "person-stats",
      "result-rankings",
      "sum-of-ranks",
      "yearly-rankings",
    ]),
  },
  {
    id: "competitions",
    title: "Competitions",
    stats: new Set([
      "competition-event-stats",
      "competition-rankings",
      "competition-stats",
      "medal-rankings",
    ]),
  },
  { id: "cities", title: "Cities", stats: new Set(["city-stats"]) },
] as const;
const knownJobStats = new Set(
  jobStatGroups.flatMap((group) => [...group.stats]),
);

const payloadLabels: Record<string, string> = {
  competitionId: "Competition",
  eventId: "Event",
  gender: "Gender",
  periodYear: "Period",
  regionId: "Region",
  resultType: "Result",
  scope: "Scope",
  year: "Year",
};
const otherProjectionWorkerConcurrency = 2;
const resultRankingWorkerConcurrency = 2;

function jobTitle(key: string) {
  return jobTitles[key.split(":", 1)[0]] ?? "Projection rebuild";
}

function jobDetails(item: QueueItem) {
  const details = Object.entries(item.payload)
    .filter(([, value]) => value)
    .map(([key, value]) => {
      if (key === "personIds")
        return `People: ${value.split(",").filter(Boolean).length}`;
      if (key === "periodYear" && value === "0") return "Period: all time";
      return `${payloadLabels[key] ?? key}: ${value}`;
    });
  return details.length ? details.join(" · ") : "No job details";
}

function queueSummary(data: QueueResponse | null, activeCount: number) {
  if (!data) return "Loading…";
  const completed = data.countsByStat.reduce(
    (total, stat) => total + stat.completed,
    0,
  );
  const totalDurationMs = data.countsByStat.reduce(
    (total, stat) => total + stat.totalDurationMs,
    0,
  );
  const average = completed ? totalDurationMs / completed : null;
  const queue = activeCount
    ? `${activeCount} processing · ${data.total} items`
    : `${data.total} items`;
  return average === null
    ? queue
    : `${queue} · ${formatAverageDuration(average)} avg.`;
}

function queueStateClass(state: QueueItem["state"]) {
  return {
    waiting: styles.queueStateWaiting,
    prioritized: styles.queueStatePrioritized,
    delayed: styles.queueStateDelayed,
    active: styles.queueStateActive,
    failed: styles.queueStateFailed,
  }[state];
}

function formatDuration(durationMs: number | null) {
  if (durationMs === null) return "—";
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatAverageDuration(durationMs: number | null) {
  if (durationMs === null) return "—";
  if (durationMs < 1_000) return `${Math.round(durationMs)} ms`;
  return formatDuration(durationMs);
}

function jobStatRowClass(stat: JobStat) {
  if (stat.failed > 0) return styles.jobStatFailed;
  if (stat.active > 0) return styles.jobStatActive;
  if (stat.waiting > 0) return styles.jobStatWaiting;
  return styles.jobStatClear;
}

function estimatedTimeLeft(stat: QueueResponse["countsByStat"][number]) {
  if (stat.averageDurationMs === null) return null;
  const concurrency =
    stat.stat === "result-rankings"
      ? resultRankingWorkerConcurrency
      : otherProjectionWorkerConcurrency;
  return ((stat.waiting + stat.active) * stat.averageDurationMs) / concurrency;
}

function processingDuration(item: QueueItem, now: number): string | null {
  if (item.state !== "active" || !item.startedAt) return null;
  const totalSeconds = Math.max(
    0,
    Math.floor((now - Date.parse(item.startedAt)) / 1_000),
  );
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function emptyStat(stat: string) {
  return {
    stat,
    total: 0,
    waiting: 0,
    active: 0,
    failed: 0,
    completed: 0,
    totalDurationMs: 0,
    averageDurationMs: null,
  };
}

function applyQueueEvent(
  current: QueueResponse,
  event: QueueEvent,
): QueueResponse {
  if (event.event === "batch")
    return (event.events ?? []).reduce(applyQueueEvent, current);
  if (event.event === "snapshot") {
    const activeByStat = event.activeByStat ?? {};
    const names = new Set([
      ...current.countsByStat.map((stat) => stat.stat),
      ...Object.keys(activeByStat),
    ]);
    return {
      ...current,
      activeItems: event.activeItems ?? current.activeItems,
      countsByStat: [...names]
        .map((name) => {
          const stat =
            current.countsByStat.find((entry) => entry.stat === name) ??
            emptyStat(name);
          return { ...stat, active: activeByStat[name] ?? 0 };
        })
        .sort((left, right) => left.stat.localeCompare(right.stat)),
    };
  }
  if (event.event === "connected" || !event.stat) return current;
  const countsByStat = current.countsByStat.map((stat) => ({ ...stat }));
  let stat = countsByStat.find((entry) => entry.stat === event.stat);
  if (!stat) {
    stat = emptyStat(event.stat);
    countsByStat.push(stat);
  }

  const adjust = (state: QueueItem["state"] | null, amount: number) => {
    if (!state) return;
    if (state === "active") stat.active = Math.max(0, stat.active + amount);
    else if (state === "failed")
      stat.failed = Math.max(0, stat.failed + amount);
    else stat.waiting = Math.max(0, stat.waiting + amount);
  };

  let nextState: QueueItem["state"] | null = null;
  if (event.event === "waiting" || event.event === "stalled")
    nextState = "waiting";
  else if (event.event === "active") nextState = "active";
  else if (event.event === "failed") nextState = "failed";
  let previousState = event.previousState ?? null;
  if (previousState === null) {
    if (event.event === "stalled") previousState = "active";
    else if (event.event === "active") previousState = "waiting";
    else if (event.event === "completed" || event.event === "failed")
      previousState = "active";
  }
  if (previousState === null) stat.total += 1;
  if (nextState === null) stat.total = Math.max(0, stat.total - 1);
  adjust(previousState, -1);
  adjust(nextState, 1);

  if (event.event === "completed") {
    stat.completed += 1;
    if (typeof event.durationMs === "number") {
      const previousTotal =
        (stat.averageDurationMs ?? 0) * (stat.completed - 1);
      stat.totalDurationMs += event.durationMs;
      stat.averageDurationMs =
        (previousTotal + event.durationMs) / stat.completed;
    }
  }

  const activeItems = current.activeItems.filter(
    (item) => item.id !== event.jobId,
  );
  const items = current.items.filter((item) => item.id !== event.jobId);
  if (event.item && nextState !== "active") items.push(event.item);
  return {
    ...current,
    activeItems:
      nextState === "active" && event.item
        ? [...activeItems, event.item]
        : activeItems,
    items,
    countsByStat: countsByStat.sort((left, right) =>
      left.stat.localeCompare(right.stat),
    ),
    total:
      current.total +
      (previousState === null ? 1 : 0) -
      (nextState === null ? 1 : 0),
  };
}

export function ProjectionQueueAdmin() {
  const [data, setData] = useState<QueueResponse | null>(null);
  const [message, setMessage] = useState<AlertMessage | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [restarting, setRestarting] = useState<string | null>(null);
  const [restartingFailed, setRestartingFailed] = useState(false);
  const [restartingWorker, setRestartingWorker] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const statsRef = useRef<QueueResponse["countsByStat"]>([]);
  const activeSnapshotRef = useRef<QueueEvent | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (cursor?: string, append = false) => {
    if (append) setLoadingMore(true);
    const query = cursor ? `?cursor=${cursor}` : "";
    const response = await fetch(`/api/admin/queue${query}`, {
      cache: "no-store",
    });
    const next = (await response.json()) as QueueResponse;
    if (response.ok) {
      setData((current) => {
        const loaded =
          append && current
            ? {
                ...next,
                activeItems: next.activeItems,
                items: [...current.items, ...next.items],
                countsByStat: current.countsByStat,
              }
            : { ...next, countsByStat: statsRef.current };
        const snapshot = activeSnapshotRef.current;
        const synchronized = snapshot
          ? applyQueueEvent(loaded, snapshot)
          : loaded;
        statsRef.current = synchronized.countsByStat;
        return synchronized;
      });
    } else {
      setData({
        activeItems: [],
        countsByStat: [],
        items: [],
        total: 0,
        nextCursor: null,
        error: next.error,
      });
    }
    if (append) setLoadingMore(false);
  }, []);

  const loadStats = useCallback(async () => {
    const response = await fetch("/api/admin/queue?view=stats", {
      cache: "no-store",
    });
    if (!response.ok) return;
    const next = (await response.json()) as Pick<QueueResponse, "countsByStat">;
    statsRef.current = next.countsByStat;
    setData((current) =>
      current ? { ...current, countsByStat: next.countsByStat } : current,
    );
  }, []);

  useEffect(() => {
    if (!data?.activeItems.length) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [data?.activeItems.length]);

  useEffect(() => {
    const source = new EventSource("/api/admin/queue/events");
    source.addEventListener("queue", (message) => {
      try {
        const event = JSON.parse((message as MessageEvent).data) as QueueEvent;
        if (event.event === "snapshot") activeSnapshotRef.current = event;
        setData((current) => {
          if (!current) return current;
          const next = applyQueueEvent(current, event);
          statsRef.current = next.countsByStat;
          return next;
        });
      } catch {
        // Ignore malformed event payloads and keep the last known queue state.
      }
    });
    const initial = window.setTimeout(() => {
      void load();
      void loadStats();
    }, 0);
    return () => {
      source.close();
      window.clearTimeout(initial);
    };
  }, [load, loadStats]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const cursor = data?.nextCursor;
        if (entry.isIntersecting && cursor && !loadingMore) {
          void load(cursor, true);
        }
      },
      { rootMargin: "240px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [data?.nextCursor, load, loadingMore]);

  const activeCount = data?.activeItems.length ?? 0;
  const visibleItems = [...(data?.activeItems ?? []), ...(data?.items ?? [])];

  async function remove(jobId: string) {
    setRemoving(jobId);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/queue", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const result = (await response.json()) as { error?: string };
      setMessage({
        text: response.ok
          ? "Queue item removed."
          : (result.error ?? "The queue item could not be removed."),
        tone: response.ok ? "success" : "error",
      });
    } catch {
      setMessage({
        text: "The queue item could not be removed.",
        tone: "error",
      });
    } finally {
      setRemoving(null);
    }
  }

  async function clear() {
    setClearing(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed: true }),
      });
      const result = (await response.json()) as {
        removed?: number;
        active?: number;
        error?: string;
      };
      setMessage({
        text: response.ok
          ? `Removed ${result.removed ?? 0} queue items. ${result.active ?? 0} active items remain.`
          : (result.error ?? "The queue could not be cleared."),
        tone: response.ok ? "success" : "error",
      });
    } catch {
      setMessage({ text: "The queue could not be cleared.", tone: "error" });
    } finally {
      setClearing(false);
      setConfirmingClear(false);
    }
  }

  async function restart(jobId: string) {
    setRestarting(jobId);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restart", jobId }),
      });
      const result = (await response.json()) as { error?: string };
      setMessage({
        text: response.ok
          ? "Queue item restarted."
          : (result.error ?? "The queue item could not be restarted."),
        tone: response.ok ? "success" : "error",
      });
    } catch {
      setMessage({
        text: "The queue item could not be restarted.",
        tone: "error",
      });
    } finally {
      setRestarting(null);
    }
  }

  async function restartProjectionWorker() {
    setRestartingWorker(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restart-worker" }),
      });
      const result = (await response.json()) as { error?: string };
      setMessage({
        text: response.ok
          ? "Projection worker restart requested. The active job will be reclaimed after its lock expires."
          : (result.error ?? "The projection worker could not be restarted."),
        tone: response.ok ? "success" : "error",
      });
    } catch {
      setMessage({
        text: "The projection worker could not be restarted.",
        tone: "error",
      });
    } finally {
      setRestartingWorker(false);
    }
  }

  async function restartAllFailed() {
    setRestartingFailed(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restart-failed" }),
      });
      const result = (await response.json()) as {
        restarted?: number;
        error?: string;
      };
      setMessage({
        text: response.ok
          ? `Restarted ${result.restarted ?? 0} failed queue items.`
          : (result.error ?? "Failed queue items could not be restarted."),
        tone: response.ok ? "success" : "error",
      });
      if (response.ok) {
        const resetFailedCounts = (counts: QueueResponse["countsByStat"]) =>
          counts.map((stat) => ({ ...stat, failed: 0 }));

        statsRef.current = resetFailedCounts(statsRef.current);
        setData((current) =>
          current
            ? {
                ...current,
                countsByStat: resetFailedCounts(current.countsByStat),
                items: current.items.map((item) =>
                  item.state === "failed"
                    ? { ...item, state: "waiting", failedReason: null }
                    : item,
                ),
              }
            : current,
        );
      }
    } catch {
      setMessage({
        text: "Failed queue items could not be restarted.",
        tone: "error",
      });
    } finally {
      setRestartingFailed(false);
    }
  }

  const failedCount =
    data?.countsByStat.reduce((total, stat) => total + stat.failed, 0) ?? 0;
  const jobStatsByGroup = jobStatGroups
    .map((group) => ({
      ...group,
      stats: (data?.countsByStat ?? []).filter(
        (stat) =>
          group.stats.has(stat.stat) ||
          (group.id === "people" && !knownJobStats.has(stat.stat)),
      ),
    }))
    .filter((group) => group.stats.length > 0);

  return (
    <AdminPage
      title="Projection queue"
      description=""
      aside={
        <strong
          className={`${styles.status} ${
            activeCount ? styles.healthy : styles.unknown
          }`}
        >
          {queueSummary(data, activeCount)}
        </strong>
      }
    >
      {message && (
        <p
          className={`${styles.alert} ${
            message.tone === "success" ? styles.alertSuccess : styles.alertError
          }`}
        >
          {message.text}
        </p>
      )}
      {data?.error && (
        <p className={`${styles.alert} ${styles.alertError}`}>{data.error}</p>
      )}
      <section
        className={styles.tableSection}
        aria-labelledby="queue-stats-heading"
      >
        <div className={styles.cardHeader}>
          <div>
            <h2 id="queue-stats-heading">Jobs by stat</h2>
          </div>
          <button
            className={styles.tableAction}
            disabled={failedCount === 0 || restartingFailed || clearing}
            onClick={() => void restartAllFailed()}
          >
            {restartingFailed
              ? "Restarting…"
              : `Restart all failed (${failedCount})`}
          </button>
        </div>
        {jobStatsByGroup.map((group) => (
          <section
            key={group.id}
            className={styles.jobStatGroup}
            aria-labelledby={`queue-stats-${group.id}`}
          >
            <h3 id={`queue-stats-${group.id}`}>{group.title}</h3>
            <div className={styles.tableWrap}>
              <table
                className={`${styles.sourcesTable} ${styles.jobStatsTable}`}
              >
                <thead>
                  <tr>
                    <th scope="col">Stat</th>
                    <th scope="col">Active</th>
                    <th scope="col">Left</th>
                    <th scope="col">Failed</th>
                    <th scope="col">Done</th>
                    <th scope="col">Total time</th>
                    <th scope="col">Avg. time</th>
                    <th scope="col">Est. left</th>
                  </tr>
                </thead>
                <tbody>
                  {group.stats.map((stat) => (
                    <tr key={stat.stat} className={jobStatRowClass(stat)}>
                      <td>
                        <strong>{jobTitles[stat.stat] ?? stat.stat}</strong>
                      </td>
                      <td>{stat.active}</td>
                      <td>{stat.waiting + stat.active}</td>
                      <td>{stat.failed}</td>
                      <td>{stat.completed}</td>
                      <td>{formatDuration(stat.totalDurationMs)}</td>
                      <td>{formatAverageDuration(stat.averageDurationMs)}</td>
                      <td>{formatDuration(estimatedTimeLeft(stat))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
        {data && jobStatsByGroup.length === 0 && (
          <p className={styles.tableEmpty}>No queue items.</p>
        )}
      </section>
      <section
        className={styles.tableSection}
        aria-labelledby="queue-items-heading"
      >
        <div className={styles.cardHeader}>
          <div>
            <h2 id="queue-items-heading">Queue items</h2>
          </div>
          <button
            className={styles.dangerButton}
            disabled={clearing}
            onClick={() => setConfirmingClear(true)}
          >
            {clearing ? "Clearing…" : "Clear queue"}
          </button>
        </div>
        <div className={styles.tableWrap}>
          <table className={`${styles.sourcesTable} ${styles.queueTable}`}>
            <thead>
              <tr>
                <th scope="col">State</th>
                <th scope="col">Job</th>
                <th scope="col">Queued at</th>
                <th scope="col">Processing</th>
                <th scope="col">Attempts</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((item) => (
                <tr key={item.id}>
                  <td>
                    <span
                      className={`${styles.queueState} ${queueStateClass(item.state)}`}
                    >
                      {item.state}
                    </span>
                  </td>
                  <td className={styles.jobCell}>
                    <strong title={item.key}>{jobTitle(item.key)}</strong>
                    <span>{jobDetails(item)}</span>
                  </td>
                  <td>
                    <DateTime value={item.createdAt} />
                  </td>
                  <td className={styles.queueElapsed}>
                    {processingDuration(item, now) === null
                      ? "—"
                      : processingDuration(item, now)}
                  </td>
                  <td>{item.attemptsMade}</td>
                  <td>
                    <div className={styles.queueActions}>
                      {item.state === "failed" && (
                        <button
                          className={styles.tableAction}
                          disabled={restarting === item.id}
                          onClick={() => void restart(item.id)}
                        >
                          {restarting === item.id ? "Restarting…" : "Restart"}
                        </button>
                      )}
                      {item.state === "active" && (
                        <button
                          className={styles.tableAction}
                          disabled={restartingWorker}
                          onClick={() => void restartProjectionWorker()}
                        >
                          {restartingWorker ? "Stopping…" : "Restart worker"}
                        </button>
                      )}
                      <button
                        className={styles.tableAction}
                        disabled={
                          item.state === "active" || removing === item.id
                        }
                        onClick={() => void remove(item.id)}
                      >
                        {removing === item.id ? "Removing…" : "Remove"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {data && visibleItems.length === 0 && (
                <tr>
                  <td colSpan={6} className={styles.tableEmpty}>
                    No queue items.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div ref={loadMoreRef} aria-live="polite">
          {loadingMore && <p className={styles.tableEmpty}>Loading more…</p>}
        </div>
      </section>
      {confirmingClear && (
        <ListDialog
          title="Clear queue"
          onClose={() => {
            if (!clearing) setConfirmingClear(false);
          }}
        >
          <div className="listModalForm">
            <p>
              Remove all waiting, prioritized, delayed, and failed queue items?
              Active items will remain.
            </p>
            <div className="listRemovalActions">
              <button
                type="button"
                disabled={clearing}
                onClick={() => setConfirmingClear(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={clearing}
                onClick={() => void clear()}
              >
                {clearing ? "Clearing…" : "Clear queue"}
              </button>
            </div>
          </div>
        </ListDialog>
      )}
    </AdminPage>
  );
}
