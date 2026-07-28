import { query } from "@/db";
import { getImportHealthStatus } from "@/lib/import-health";

export const dynamic = "force-dynamic";

type ImportRunRow = {
  id: number;
  export_date: string | null;
  export_format_version: string | null;
  status: string;
  started_at: string;
  fetch_started_at: string | null;
  fetched_at: string | null;
  projection_build_started_at: string | null;
  projection_built_at: string | null;
  projection_build_duration_ms: number | null;
  completed_at: string | null;
  duration_ms: number | null;
  failure_message: string | null;
  projection_swap_status: string;
  source_person_count: number | null;
  source_result_count: number | null;
  published_ranking_count: number | null;
  published_result_count: number | null;
  event_count: number | null;
  region_count: number | null;
  aggregate_count: number | null;
  result_aggregate_count: number | null;
};

type ProjectionTableRow = {
  name: string;
};

const expectedProjectionTables = [
  "ranking_entries_single",
  "ranking_entries_average",
  "ranking_counts",
  "result_entries_single",
  "result_counts",
] as const;

function serializeRun(run: ImportRunRow | null) {
  if (!run) return null;
  const projectionBuildElapsedMs = run.projection_build_duration_ms == null && run.projection_build_started_at
    ? Math.max(0, Date.now() - new Date(run.projection_build_started_at).getTime())
    : run.projection_build_duration_ms;
  return {
    id: Number(run.id),
    exportDate: run.export_date,
    exportFormatVersion: run.export_format_version,
    status: run.status,
    startedAt: run.started_at,
    fetchStartedAt: run.fetch_started_at,
    fetchedAt: run.fetched_at,
    projectionBuildStartedAt: run.projection_build_started_at,
    projectionBuiltAt: run.projection_built_at,
    projectionBuildDurationMs: run.projection_build_duration_ms == null ? null : Number(run.projection_build_duration_ms),
    projectionBuildElapsedMs: projectionBuildElapsedMs == null ? null : Number(projectionBuildElapsedMs),
    completedAt: run.completed_at,
    durationMs: run.duration_ms == null ? null : Number(run.duration_ms),
    failureMessage: run.failure_message,
    projectionSwapStatus: run.projection_swap_status,
    counts: {
      sourcePeople: run.source_person_count == null ? null : Number(run.source_person_count),
      sourceResults: run.source_result_count == null ? null : Number(run.source_result_count),
      publishedRankings: run.published_ranking_count == null ? null : Number(run.published_ranking_count),
      publishedResults: run.published_result_count == null ? null : Number(run.published_result_count),
      events: run.event_count == null ? null : Number(run.event_count),
      regions: run.region_count == null ? null : Number(run.region_count),
      aggregates: run.aggregate_count == null ? null : Number(run.aggregate_count),
      resultAggregates: run.result_aggregate_count == null ? null : Number(run.result_aggregate_count),
    },
  };
}

export async function GET() {
  try {
    const [metadata, latest, successful, failures, projectionTables] = await Promise.all([
      query<{ key: string; value: string }>("SELECT `key`, value FROM export_metadata WHERE `key` IN ('export_date', 'export_format_version', 'fetched_at')"),
      query<ImportRunRow>("SELECT * FROM import_runs ORDER BY id DESC LIMIT 1"),
      query<ImportRunRow>("SELECT * FROM import_runs WHERE status = 'succeeded' ORDER BY id DESC LIMIT 1"),
      query<ImportRunRow>("SELECT * FROM import_runs WHERE status = 'failed' ORDER BY id DESC LIMIT 5"),
      query<ProjectionTableRow>(`
        SELECT table_name AS name
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name IN (
            'ranking_entries_single',
            'ranking_entries_average',
            'ranking_counts',
            'result_entries_single',
            'result_counts'
          )
      `),
    ]);
    const currentExport = Object.fromEntries(metadata.rows.map((row) => [row.key, row.value]));
    const latestRun = latest.rows[0] ?? null;
    const presentProjectionTables = new Set(projectionTables.rows.map((table) => table.name));
    const tableHealth = expectedProjectionTables.map((name) => ({
      name,
      present: presentProjectionTables.has(name),
    }));
    return Response.json({
      status: getImportHealthStatus({ latestRun, currentExport: currentExport.export_date }),
      currentExport: currentExport.export_date ? {
        date: currentExport.export_date,
        formatVersion: currentExport.export_format_version ?? null,
        fetchedAt: currentExport.fetched_at ?? null,
      } : null,
      latestRun: serializeRun(latestRun),
      lastSuccessfulRun: serializeRun(successful.rows[0] ?? null),
      recentFailures: failures.rows.map(serializeRun),
      projectionTables: {
        ready: Boolean(currentExport.export_date) && tableHealth.every((table) => table.present),
        tables: tableHealth,
      },
      diagnostics: latestRun
        ? `import_run_id=${latestRun.id}; status=${latestRun.status}; projection_swap=${latestRun.projection_swap_status}; projection_tables=${tableHealth.filter((table) => table.present).length}/${tableHealth.length}; projection_build_ms=${latestRun.projection_build_duration_ms ?? "running"}`
        : `No import run has been recorded. projection_tables=${tableHealth.filter((table) => table.present).length}/${tableHealth.length}`,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({
      status: "empty",
      currentExport: null,
      latestRun: null,
      lastSuccessfulRun: null,
      recentFailures: [],
      projectionTables: {
        ready: false,
        tables: expectedProjectionTables.map((name) => ({ name, present: false })),
      },
      diagnostics: "Import health is unavailable because the application database could not be queried.",
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
