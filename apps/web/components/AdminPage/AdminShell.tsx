"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader/AppHeader";
import type { AdminHealthSnapshot } from "@/lib/admin-health";
import styles from "@/components/AdminHealth/AdminHealth.module.css";

const workerLabels = {
  "live-results-poller": "Live poller",
  "projection-worker": "Projection worker",
} as const;

const adminPages = [
  { href: "/admin/health", label: "Health" },
  { href: "/admin/live", label: "Live results" },
  { href: "/admin/queue", label: "Queue" },
  { href: "/admin/live/settings", label: "Settings" },
] as const;

function formatLastSeen(value: string | null) {
  return value
    ? `Last seen ${new Date(value).toLocaleString()}`
    : "No heartbeat";
}

function AdminRuntimeFooter() {
  const [health, setHealth] = useState<AdminHealthSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const response = await fetch("/api/admin/health", {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Runtime status is unavailable.");
        const next = (await response.json()) as AdminHealthSnapshot;
        if (!cancelled) setHealth(next);
      } catch {
        if (!cancelled) setHealth(null);
      }
    }
    void refresh();
    const interval = window.setInterval(() => void refresh(), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <footer className={styles.adminFooter} aria-label="Worker status">
      {health ? (
        <>
          <div className={styles.footerWorkers}>
            {health.workers.map((worker) => (
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
          </div>
          <span className={styles.footerQueue}>
            {health.queue.available
              ? `${health.queue.waiting} queued · ${health.queue.active} active`
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

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <main className={styles.page}>
      <AppHeader className={styles.appHeader} />
      <nav className={styles.navigation} aria-label="Admin pages">
        {adminPages.map((page) => (
          <Link
            key={page.href}
            href={page.href}
            aria-current={pathname === page.href ? "page" : undefined}
          >
            {page.label}
          </Link>
        ))}
      </nav>
      {children}
      <AdminRuntimeFooter />
    </main>
  );
}
