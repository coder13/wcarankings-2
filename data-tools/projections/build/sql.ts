import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  elapsedMs,
  startBuildHeartbeat,
  writeBuildLog,
} from "./progress.ts";
import type { ProjectionConnection } from "../shared/database-types.ts";
import type { BuildPhase, TableProgress } from "./progress-types.ts";

export interface ExecuteTableStatementsOptions {
  tableProgress?: TableProgress;
}

const projectionDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "projection-catalog",
);

export function statements(sql: string): string[] {
  return sql
    .split(/;\s*(?:\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

export async function projectionSql(file: string): Promise<string> {
  return readFile(join(projectionDirectory, file), "utf8");
}

function createdTableName(statement: string): string | undefined {
  return statement.match(
    /\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:TEMPORARY\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?([a-zA-Z0-9_]+)`?/i,
  )?.[1];
}

export function createdTables(sql: string): string[] {
  return statements(sql).flatMap((statement) => {
    const table = createdTableName(statement);
    return table ? [table] : [];
  });
}

export async function executeTableStatements(
  connection: ProjectionConnection,
  sql: string,
  phases: BuildPhase[] = [],
  options: ExecuteTableStatementsOptions = {},
): Promise<void> {
  const { tableProgress } = options;
  let activeTable: string | undefined;
  let activeTableStartedAt: number | undefined;
  let stopActiveTableHeartbeat: (() => void) | undefined;

  function finishActiveTable() {
    if (!activeTable) return;
    stopActiveTableHeartbeat?.();
    stopActiveTableHeartbeat = undefined;
    if (activeTableStartedAt !== undefined)
      writeBuildLog(
        `Finished table ${activeTable} in ${elapsedMs(activeTableStartedAt)}ms.`,
      );
    activeTable = undefined;
    activeTableStartedAt = undefined;
  }

  try {
    for (const statement of statements(sql)) {
      const table = createdTableName(statement);
      if (table) {
        finishActiveTable();
        activeTable = table;
        activeTableStartedAt = performance.now();
        stopActiveTableHeartbeat = startBuildHeartbeat(
          `table ${table}`,
          activeTableStartedAt,
        );
        const progress = tableProgress ? `${tableProgress.start(table)} ` : "";
        writeBuildLog(`${progress}Starting table ${table}…`);
      }

      const phase = statement.match(/^\s*-- phase:\s*([^\n]+)/)?.[1]?.trim();
      const startedAt = performance.now();
      await connection.query(statement);
      if (phase) phases.push({ name: phase, durationMs: elapsedMs(startedAt) });
    }
    finishActiveTable();
  } catch (error) {
    stopActiveTableHeartbeat?.();
    stopActiveTableHeartbeat = undefined;
    if (activeTable && activeTableStartedAt !== undefined)
      writeBuildLog(
        `Failed table ${activeTable} after ${elapsedMs(activeTableStartedAt)}ms.`,
      );
    throw error;
  }
}
