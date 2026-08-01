"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AdminHealthSnapshot } from "@/lib/admin-health";
import styles from "../ImportHealth/ImportHealth.module.css";

const capabilityLabels: Record<string, string> = {
  core: "Core rankings",
  resultRankings: "Result rankings",
  competitionRankings: "Competition rankings",
  cityEventStats: "City/event statistics",
  sumOfRanks: "Sum of Ranks",
  yearlyPersonRankings: "Yearly person rankings",
};

async function loadHealth(): Promise<AdminHealthSnapshot> {
  const response = await fetch("/api/admin/health", { cache: "no-store" });
  const payload = (await response.json()) as AdminHealthSnapshot;
  if (!response.ok)
    throw new Error(
      payload.diagnostics.join("; ") || "Health data is unavailable.",
    );
  return payload;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}
function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "—";
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className={styles.metric}>
      <dt>{label}</dt>
      <dd>{value ?? "—"}</dd>
    </div>
  );
}

export function AdminHealth({
  load = loadHealth,
}: {
  load?: () => Promise<AdminHealthSnapshot>;
}) {
  const [data, setData] = useState<AdminHealthSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    async function refresh() {
      try {
        const next = await load();
        if (cancelled) return;
        setData(next);
        setError(null);
      } catch (requestError) {
        if (cancelled) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Health data is unavailable.",
        );
      }
      if (!cancelled) timer = window.setTimeout(refresh, 15_000);
    }
    void refresh();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [load]);

  if (!data && error)
    return (
      <main className={styles.page}>
        <p className={styles.alert}>{error}</p>
      </main>
    );
  if (!data)
    return (
      <main className={styles.page}>
        <p>Loading health…</p>
      </main>
    );
  const cache = data.cache.totals;
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href="/" className={styles.back}>
            ← WCA Rankings
          </Link>
          <h1>Import health</h1>
          <p>
            Read-only diagnostics for ranking data freshness and publication.
          </p>
        </div>
        <strong className={`${styles.status} ${styles[data.status]}`}>
          {data.status}
        </strong>
      </header>
      {error && <p className={styles.alert}>Latest refresh failed: {error}</p>}
      <section className={styles.card} aria-labelledby="service-heading">
        <h2 id="service-heading">Service and database</h2>
        <dl className={styles.grid}>
          <Metric label="Generated" value={formatDate(data.generatedAt)} />
          <Metric label="Uptime" value={`${data.runtime.uptimeSeconds}s`} />
          <Metric label="Node" value={data.runtime.nodeVersion} />
          <Metric
            label="Process memory"
            value={`${formatBytes(data.runtime.memory.rss)} RSS / ${formatBytes(data.runtime.memory.heapUsed)} heap`}
          />
          <Metric label="DB pool" value={data.database.poolLimit} />
          <Metric
            label="DB queue"
            value={`${data.database.queueActive}/${data.database.queueLimit} (${formatPercent(data.database.queueUtilization)})`}
          />
          <Metric
            label="DB timeout"
            value={`${data.database.statementTimeoutMs} ms`}
          />
          <Metric
            label="Database"
            value={
              data.database.available
                ? "Available"
                : (data.database.error ?? "Unavailable")
            }
          />
        </dl>
      </section>
      <section className={styles.card} aria-labelledby="generation-heading">
        <h2 id="generation-heading">Active ranking generation</h2>
        {data.generation ? (
          <>
            <dl className={styles.grid}>
              <Metric label="Generation" value={data.generation.generationId} />
              <Metric label="Export" value={data.generation.exportId} />
              <Metric
                label="Activated"
                value={formatDate(data.generation.activatedAt)}
              />
              <Metric label="Source SHA" value={data.generation.sourceSha} />
              <Metric
                label="Artifact run"
                value={
                  <a
                    href={data.generation.artifactRunUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {data.generation.artifactRunId}
                  </a>
                }
              />
              <Metric label="Artifact ID" value={data.generation.artifactId} />
              <Metric
                label="Artifact format"
                value={data.generation.artifactFormatVersion}
              />
              <Metric
                label="Dataset schema"
                value={data.generation.datasetSchemaVersion}
              />
            </dl>
            <h3>Capabilities</h3>
            <dl className={styles.grid}>
              {Object.entries(data.generation.capabilities).map(
                ([name, capability]) => (
                  <Metric
                    key={name}
                    label={capabilityLabels[name] ?? name}
                    value={`${capability.status} (${capability.presentTables}/${capability.totalTables} tables)`}
                  />
                ),
              )}
            </dl>
          </>
        ) : (
          <p>No active ranking generation state is available.</p>
        )}
      </section>
      <section className={styles.card} aria-labelledby="cache-heading">
        <h2 id="cache-heading">Rankings response cache</h2>
        <dl className={styles.grid}>
          <Metric label="Entries" value={cache.entries} />
          <Metric label="Pinned pages" value={cache.pinnedEntries} />
          <Metric
            label="Estimated bytes"
            value={formatBytes(cache.estimatedBytes)}
          />
          <Metric label="Hit rate" value={formatPercent(cache.hitRate)} />
          <Metric label="Hits" value={cache.hits} />
          <Metric label="Misses" value={cache.misses} />
          <Metric label="Coalesced" value={cache.coalesced} />
          <Metric label="Evictions" value={cache.evictions} />
          <Metric
            label="Generation clears"
            value={data.cache.generationClears}
          />
          <Metric label="Since" value={formatDate(data.cache.startedAt)} />
        </dl>
        <h3>Event pools</h3>
        <dl className={styles.grid}>
          {data.cache.pools.map((pool) => (
            <Metric
              key={pool.eventId}
              label={pool.eventId}
              value={`${pool.entries}/${pool.capacity} entries · ${formatPercent(pool.hitRate)} hit · ${formatBytes(pool.estimatedBytes)}`}
            />
          ))}
        </dl>
      </section>
      {data.diagnostics.length > 0 && (
        <section className={styles.card} aria-labelledby="diagnostics-heading">
          <h2 id="diagnostics-heading">Diagnostics</h2>
          <ul className={styles.failures}>
            {data.diagnostics.map((diagnostic) => (
              <li key={diagnostic}>{diagnostic}</li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
