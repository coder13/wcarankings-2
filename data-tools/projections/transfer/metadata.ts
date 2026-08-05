import type { ProjectionTransferMetadata } from "./types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function parseProjectionTransferMetadata(
  value: unknown,
): ProjectionTransferMetadata {
  if (!isRecord(value)) {
    throw new Error("Projection transfer metadata is invalid");
  }
  const group = optionalString(value.group) ?? "";
  const tables = value.tables;
  if (
    !group ||
    !Array.isArray(tables) ||
    tables.length === 0 ||
    !tables.every((table) => typeof table === "string")
  ) {
    throw new Error("Projection transfer metadata is invalid");
  }
  for (const table of tables) {
    if (!/^[a-z0-9_]+$/.test(table)) {
      throw new Error(`Unsafe transfer table: ${table}`);
    }
  }
  const filesValue = value.files;
  const files =
    Array.isArray(filesValue) &&
    filesValue.every((file) => typeof file === "string")
      ? filesValue
      : undefined;
  return {
    ...value,
    group,
    tables,
    format: optionalString(value.format),
    archiveFile: optionalString(value.archiveFile),
    exportDate: optionalString(value.exportDate),
    files,
  };
}
