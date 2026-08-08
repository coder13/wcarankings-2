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
  processedAt: string | null;
  failedReason: string | null;
  attemptsMade: number;
};

type QueueResponse = {
  items: QueueItem[];
  total: number;
  nextCursor: string | null;
  error?: string;
};
type AlertMessage = { text: string; tone: "success" | "error" };

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
  "competition-stats": "Competition stats",
  "competition-event-stats": "Competition event stats",
  "medal-rankings": "Medal rankings",
  "person-event-bests": "Person event bests",
  "person-event-rankings": "Person event rankings",
  "person-stats": "Person stats",
  "result-rankings": "Result rankings",
  "yearly-rankings": "Yearly rankings",
};

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
  if (activeCount) return `${activeCount} processing · ${data.total} items`;
  return `${data.total} items`;
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

export function ProjectionQueueAdmin() {
  const [data, setData] = useState<QueueResponse | null>(null);
  const [message, setMessage] = useState<AlertMessage | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (cursor?: string, append = false) => {
    if (append) setLoadingMore(true);
    const query = cursor ? `?cursor=${cursor}` : "";
    const response = await fetch(`/api/admin/queue${query}`, {
      cache: "no-store",
    });
    const next = (await response.json()) as QueueResponse;
    if (response.ok) {
      setData((current) =>
        append && current
          ? { ...next, items: [...current.items, ...next.items] }
          : next,
      );
    } else {
      setData({ items: [], total: 0, nextCursor: null, error: next.error });
    }
    if (append) setLoadingMore(false);
  }, []);

  useEffect(() => {
    let refreshTimer: number | undefined;
    const refresh = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => void load(), 50);
    };
    const source = new EventSource("/api/admin/queue/events");
    source.addEventListener("queue", refresh);
    const initial = window.setTimeout(() => void load(), 0);
    const interval = window.setInterval(() => void load(), 10_000);
    return () => {
      source.close();
      window.clearTimeout(refreshTimer);
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [load]);

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

  const activeCount =
    data?.items.filter((item) => item.state === "active").length ?? 0;

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
      await load();
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
      await load();
    } catch {
      setMessage({ text: "The queue could not be cleared.", tone: "error" });
    } finally {
      setClearing(false);
      setConfirmingClear(false);
    }
  }

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
        aria-labelledby="queue-items-heading"
      >
        <div className={styles.cardHeader}>
          <div>
            <h2 id="queue-items-heading">Queue items</h2>
            <p>
              Active items cannot be removed while the worker holds their lock.
            </p>
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
                <th scope="col">Attempts</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((item) => (
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
                  <td>{item.attemptsMade}</td>
                  <td>
                    <button
                      className={styles.tableAction}
                      disabled={item.state === "active" || removing === item.id}
                      onClick={() => void remove(item.id)}
                    >
                      {removing === item.id ? "Removing…" : "Remove"}
                    </button>
                  </td>
                </tr>
              ))}
              {data && data.items.length === 0 && (
                <tr>
                  <td colSpan={5} className={styles.tableEmpty}>
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
