import type { ProjectionConnection } from "../shared/database-types.ts";
import { PROJECTION_TABLE_REQUIREMENTS } from "./requirements.ts";
import type {
  ColumnNameRow,
  IndexNameRow,
  MetadataRow,
  ProjectionVerificationResult,
  TableNameRow,
} from "./types.ts";

function placeholders(values: readonly unknown[]): string {
  return values.map(() => "?").join(", ");
}

export async function inspectRankingProjections(
  connection: ProjectionConnection,
): Promise<ProjectionVerificationResult> {
  const requiredTables = PROJECTION_TABLE_REQUIREMENTS.map(
    (requirement) => requirement.table,
  );
  const requiredColumns = [
    ...new Set(
      PROJECTION_TABLE_REQUIREMENTS.flatMap(
        (requirement) => requirement.columns ?? [],
      ),
    ),
  ];
  const requiredIndexes = [
    ...new Set(
      PROJECTION_TABLE_REQUIREMENTS.flatMap(
        (requirement) => requirement.indexes ?? [],
      ),
    ),
  ];
  const [tableRows] = await connection.query<TableNameRow[]>(
    `SELECT table_name AS name FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_name IN (${placeholders(requiredTables)})`,
    requiredTables,
  );
  const tables = new Set(tableRows.map((row) => row.name));
  const detailedTables = PROJECTION_TABLE_REQUIREMENTS.filter(
    (requirement) => requirement.columns || requirement.indexes,
  ).map((requirement) => requirement.table);
  const [columnRows] = await connection.query<ColumnNameRow[]>(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name IN (${placeholders(detailedTables)})
       AND column_name IN (${placeholders(requiredColumns)})`,
    [...detailedTables, ...requiredColumns],
  );
  const [indexRows] = await connection.query<IndexNameRow[]>(
    `SELECT table_name, index_name FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name IN (${placeholders(detailedTables)})
       AND index_name IN (${placeholders(requiredIndexes)})`,
    [...detailedTables, ...requiredIndexes],
  );
  const metadataRows = tables.has("export_metadata")
    ? (
        await connection.query<MetadataRow[]>(
          "SELECT `key`, value FROM export_metadata WHERE `key` = 'fetched_at'",
        )
      )[0]
    : [];
  const columns = new Set(
    columnRows.map((row) => `${row.table_name}.${row.column_name}`),
  );
  const indexes = new Set(
    indexRows.map((row) => `${row.table_name}.${row.index_name}`),
  );
  const issues: string[] = [];
  for (const requirement of PROJECTION_TABLE_REQUIREMENTS) {
    if (!tables.has(requirement.table)) {
      issues.push(`missing table ${requirement.table}`);
      continue;
    }
    for (const column of requirement.columns ?? []) {
      if (!columns.has(`${requirement.table}.${column}`)) {
        issues.push(`missing column ${requirement.table}.${column}`);
      }
    }
    for (const index of requirement.indexes ?? []) {
      if (!indexes.has(`${requirement.table}.${index}`)) {
        issues.push(`missing index ${requirement.table}.${index}`);
      }
    }
  }
  if (!metadataRows[0]?.value) {
    issues.push("missing export_metadata.fetched_at");
  }
  return {
    ready: issues.length === 0,
    issues,
    checkedTables: requiredTables,
  };
}
