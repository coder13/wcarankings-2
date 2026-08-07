"use client";

import { useCallback, useEffect, useState } from "react";
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

type QueueResponse = { items: QueueItem[]; limited: boolean; error?: string };

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

function payload(item: QueueItem) {
  const values = Object.entries(item.payload);
  return values.length
    ? values.map(([key, value]) => `${key}: ${value}`).join(", ")
    : "—";
}

function queueSummary(data: QueueResponse | null, activeCount: number) {
  if (!data) return "Loading…";
  if (activeCount) return `${activeCount} processing`;
  return `${data.items.length} items`;
}

export function ProjectionQueueAdmin() {
  const [data, setData] = useState<QueueResponse | null>(null);
  const [message, setMessage] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/queue", { cache: "no-store" });
    const next = (await response.json()) as QueueResponse;
    setData(
      response.ok ? next : { items: [], limited: false, error: next.error },
    );
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

  const activeCount =
    data?.items.filter((item) => item.state === "active").length ?? 0;

  async function remove(jobId: string) {
    setRemoving(jobId);
    setMessage("");
    try {
      const response = await fetch("/api/admin/queue", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const result = (await response.json()) as { error?: string };
      setMessage(
        response.ok
          ? "Queue item removed."
          : (result.error ?? "The queue item could not be removed."),
      );
      await load();
    } catch {
      setMessage("The queue item could not be removed.");
    } finally {
      setRemoving(null);
    }
  }

  async function clear() {
    setClearing(true);
    setMessage("");
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
      setMessage(
        response.ok
          ? `Removed ${result.removed ?? 0} queue items. ${result.active ?? 0} active items remain.`
          : (result.error ?? "The queue could not be cleared."),
      );
      await load();
    } catch {
      setMessage("The queue could not be cleared.");
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
      {message && <p className={styles.alert}>{message}</p>}
      {data?.error && <p className={styles.alert}>{data.error}</p>}
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
        {data?.limited && (
          <p className={styles.alert}>
            Only the 1,000 most recent queue items are shown.
          </p>
        )}
        <div className={styles.tableWrap}>
          <table className={styles.sourcesTable}>
            <thead>
              <tr>
                <th scope="col">State</th>
                <th scope="col">Rebuild</th>
                <th scope="col">Queued at</th>
                <th scope="col">Attempts</th>
                <th scope="col">Details</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <span className={styles.provider}>{item.state}</span>
                  </td>
                  <td className={styles.competitionCell}>
                    <strong>{item.kind}</strong>
                    <span>{item.key}</span>
                  </td>
                  <td>
                    <DateTime value={item.createdAt} />
                  </td>
                  <td>{item.attemptsMade}</td>
                  <td className={styles.statusCell}>
                    {item.failedReason ? (
                      <span className={styles.error}>{item.failedReason}</span>
                    ) : (
                      <span className={styles.empty}>{payload(item)}</span>
                    )}
                  </td>
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
                  <td colSpan={6} className={styles.tableEmpty}>
                    No queue items.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
