export type ImportHealthStatus =
  | "empty"
  | "export_available"
  | "import_running"
  | "last_import_succeeded"
  | "last_import_failed";

export type ImportHealthStatusInput = {
  latestRun?: { status?: string } | null;
  currentExport?: unknown;
};

export function getImportHealthStatus({
  latestRun,
  currentExport,
}: ImportHealthStatusInput) {
  if (latestRun?.status === "running") return "import_running" as const;
  if (latestRun?.status === "failed") return "last_import_failed" as const;
  if (latestRun?.status === "succeeded")
    return "last_import_succeeded" as const;
  return currentExport ? ("export_available" as const) : ("empty" as const);
}

export function formatDuration(durationMs: number | null | undefined) {
  if (durationMs == null) return "—";
  if (durationMs < 1000) return `${durationMs} ms`;
  return `${(durationMs / 1000).toFixed(1)} s`;
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
