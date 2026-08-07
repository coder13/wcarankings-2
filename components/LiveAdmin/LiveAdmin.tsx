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
        <strong className={`${styles.status} ${styles.unknown}`}>
          {data?.sources.length ?? "…"} tracked
        </strong>
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
        <h2 id="sources-heading">Tracked competitions</h2>
        <button disabled={selected.length === 0} onClick={() => void trigger()}>
          Import selected competitions
        </button>
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Competition</th>
              <th>Provider</th>
              <th>Poll</th>
              <th>Next poll</th>
              <th>Last success</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {data?.sources.map((source) => (
              <tr key={source.competition_id}>
                <td>
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
                <td>
                  {source.name ?? source.competition_id}
                  <br />
                  <small>
                    {source.competition_id}
                    {source.city_name ? ` · ${source.city_name}` : ""}
                  </small>
                </td>
                <td>{source.source_name}</td>
                <td>{source.poll_seconds}s</td>
                <td>{new Date(source.next_poll_at).toLocaleString()}</td>
                <td>
                  {source.last_success_at
                    ? new Date(source.last_success_at).toLocaleString()
                    : "—"}
                </td>
                <td>{source.last_error ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
