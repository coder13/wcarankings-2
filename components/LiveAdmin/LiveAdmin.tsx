"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
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
    <main style={{ maxWidth: 1100, margin: "2rem auto", padding: "0 1rem" }}>
      <Link href="/">← WCA Rankings</Link>
      <h1>Live results</h1>
      <p>
        Discovery cron:{" "}
        <code>{data?.scheduler.discoveryCron ?? "Loading…"}</code>. Poll loop:{" "}
        {data?.scheduler.pollerIntervalMs ?? "…"} ms.
      </p>
      <button disabled={selected.length === 0} onClick={() => void trigger()}>
        Import selected competitions
      </button>
      {message && <p>{message}</p>}
      <table
        style={{ width: "100%", marginTop: "1rem", borderCollapse: "collapse" }}
      >
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
    </main>
  );
}
