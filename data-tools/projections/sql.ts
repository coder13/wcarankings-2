// @ts-nocheck
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { elapsedMs, writeBuildLog } from "./progress.ts";

const projectionDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "projection-catalog",
);

export function statements(sql) {
  return sql
    .split(/;\s*(?:\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

export async function projectionSql(file) {
  return readFile(join(projectionDirectory, file), "utf8");
}

function createdTableName(statement) {
  return statement.match(
    /\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:TEMPORARY\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?([a-zA-Z0-9_]+)`?/i,
  )?.[1];
}

export function createdTables(sql) {
  return statements(sql).flatMap((statement) => {
    const table = createdTableName(statement);
    return table ? [table] : [];
  });
}

export async function executeTableStatements(
  connection,
  sql,
  phases = [],
  { tableProgress } = {},
) {
  let activeTable;
  let activeTableStartedAt;

  function finishActiveTable() {
    if (!activeTable) return;
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
    if (activeTable)
      writeBuildLog(
        `Failed table ${activeTable} after ${elapsedMs(activeTableStartedAt)}ms.`,
      );
    throw error;
  }
}
