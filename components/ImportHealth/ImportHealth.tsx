"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  formatDate,
  formatDuration,
  type ImportHealthStatus,
} from "@/lib/import-health";
import styles from "./ImportHealth.module.css";

type ImportRun = {
  id: number;
  exportDate: string | null;
  exportFormatVersion: string | null;
  status: string;
  startedAt: string;
  fetchStartedAt: string | null;
  fetchedAt: string | null;
  projectionBuildStartedAt: string | null;
  projectionBuiltAt: string | null;
  projectionBuildDurationMs: number | null;
  projectionBuildElapsedMs: number | null;
  completedAt: string | null;
  durationMs: number | null;
  failureMessage: string | null;
  projectionSwapStatus: string;
  counts: Record<string, number | null>;
};

type HealthPayload = {
  status: ImportHealthStatus;
  currentExport: { date: string; formatVersion: string | null; fetchedAt: string | null } | null;
  latestRun: ImportRun | null;
  lastSuccessfulRun: ImportRun | null;
  recentFailures: ImportRun[];
  projectionTables: {
    ready: boolean;
    tables: Array<{ name: string; present: boolean }>;
  };
  diagnostics: string;
};

const statusLabels: Record<ImportHealthStatus, string> = {
  empty: "No import data",
  export_available: "Export available",
  import_running: "Import running",
  last_import_succeeded: "Last import succeeded",
  last_import_failed: "Last import failed",
};

const projectionStatusLabels: Record<string, string> = {
  not_started: "Waiting to build",
  building: "Building staging tables",
  swapping: "Publishing rebuilt tables",
  published: "Published",
  failed: "Build failed",
};

function Metric({ label, value }: { label: string; value: string | number | null | undefined }) {
  return <div className={styles.metric}><dt>{label}</dt><dd>{value ?? "—"}</dd></div>;
}

export function ImportHealth() {
  const [data, setData] = useState<HealthPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let refreshTimer: number | undefined;

    async function refresh() {
      try {
        const response = await fetch("/api/admin/import-health", { cache: "no-store" });
        const payload = await response.json() as HealthPayload;
        if (!response.ok) throw new Error(payload.diagnostics);
        if (cancelled) return;
        setData(payload);
        setError(null);
        refreshTimer = window.setTimeout(refresh, payload.status === "import_running" ? 5_000 : 30_000);
      } catch (requestError) {
        if (cancelled) return;
        setError(requestError instanceof Error ? requestError.message : "Unable to load import health.");
        refreshTimer = window.setTimeout(refresh, 30_000);
      }
    }

    void refresh();
    return () => {
      cancelled = true;
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
    };
  }, []);

  if (error && !data) return <main className={styles.page}><p className={styles.alert}>{error}</p></main>;
  if (!data) return <main className={styles.page}><p>Loading import health…</p></main>;

  const run = data.latestRun ?? data.lastSuccessfulRun;
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div><Link href="/" className={styles.back}>← WCA Rankings</Link><h1>Import health</h1><p>Read-only diagnostics for ranking data freshness and publication.</p></div>
        <strong className={`${styles.status} ${styles[data.status]}`}>{statusLabels[data.status]}</strong>
      </header>

      {error && <p className={styles.alert}>Latest refresh failed: {error}</p>}

      <section className={styles.card} aria-labelledby="export-heading">
        <h2 id="export-heading">Current published export</h2>
        <dl className={styles.grid}>
          <Metric label="Export date" value={data.currentExport?.date} />
          <Metric label="Format version" value={data.currentExport?.formatVersion} />
          <Metric label="Published at" value={formatDate(data.currentExport?.fetchedAt)} />
          <Metric label="Projection tables ready" value={data.projectionTables.ready ? "Yes" : "No"} />
        </dl>
      </section>

      <section className={styles.card} aria-labelledby="projection-heading">
        <h2 id="projection-heading">Ranking projection tables</h2>
        <dl className={styles.grid}>
          <Metric label="Status" value={run ? projectionStatusLabels[run.projectionSwapStatus] ?? run.projectionSwapStatus : null} />
          <Metric label="Build started" value={formatDate(run?.projectionBuildStartedAt)} />
          <Metric label="Build completed" value={formatDate(run?.projectionBuiltAt)} />
          <Metric
            label={run?.projectionBuildDurationMs == null && run?.projectionBuildStartedAt ? "Building for" : "Build duration"}
            value={formatDuration(run?.projectionBuildDurationMs ?? run?.projectionBuildElapsedMs)}
          />
        </dl>
        <h3>Published tables</h3>
        <dl className={styles.grid}>
          {data.projectionTables.tables.map((table) => (
            <Metric key={table.name} label={table.name} value={table.present ? "Present" : "Missing"} />
          ))}
        </dl>
        <h3>Rows built</h3>
        <dl className={styles.grid}>
          <Metric label="Ranking entries" value={run?.counts.publishedRankings} />
          <Metric label="Ranking aggregates" value={run?.counts.aggregates} />
          <Metric label="Events" value={run?.counts.events} />
          <Metric label="Regions" value={run?.counts.regions} />
        </dl>
      </section>

      <section className={styles.card} aria-labelledby="run-heading">
        <h2 id="run-heading">Latest importer run</h2>
        {run ? <>
          <dl className={styles.grid}>
            <Metric label="Run" value={`#${run.id}`} />
            <Metric label="Status" value={run.status} />
            <Metric label="Started" value={formatDate(run.startedAt)} />
            <Metric label="Fetch started" value={formatDate(run.fetchStartedAt)} />
            <Metric label="Fetched" value={formatDate(run.fetchedAt)} />
            <Metric label="Completed" value={formatDate(run.completedAt)} />
            <Metric label="Duration" value={formatDuration(run.durationMs)} />
          </dl>
          {run.failureMessage && <p className={styles.failure}><strong>Failure:</strong> {run.failureMessage}</p>}
           <h3>Coverage</h3>
           <dl className={styles.grid}>
             <Metric label="Source people" value={run.counts.sourcePeople} />
            <Metric label="Source results" value={run.counts.sourceResults} />
            <Metric label="Published rankings" value={run.counts.publishedRankings} />
            <Metric label="Published result entries" value={run.counts.publishedResults} />
            <Metric label="Events" value={run.counts.events} />
            <Metric label="Regions" value={run.counts.regions} />
            <Metric label="Aggregates" value={run.counts.aggregates} />
             <Metric label="Result aggregates" value={run.counts.resultAggregates} />
           </dl>
        </> : <p>No import run has been recorded yet.</p>}
      </section>

      <section className={styles.card} aria-labelledby="failure-heading">
        <h2 id="failure-heading">Recent failures</h2>
        {data.recentFailures.length ? <ul className={styles.failures}>{data.recentFailures.map((failure) => <li key={failure.id}>#{failure.id} · {formatDate(failure.completedAt)} · {failure.failureMessage ?? "Unknown failure"}</li>)}</ul> : <p>No recent failures.</p>}
      </section>

      <section className={styles.card} aria-labelledby="diagnostics-heading">
        <h2 id="diagnostics-heading">Deployment diagnostics</h2>
        <textarea className={styles.diagnostics} readOnly value={data.diagnostics} aria-label="Copyable deployment diagnostics" />
      </section>
    </main>
  );
}
