import {
  CORE_RANKING_TABLES,
  SEMANTIC_PROJECTION_DEFINITIONS,
  SEMANTIC_PROJECTION_TABLES,
} from "../../projection-catalog/tables.ts";
import type { SemanticProjectionDefinition } from "../../projection-catalog/tables.ts";
import type { ProjectionConnection } from "../shared/database-types.ts";
import type { BuildPhase, TableProgress } from "./progress-types.ts";
import { createdTables, executeTableStatements, projectionSql } from "./sql.ts";
import type { CountRow, ProjectionRegistryEntry } from "./types.ts";

function renameProjectionTables(sql: string, suffix: string): string {
  return [...SEMANTIC_PROJECTION_TABLES, ...CORE_RANKING_TABLES]
    .sort((left, right) => right.length - left.length)
    .reduce(
      (renamed, table) =>
        renamed.replace(
          new RegExp(`(?<![A-Za-z0-9_])${table}(?![A-Za-z0-9_])`, "g"),
          `${table}${suffix}`,
        ),
      sql,
    );
}

async function buildSqlProjection(
  connection: ProjectionConnection,
  definition: SemanticProjectionDefinition,
  suffix: string,
  tableProgress: TableProgress,
): Promise<BuildPhase[]> {
  const phases: BuildPhase[] = [];
  for (const file of definition.files) {
    const sql = renameProjectionTables(await projectionSql(file), suffix);
    await executeTableStatements(connection, sql, phases, { tableProgress });
  }
  return phases;
}

async function validateProjection(
  connection: ProjectionConnection,
  definition: SemanticProjectionDefinition,
  suffix: string,
): Promise<Record<string, number>> {
  const rowCounts: Record<string, number> = {};
  for (const table of definition.tables) {
    const [rows] = await connection.query<CountRow[]>(
      `SELECT COUNT(*) AS count FROM \`${table}${suffix}\``,
    );
    rowCounts[table] = Number(rows[0]?.count ?? 0);
  }
  return rowCounts;
}

export const PROJECTION_REGISTRY: readonly ProjectionRegistryEntry[] =
  SEMANTIC_PROJECTION_DEFINITIONS.map((definition) => ({
    ...definition,
    build: (
      connection: ProjectionConnection,
      suffix: string,
      tableProgress: TableProgress,
    ) => buildSqlProjection(connection, definition, suffix, tableProgress),
    validate: (connection: ProjectionConnection, suffix: string) =>
      validateProjection(connection, definition, suffix),
  }));

export async function countProjectionTables(
  projections: readonly ProjectionRegistryEntry[],
): Promise<number> {
  let total = 0;
  for (const projection of projections) {
    for (const file of projection.files) {
      total += createdTables(
        renameProjectionTables(await projectionSql(file), ""),
      ).length;
    }
  }
  return total;
}
