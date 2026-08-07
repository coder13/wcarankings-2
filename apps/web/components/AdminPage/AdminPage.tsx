"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import type { AdminRuntimeSnapshot } from "@/lib/admin-runtime";
import styles from "@/components/AdminHealth/AdminHealth.module.css";

const workerLabels = {
  "live-results-poller": "Live poller",
  "projection-worker": "Projection worker",
} as const;

function formatLastSeen(value: string | null) {
  return value
    ? `Last seen ${new Date(value).toLocaleString()}`
    : "No heartbeat";
}

function AdminRuntimeFooter() {
  const [runtime, setRuntime] = useState<AdminRuntimeSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const response = await fetch("/api/admin/runtime", {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Runtime status is unavailable.");
        const next = (await response.json()) as AdminRuntimeSnapshot;
        if (!cancelled) setRuntime(next);
      } catch {
        if (!cancelled) setRuntime(null);
      }
    }
    void refresh();
    const interval = window.setInterval(() => void refresh(), 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <footer className={styles.adminFooter} aria-label="Worker status">
      <span className={styles.footerLabel}>Workers</span>
      {runtime ? (
        <>
          {runtime.workers.map((worker) => (
            <span
              key={worker.name}
              className={`${styles.footerStatus} ${
                worker.status === "online" ? styles.healthy : styles.degraded
              }`}
              title={formatLastSeen(worker.lastSeenAt)}
            >
              {workerLabels[worker.name]}: {worker.status}
            </span>
          ))}
          <span className={styles.footerQueue}>
            {runtime.queue.available
              ? `${runtime.queue.waiting} queued · ${runtime.queue.active} active`
              : "Redis queue unavailable"}
          </span>
        </>
      ) : (
        <span className={`${styles.footerStatus} ${styles.unknown}`}>
          Worker status unavailable
        </span>
      )}
    </footer>
  );
}

export function AdminPage({
  title,
  description,
  aside,
  children,
}: {
  title: string;
  description: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href="/" className={styles.back}>
            ← WCA Rankings
          </Link>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {aside}
      </header>
      {children}
      <AdminRuntimeFooter />
    </main>
  );
}
