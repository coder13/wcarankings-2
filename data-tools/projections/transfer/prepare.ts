import { dropManagedObject } from "../shared/database.ts";
import type {
  DeferredProjectionIndex,
  ExportDateRow,
  PrepareProjectionTransferInput,
  PrepareProjectionTransferResult,
  ShowIndexRow,
} from "./types.ts";

function transferMetadataTable(groupName: string): string {
  return `projection_transfer_manifest_${groupName.replaceAll("-", "_")}`;
}

function transferIndexesTable(groupName: string): string {
  return `projection_transfer_indexes_${groupName.replaceAll("-", "_")}`;
}

export function deferredProjectionIndexes(
  rows: ShowIndexRow[],
): DeferredProjectionIndex[] {
  const byName = new Map<string, ShowIndexRow[]>();
  for (const row of rows) {
    if (row.Key_name === "PRIMARY") continue;
    const indexRows = byName.get(row.Key_name) ?? [];
    indexRows.push(row);
    byName.set(row.Key_name, indexRows);
  }
  return [...byName.entries()].map(([name, indexRows]) => {
    const ordered = [...indexRows].sort(
      (left, right) => left.Seq_in_index - right.Seq_in_index,
    );
    const columns = ordered.map((row) => {
      const prefix = row.Sub_part ? `(${row.Sub_part})` : "";
      const direction = row.Collation === "D" ? " DESC" : "";
      return `\`${row.Column_name}\`${prefix}${direction}`;
    });
    const unique = Number(ordered[0]?.Non_unique) === 0 ? "UNIQUE " : "";
    return {
      name,
      sql: `ADD ${unique}INDEX \`${name}\` (${columns.join(", ")})`,
    };
  });
}

export async function prepareProjectionTransfer(
  input: PrepareProjectionTransferInput,
): Promise<PrepareProjectionTransferResult> {
  const { connection, group } = input;
  const manifestTable = transferMetadataTable(group.name);
  const indexesTable = transferIndexesTable(group.name);
  const [metadata] = await connection.query<ExportDateRow[]>(
    "SELECT value FROM export_metadata WHERE `key` = 'export_date' LIMIT 1",
  );
  const exportDate = metadata[0]?.value;
  if (!exportDate) {
    throw new Error("The projection source has no WCA export date");
  }

  await dropManagedObject(connection, manifestTable);
  await connection.query(`
    CREATE TABLE \`${manifestTable}\` (
      export_date VARCHAR(32) NOT NULL,
      created_at DATETIME(3) NOT NULL
    )
  `);
  await connection.query(
    `INSERT INTO \`${manifestTable}\` (export_date, created_at) VALUES (?, UTC_TIMESTAMP(3))`,
    [exportDate],
  );
  await dropManagedObject(connection, indexesTable);
  await connection.query(`
    CREATE TABLE \`${indexesTable}\` (
      table_name VARCHAR(128) NOT NULL,
      index_name VARCHAR(128) NOT NULL,
      index_sql TEXT NOT NULL,
      PRIMARY KEY (table_name, index_name)
    )
  `);

  const renames: string[] = [];
  for (const table of group.tables) {
    const transfer = `${table}_transfer`;
    await dropManagedObject(connection, transfer);
    renames.push(`\`${table}\` TO \`${transfer}\``);
  }
  await connection.query(`RENAME TABLE ${renames.join(", ")}`);

  let deferredIndexCount = 0;
  for (const table of group.tables) {
    const transfer = `${table}_transfer`;
    const [rows] = await connection.query<ShowIndexRow[]>(
      `SHOW INDEX FROM \`${transfer}\``,
    );
    const indexes = deferredProjectionIndexes(rows);
    for (const index of indexes) {
      await connection.query(
        `INSERT INTO \`${indexesTable}\`
          (table_name, index_name, index_sql)
         VALUES (?, ?, ?)`,
        [transfer, index.name, index.sql],
      );
    }
    deferredIndexCount += indexes.length;
    if (indexes.length > 0) {
      await connection.query(
        `ALTER TABLE \`${transfer}\` ${indexes
          .map((index) => `DROP INDEX \`${index.name}\``)
          .join(", ")}`,
      );
    }
  }

  return {
    group: group.name,
    exportDate,
    deferredIndexCount,
    tables: [
      ...group.tables.map((table) => `${table}_transfer`),
      manifestTable,
      indexesTable,
    ],
  };
}
