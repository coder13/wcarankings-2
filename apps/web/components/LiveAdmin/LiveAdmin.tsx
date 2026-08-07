"use client";
import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import styles from "@/components/AdminHealth/AdminHealth.module.css";
type Source = {
  source_name: string;
  competition_id: string;
  name: string | null;
  city_name: string | null;
  poll_seconds: number;
  next_poll_at: string;
  last_success_at: string | null;
  last_error: string | null;
};
type Snapshot = {
  scheduler: { discoveryCron: string; pollerIntervalMs: number };
  worker: { online: boolean | null; lastSeenAt: string | null };
  sources: Source[];
};

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={styles.metric}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);

  return {
    date: date.toLocaleDateString(),
    time: date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
  };
}

function DateTime({ value }: { value: string | null }) {
  if (!value) return <span className={styles.empty}>—</span>;

  const formatted = formatDateTime(value);
  return (
    <time className={styles.dateTime} dateTime={value}>
      <span>{formatted.date}</span>
      <span>{formatted.time}</span>
    </time>
  );
}

export function LiveAdmin() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const load = async () =>
    setData(
      await (await fetch("/api/admin/live", { cache: "no-store" })).json(),
    );
  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const id = window.setInterval(() => void load(), 10_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(id);
    };
  }, []);
  async function trigger() {
    const response = await fetch("/api/admin/live", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ competitionIds: selected }),
    });
    const payload = (await response.json()) as {
      scheduled?: string[];
      error?: string;
    };
    setMessage(
      response.ok
        ? `Scheduled ${payload.scheduled?.length ?? 0} manual imports.`
        : (payload.error ?? "Import scheduling failed."),
    );
    if (response.ok) {
      setSelected([]);
      await load();
    }
  }
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href="/" className={styles.back}>
            ← WCA Rankings
          </Link>
          <h1>Live results</h1>
          <p>Tracked competitions active today and their import state.</p>
        </div>
        <div className={styles.statusGroup}>
          <strong className={`${styles.status} ${styles.unknown}`}>
            {data?.sources.length ?? "…"} tracked
          </strong>
          <strong
            className={`${styles.status} ${
              data?.worker.online === true
                ? styles.healthy
                : data?.worker.online === false
                  ? styles.degraded
                  : styles.unknown
            }`}
            title={
              data?.worker.lastSeenAt
                ? `Last seen ${new Date(data.worker.lastSeenAt).toLocaleString()}`
                : "Worker heartbeat is not available"
            }
          >
            Worker{" "}
            {data?.worker.online === true
              ? "online"
              : data?.worker.online === false
                ? "offline"
                : "status unavailable"}
          </strong>
        </div>
      </header>
      {message && <p className={styles.alert}>{message}</p>}
      <section className={styles.card} aria-labelledby="schedule-heading">
        <h2 id="schedule-heading">Poller schedule</h2>
        <dl className={styles.grid}>
          <Metric
            label="Daily discovery"
            value={data?.scheduler.discoveryCron ?? "Loading…"}
          />
          <Metric
            label="Poll loop"
            value={`${data?.scheduler.pollerIntervalMs ?? "…"} ms`}
          />
        </dl>
      </section>
      <section className={styles.card} aria-labelledby="sources-heading">
        <div className={styles.cardHeader}>
          <div>
            <h2 id="sources-heading">Tracked competitions</h2>
            <p>Choose competitions to import their latest live results.</p>
          </div>
          <button
            disabled={selected.length === 0}
            onClick={() => void trigger()}
          >
            Import selected
          </button>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.sourcesTable}>
            <thead>
              <tr>
                <th scope="col">
                  <span className={styles.visuallyHidden}>Select</span>
                </th>
                <th scope="col">Competition</th>
                <th scope="col">Provider</th>
                <th scope="col">Poll</th>
                <th scope="col">Next poll</th>
                <th scope="col">Last import</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {data?.sources.map((source) => (
                <tr key={source.competition_id}>
                  <td className={styles.selectionCell}>
                    <input
                      aria-label={`Select ${source.competition_id}`}
                      type="checkbox"
                      checked={selected.includes(source.competition_id)}
                      onChange={() =>
                        setSelected((items) =>
                          items.includes(source.competition_id)
                            ? items.filter((id) => id !== source.competition_id)
                            : [...items, source.competition_id],
                        )
                      }
                    />
                  </td>
                  <td className={styles.competitionCell}>
                    <strong>{source.name ?? source.competition_id}</strong>
                    <span>
                      {source.competition_id}
                      {source.city_name ? ` · ${source.city_name}` : ""}
                    </span>
                  </td>
                  <td>
                    <span className={styles.provider}>
                      {source.source_name}
                    </span>
                  </td>
                  <td className={styles.pollCell}>{source.poll_seconds}s</td>
                  <td>
                    <DateTime value={source.next_poll_at} />
                  </td>
                  <td>
                    <DateTime value={source.last_success_at} />
                  </td>
                  <td className={styles.statusCell}>
                    {source.last_error ? (
                      <span className={styles.error}>{source.last_error}</span>
                    ) : (
                      <span className={styles.success}>Ready</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
