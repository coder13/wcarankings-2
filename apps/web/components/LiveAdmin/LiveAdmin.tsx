"use client";
import { type ReactNode, useEffect, useState } from "react";
import { AdminPage } from "@/components/AdminPage/AdminPage";
import styles from "@/components/AdminHealth/AdminHealth.module.css";
import { flagEmoji } from "@/lib/wca";
type Source = {
  source_name: string;
  competition_id: string;
  name: string | null;
  country_iso2: string;
  enabled: number;
  scoretaking_software: string | null;
  provider_status: "supported" | "unsupported" | "unknown";
  provider_message: string | null;
  start_date: string;
  end_date: string;
  result_count: number;
  person_count: number;
  registered_person_count: number | null;
  leased_until: string | null;
  last_success_at: string | null;
  last_imported_at: string | null;
  last_error: string | null;
};
type Snapshot = {
  scheduler: {
    discoveryCron: string;
    pollSeconds: number;
    nextImportAt: string | null;
  };
  summary: {
    competition_count: number;
    country_count: number;
    person_count: number;
  };
  sources: Source[];
};
type AlertMessage = { text: string; tone: "success" | "error" };

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

function competitionDates(source: Source) {
  return source.start_date === source.end_date
    ? source.start_date
    : `${source.start_date} – ${source.end_date}`;
}

function formatMinutes(seconds: number) {
  return `${seconds / 60}m`;
}

function resultsNotPublished(source: Source) {
  return (
    source.source_name === "wca-live" &&
    (source.last_error === "Results not published yet." ||
      source.last_error?.startsWith("404 Not Found:") === true)
  );
}

function providerUnavailable(source: Source) {
  return source.provider_status !== "supported";
}

function canRetryProvider(source: Source) {
  return (
    source.provider_status === "unknown" &&
    source.provider_message === "WCA scoretaking software is unavailable."
  );
}

function canManuallyImport(source: Source) {
  return source.provider_status === "supported" || canRetryProvider(source);
}

type ImportState = "active" | "failed" | "queued" | "ready" | "waiting";

function importState(source: Source): ImportState {
  if (
    source.leased_until &&
    Number.isFinite(Date.parse(source.leased_until)) &&
    Date.parse(source.leased_until) > Date.now()
  )
    return "active";
  if (source.last_error && !resultsNotPublished(source)) return "failed";
  if (source.last_success_at) return "ready";
  return "waiting";
}

function importStateClass(state: ImportState) {
  return {
    active: styles.queueStateActive,
    failed: styles.queueStateFailed,
    queued: styles.queueStatePrioritized,
    ready: styles.queueStateActive,
    waiting: styles.queueStateWaiting,
  }[state];
}

function importStateLabel(source: Source, state: ImportState) {
  if (resultsNotPublished(source)) return "Waiting for results";
  return {
    active: "Importing",
    failed: "Failed",
    queued: "Queued",
    ready: "Up to date",
    waiting: "Waiting",
  }[state];
}

function ImportStatus({
  source,
  onRetry,
  retrying,
}: {
  source: Source;
  onRetry: () => void;
  retrying: boolean;
}) {
  if (providerUnavailable(source))
    return (
      <span className={styles.unsupported}>
        {source.provider_message ?? "Live results provider is not supported."}
        {canRetryProvider(source) && (
          <button
            className={styles.inlineAction}
            disabled={retrying}
            onClick={onRetry}
            type="button"
          >
            Try again
          </button>
        )}
      </span>
    );
  const state = importState(source);
  return (
    <>
      <span className={`${styles.queueState} ${importStateClass(state)}`}>
        {importStateLabel(source, state)}
      </span>
      {source.last_error && (
        <span className={styles.error}>{source.last_error}</span>
      )}
    </>
  );
}

export function LiveAdmin() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState<AlertMessage | null>(null);
  const [retryingCompetitionId, setRetryingCompetitionId] = useState<
    string | null
  >(null);
  const refreshIntervalMs = data?.sources.some((source) => {
    const state = importState(source);
    return state === "active" || state === "queued";
  })
    ? 2_000
    : 10_000;
  const load = async () =>
    setData(
      await (await fetch("/api/admin/live", { cache: "no-store" })).json(),
    );
  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const id = window.setInterval(() => void load(), refreshIntervalMs);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(id);
    };
  }, [refreshIntervalMs]);
  async function trigger(competitionIds = selected) {
    const retrying = competitionIds.length === 1 ? competitionIds[0] : null;
    if (retrying) setRetryingCompetitionId(retrying);
    try {
      const response = await fetch("/api/admin/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competitionIds }),
      });
      const payload = (await response.json()) as {
        scheduled?: string[];
        error?: string;
      };
      setMessage({
        text: response.ok
          ? `Scheduled ${payload.scheduled?.length ?? 0} manual imports.`
          : (payload.error ?? "Import scheduling failed."),
        tone: response.ok ? "success" : "error",
      });
      if (response.ok) {
        setSelected((items) =>
          items.filter((id) => !competitionIds.includes(id)),
        );
        await load();
      }
    } catch {
      setMessage({ text: "Import scheduling failed.", tone: "error" });
    } finally {
      if (retrying) setRetryingCompetitionId(null);
    }
  }
  return (
    <AdminPage
      title="Live results"
      aside={
        <div className={styles.statusGroup}>
          <strong className={`${styles.status} ${styles.unknown}`}>
            {data?.summary.competition_count ?? "…"} competitions
          </strong>
          <strong className={`${styles.status} ${styles.unknown}`}>
            {data?.summary.country_count ?? "…"} countries
          </strong>
          <strong className={`${styles.status} ${styles.unknown}`}>
            {data?.summary.person_count ?? "…"} people
          </strong>
        </div>
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
      <section className={styles.card} aria-labelledby="schedule-heading">
        <h2 id="schedule-heading">Worker schedule</h2>
        <dl className={styles.grid}>
          <Metric
            label="Daily discovery"
            value={data?.scheduler.discoveryCron ?? "Loading…"}
          />
          <Metric
            label="Import every"
            value={
              data ? formatMinutes(data.scheduler.pollSeconds) : "Loading…"
            }
          />
          <Metric
            label="Next import"
            value={<DateTime value={data?.scheduler.nextImportAt ?? null} />}
          />
        </dl>
      </section>
      <section
        className={styles.tableSection}
        aria-labelledby="sources-heading"
      >
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
                <th scope="col">Results</th>
                <th scope="col">People</th>
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
                      disabled={!canManuallyImport(source)}
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
                    <div className={styles.competitionIdentity}>
                      <span
                        className={styles.competitionFlag}
                        aria-label={`Country: ${source.country_iso2 || "unknown"}`}
                        role="img"
                      >
                        {flagEmoji(source.country_iso2)}
                      </span>
                      <div>
                        <strong>{source.name ?? source.competition_id}</strong>
                        <span>{competitionDates(source)}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={styles.provider}>
                      {source.source_name}
                    </span>
                  </td>
                  <td className={styles.pollCell}>{source.result_count}</td>
                  <td className={styles.pollCell}>
                    {source.person_count} /{" "}
                    {source.registered_person_count ?? "—"}
                  </td>
                  <td>
                    <DateTime value={source.last_imported_at} />
                  </td>
                  <td className={styles.statusCell}>
                    <ImportStatus
                      onRetry={() => void trigger([source.competition_id])}
                      retrying={retryingCompetitionId === source.competition_id}
                      source={source}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AdminPage>
  );
}
