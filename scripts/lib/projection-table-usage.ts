export type ProjectionTableUsageSourceKind =
  "projection-sql" | "runtime-reference" | "runtime-sql";

export interface ProjectionTableUsageSource {
  content: string;
  kind: ProjectionTableUsageSourceKind;
  path: string;
}

export interface ProjectionTableUsage {
  consumers: string[];
  table: string;
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function runtimeUsesTable(content: string, table: string): boolean {
  const escapedTable = escapeRegularExpression(table);
  return new RegExp(`\\b${escapedTable}\\b`).test(content);
}

function projectionSqlUsesTable(content: string, table: string): boolean {
  const escapedTable = escapeRegularExpression(table);
  return new RegExp(`\\b(?:FROM|JOIN)\\s+\`?${escapedTable}\\b\`?`, "i").test(
    content,
  );
}

export function projectionTableUsage(
  tables: readonly string[],
  sources: readonly ProjectionTableUsageSource[],
): ProjectionTableUsage[] {
  return [...new Set(tables)].sort().map((table) => ({
    table,
    consumers: sources
      .filter((source) =>
        source.kind === "runtime-reference"
          ? runtimeUsesTable(source.content, table)
          : projectionSqlUsesTable(source.content, table),
      )
      .map((source) => source.path)
      .sort(),
  }));
}

export function unusedProjectionTables(
  tables: readonly string[],
  sources: readonly ProjectionTableUsageSource[],
): string[] {
  return projectionTableUsage(tables, sources)
    .filter(({ consumers }) => consumers.length === 0)
    .map(({ table }) => table);
}
