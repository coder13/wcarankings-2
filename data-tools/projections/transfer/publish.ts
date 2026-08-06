import { normalizeExportDate } from "../../shared/date.ts";
import { publishProjectionTables } from "../build/publish.ts";
import { dropManagedObject, tableExists } from "../shared/database.ts";
import type {
  CountRow,
  DeferredIndexRow,
  ExportDateRow,
  PublishProjectionTransferInput,
  PublishProjectionTransferResult,
} from "./types.ts";

interface DeferredTableIndexes {
  indexes: DeferredIndexRow[];
  table: string;
}

interface DeferredIndexTiming {
  durationMs: number;
  indexCount: number;
  table: string;
}

async function runPool(
  items: readonly DeferredTableIndexes[],
  concurrency: number,
  task: (item: DeferredTableIndexes) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item) await task(item);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
}

function metadataTable(groupName: string): string {
  return `projection_transfer_manifest_${groupName.replaceAll("-", "_")}`;
}

function indexesTable(groupName: string): string {
  return `projection_transfer_indexes_${groupName.replaceAll("-", "_")}`;
}

export async function publishProjectionTransfer(
  input: PublishProjectionTransferInput,
): Promise<PublishProjectionTransferResult> {
  const {
    connection,
    createConnection,
    groups,
    expectedExportDate,
    indexConcurrency,
    mode,
  } = input;
  const log = input.log ?? (() => undefined);
  const transferTables = groups.flatMap((group) => group.tables);
  const manifestTables = groups.map((group) => metadataTable(group.name));
  const indexesTables = groups.map((group) => indexesTable(group.name));
  await connection.query("SET SESSION max_statement_time = 0");

  for (const table of manifestTables) {
    if (!(await tableExists(connection, table))) {
      throw new Error(`The projection transfer manifest ${table} is missing`);
    }
  }
  const transferDates: Array<string | undefined> = [];
  for (const table of manifestTables) {
    const [rows] = await connection.query<ExportDateRow[]>(
      `SELECT export_date FROM \`${table}\` LIMIT 1`,
    );
    transferDates.push(rows[0]?.export_date);
  }
  const transferDate = transferDates[0];
  const normalizedTransferDate = normalizeExportDate(transferDate);
  let expectedDate: string | null;
  if (mode === "prepare" || mode === "hydrate") {
    expectedDate = normalizeExportDate(expectedExportDate);
  } else {
    const [rows] = await connection.query<ExportDateRow[]>(
      "SELECT value AS export_date FROM export_metadata WHERE `key` = 'export_date' LIMIT 1",
    );
    expectedDate = normalizeExportDate(rows[0]?.export_date);
  }
  if (
    !normalizedTransferDate ||
    !expectedDate ||
    normalizedTransferDate !== expectedDate ||
    transferDates.some(
      (date) => normalizeExportDate(date) !== normalizedTransferDate,
    )
  ) {
    throw new Error(
      `Projection export date ${transferDate || "(missing)"} does not match expected export date ${expectedDate || "(missing)"}`,
    );
  }

  for (const table of transferTables) {
    const transfer = `${table}_transfer`;
    if (!(await tableExists(connection, transfer))) {
      throw new Error(`Transferred projection table ${transfer} is missing`);
    }
    const [rows] = await connection.query<CountRow[]>(
      `SELECT COUNT(*) AS count FROM \`${transfer}\``,
    );
    if (Number(rows[0]?.count ?? 0) === 0) {
      throw new Error(`Transferred projection table ${transfer} is empty`);
    }
  }

  const deferredIndexes: DeferredIndexRow[] = [];
  for (const table of indexesTables) {
    const [rows] = await connection.query<DeferredIndexRow[]>(
      `SELECT table_name, index_name, index_sql FROM \`${table}\` ORDER BY table_name, index_name`,
    );
    deferredIndexes.push(...rows);
  }
  log(
    `Building ${deferredIndexes.length} deferred projection indexes with concurrency ${indexConcurrency}`,
  );
  const indexBuildStartedAt = performance.now();
  const indexBuildTimings: DeferredIndexTiming[] = [];
  const indexesByTable = new Map<string, DeferredIndexRow[]>();
  for (const index of deferredIndexes) {
    const indexes = indexesByTable.get(index.table_name) ?? [];
    indexes.push(index);
    indexesByTable.set(index.table_name, indexes);
  }
  const tableIndexes = [...indexesByTable.entries()].map(
    ([table, indexes]) => ({ table, indexes }),
  );
  let builtIndexCount = 0;
  await runPool(tableIndexes, indexConcurrency, async (entry) => {
    const indexConnection = await createConnection();
    const startedAt = performance.now();
    try {
      await indexConnection.query("SET SESSION max_statement_time = 0");
      await indexConnection.query(
        `ALTER TABLE \`${entry.table}\` ${entry.indexes
          .map((index) => index.index_sql)
          .join(", ")}`,
      );
    } finally {
      await indexConnection.end();
    }
    const durationMs = Math.round(performance.now() - startedAt);
    indexBuildTimings.push({
      durationMs,
      indexCount: entry.indexes.length,
      table: entry.table,
    });
    builtIndexCount += entry.indexes.length;
    log(
      `Built ${entry.indexes.length} indexes on ${entry.table} in ${durationMs}ms (${builtIndexCount}/${deferredIndexes.length})`,
    );
  });
  const totalIndexBuildDurationMs = Math.round(
    performance.now() - indexBuildStartedAt,
  );
  const slowestTables = [...indexBuildTimings]
    .sort((left, right) => right.durationMs - left.durationMs)
    .slice(0, 5);
  log(
    `Deferred projection index summary: ${JSON.stringify({
      concurrency: indexConcurrency,
      indexCount: deferredIndexes.length,
      tableCount: indexBuildTimings.length,
      totalDurationMs: totalIndexBuildDurationMs,
      slowestTables,
    })}`,
  );

  if (mode === "hydrate") {
    const renames: string[] = [];
    for (const table of transferTables) {
      await dropManagedObject(connection, table);
      renames.push(`\`${table}_transfer\` TO \`${table}\``);
    }
    await connection.query(`RENAME TABLE ${renames.join(", ")}`);
    for (const table of [...indexesTables, ...manifestTables]) {
      await dropManagedObject(connection, table);
    }
  } else if (mode === "prepare") {
    for (const table of indexesTables) {
      await connection.query(`DELETE FROM \`${table}\``);
    }
  } else {
    const renames: string[] = [];
    for (const table of transferTables) {
      const staging = `${table}_staging`;
      await dropManagedObject(connection, staging);
      renames.push(`\`${table}_transfer\` TO \`${staging}\``);
    }
    await connection.query(`RENAME TABLE ${renames.join(", ")}`);
    await publishProjectionTables(connection, { tables: transferTables });
    for (const table of [...indexesTables, ...manifestTables]) {
      await dropManagedObject(connection, table);
    }
  }

  return {
    mode,
    groups: groups.map((group) => group.name),
    exportDate: normalizedTransferDate,
    builtIndexCount,
    tables: transferTables,
  };
}
