import { argumentValue } from "../../lib/arguments.ts";
import { databaseOptions } from "../../lib/database.ts";
import mysql from "mysql2/promise";
import type { RowDataPacket } from "mysql2/promise";
import {
  DEPLOYMENT_PROJECTION_GROUPS,
  dropManagedObject,
} from "../../../data-tools/projections/build.ts";

interface DeferredProjectionIndex {
  name: string;
  sql: string;
}

interface ExportDateRow extends RowDataPacket {
  value: string;
}

interface ProjectionIndexRow extends RowDataPacket {
  Collation: "A" | "D" | null;
  Column_name: string;
  Key_name: string;
  Non_unique: number;
  Seq_in_index: number;
  Sub_part: number | null;
}

function deferredProjectionIndexes(
  rows: ProjectionIndexRow[],
): DeferredProjectionIndex[] {
  const rowsByName = new Map<string, ProjectionIndexRow[]>();
  for (const row of rows) {
    if (row.Key_name === "PRIMARY") continue;
    const indexRows = rowsByName.get(row.Key_name) ?? [];
    indexRows.push(row);
    rowsByName.set(row.Key_name, indexRows);
  }
  return [...rowsByName.entries()].map(([name, indexRows]) => {
    const orderedRows = [...indexRows].sort(
      (left, right) => left.Seq_in_index - right.Seq_in_index,
    );
    const columns = orderedRows.map((row) => {
      const prefix = row.Sub_part ? `(${row.Sub_part})` : "";
      const direction = row.Collation === "D" ? " DESC" : "";
      return `\`${row.Column_name}\`${prefix}${direction}`;
    });
    const unique = Number(orderedRows[0]?.Non_unique) === 0 ? "UNIQUE " : "";
    return {
      name,
      sql: `ADD ${unique}INDEX \`${name}\` (${columns.join(", ")})`,
    };
  });
}

const groupName = argumentValue("group");
const group = DEPLOYMENT_PROJECTION_GROUPS.find(
  ({ name }) => name === groupName,
);
if (!group)
  throw new Error(
    `Unknown deployment projection group: ${groupName || "(missing)"}.`,
  );
const manifestTable = `projection_transfer_manifest_${group.name.replaceAll("-", "_")}`;
const indexesTable = `projection_transfer_indexes_${group.name.replaceAll("-", "_")}`;

const connection = await mysql.createConnection(databaseOptions());
try {
  const [metadata] = await connection.query<ExportDateRow[]>(
    "SELECT value FROM export_metadata WHERE `key` = 'export_date' LIMIT 1",
  );
  const exportDate = metadata[0]?.value;
  if (!exportDate)
    throw new Error("The projection source has no WCA export date.");

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

  const renames = [];
  for (const table of group.tables) {
    const transfer = `${table}_transfer`;
    await dropManagedObject(connection, transfer);
    renames.push(`\`${table}\` TO \`${transfer}\``);
  }
  await connection.query(`RENAME TABLE ${renames.join(", ")}`);

  let deferredIndexCount = 0;
  for (const table of group.tables) {
    const transfer = `${table}_transfer`;
    const [indexRows] = await connection.query<ProjectionIndexRow[]>(
      `SHOW INDEX FROM \`${transfer}\``,
    );
    const indexes = deferredProjectionIndexes(indexRows);
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

  process.stdout.write(
    `${JSON.stringify({
      group: group.name,
      exportDate,
      deferredIndexCount,
      tables: [
        ...group.tables.map((table) => `${table}_transfer`),
        manifestTable,
        indexesTable,
      ],
    })}\n`,
  );
} finally {
  await connection.end();
}
