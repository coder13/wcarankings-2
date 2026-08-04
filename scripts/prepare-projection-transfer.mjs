import mysql from "mysql2/promise";
import { DEPLOYMENT_PROJECTION_GROUPS, dropManagedObject } from "./mysql-schema.mjs";
import { argumentValue } from "./lib/cli.mjs";
import { databaseOptions } from "./lib/database.mjs";
import { projectionIndexesForGroup } from "./lib/projection-indexes.mjs";

const groupName = argumentValue("group");
const group = DEPLOYMENT_PROJECTION_GROUPS.find(({ name }) => name === groupName);
if (!group) throw new Error(`Unknown deployment projection group: ${groupName || "(missing)"}.`);
const manifestTable = `projection_transfer_manifest_${group.name.replaceAll("-", "_")}`;
const indexesTable = `projection_transfer_indexes_${group.name.replaceAll("-", "_")}`;

const connection = await mysql.createConnection(databaseOptions());
try {
  const desiredIndexes = await projectionIndexesForGroup(group);
  const [metadata] = await connection.query(
    "SELECT value FROM export_metadata WHERE `key` = 'export_date' LIMIT 1",
  );
  const exportDate = metadata[0]?.value;
  if (!exportDate) throw new Error("The projection source has no WCA export date.");

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
    const [indexRows] = await connection.query(`SHOW INDEX FROM \`${transfer}\``);
    const existingIndexes = new Map();
    for (const row of indexRows) {
      if (row.Key_name === "PRIMARY") continue;
      const index = existingIndexes.get(row.Key_name) ?? {
        name: row.Key_name,
      };
      existingIndexes.set(row.Key_name, index);
    }

    const tableIndexes = desiredIndexes.filter((index) => index.table === table);
    const desiredNames = new Set(tableIndexes.map(({ name }) => name));
    const unexpected = [...existingIndexes.keys()].filter((name) => !desiredNames.has(name));
    if (unexpected.length > 0) {
      throw new Error(`Undeclared projection indexes on ${table}: ${unexpected.join(", ")}`);
    }
    if (existingIndexes.size > 0) {
      const missing = tableIndexes.filter(({ name }) => !existingIndexes.has(name));
      if (missing.length > 0) {
        throw new Error(`Partially built projection indexes on ${table}: ${missing.map(({ name }) => name).join(", ")}`);
      }
    }

    for (const index of tableIndexes) {
      await connection.query(
        `INSERT INTO \`${indexesTable}\`
          (table_name, index_name, index_sql)
         VALUES (?, ?, ?)`,
        [transfer, index.name, index.sql],
      );
      deferredIndexCount += 1;
    }
    if (existingIndexes.size > 0) {
      await connection.query(
        `ALTER TABLE \`${transfer}\` ${[...existingIndexes.keys()].map((name) => `DROP INDEX \`${name}\``).join(", ")}`,
      );
    }
  }

  process.stdout.write(`${JSON.stringify({
    group: group.name,
    exportDate,
    deferredIndexCount,
    tables: [
      ...group.tables.map((table) => `${table}_transfer`),
      manifestTable,
      indexesTable,
    ],
  })}\n`);
} finally {
  await connection.end();
}
