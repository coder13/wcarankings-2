// @ts-nocheck
import mysql from "mysql2/promise";
import {
  DEPLOYMENT_PROJECTION_GROUPS,
  dropManagedObject,
} from "../data-tools/projections/build.ts";

const groupName = process.argv
  .find((value) => value.startsWith("--group="))
  ?.slice("--group=".length);
const group = DEPLOYMENT_PROJECTION_GROUPS.find(
  ({ name }) => name === groupName,
);
if (!group)
  throw new Error(
    `Unknown deployment projection group: ${groupName || "(missing)"}.`,
  );
const manifestTable = `projection_transfer_manifest_${group.name.replaceAll("-", "_")}`;
const indexesTable = `projection_transfer_indexes_${group.name.replaceAll("-", "_")}`;

function databaseOptions(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const url = new URL(connectionString);
  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
  };
}

const connection = await mysql.createConnection(databaseOptions());
try {
  const [metadata] = await connection.query(
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
    const [indexRows] = await connection.query(
      `SHOW INDEX FROM \`${transfer}\``,
    );
    const indexes = new Map();
    for (const row of indexRows) {
      if (row.Key_name === "PRIMARY") continue;
      const index = indexes.get(row.Key_name) ?? {
        name: row.Key_name,
        unique: Number(row.Non_unique) === 0,
        columns: [],
      };
      const prefix = row.Sub_part ? `(${Number(row.Sub_part)})` : "";
      const direction = row.Collation === "D" ? " DESC" : "";
      index.columns.push({
        sequence: Number(row.Seq_in_index),
        sql: `\`${row.Column_name}\`${prefix}${direction}`,
      });
      indexes.set(row.Key_name, index);
    }

    for (const index of indexes.values()) {
      index.columns.sort((left, right) => left.sequence - right.sequence);
      const indexSql = `ADD ${index.unique ? "UNIQUE " : ""}INDEX \`${index.name}\` (${index.columns.map(({ sql }) => sql).join(", ")})`;
      await connection.query(
        `INSERT INTO \`${indexesTable}\`
          (table_name, index_name, index_sql)
         VALUES (?, ?, ?)`,
        [transfer, index.name, indexSql],
      );
      deferredIndexCount += 1;
    }
    if (indexes.size > 0) {
      await connection.query(
        `ALTER TABLE \`${transfer}\` ${[...indexes.values()].map(({ name }) => `DROP INDEX \`${name}\``).join(", ")}`,
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
