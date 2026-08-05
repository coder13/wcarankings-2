export type ExportDateInput = Date | number | string | null | undefined;

export function normalizeExportDate(value: ExportDateInput): string | null {
  if (value instanceof Date) {
    return value.toISOString();
  }

  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const mariadbUtc = raw.match(
    /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d+)?) UTC$/,
  );
  const parseable = mariadbUtc ? `${mariadbUtc[1]}T${mariadbUtc[2]}Z` : raw;
  const timestamp = Date.parse(parseable);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}
