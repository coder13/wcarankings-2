import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "bun:test";
import mysql from "mysql2/promise";
import { ensureWcaPersonLookupIndex } from "../data-tools/projections/shared/database.ts";

const adminDatabaseUrl = process.env.INTEGRATION_ADMIN_DATABASE_URL;
const integrationTest = adminDatabaseUrl ? test : test.skip;

function databaseOptions(connectionString, database) {
  const url = new URL(connectionString);
  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
  };
}

integrationTest(
  "person lookup index survives the empty-candidate then raw-import lifecycle",
  async () => {
    const schema = `person_lookup_index_${process.pid}`;
    const admin = await mysql.createConnection(
      databaseOptions(adminDatabaseUrl, "mysql"),
    );
    try {
      await admin.query(`CREATE DATABASE \`${schema}\``);
      const candidate = await mysql.createConnection(
        databaseOptions(adminDatabaseUrl, schema),
      );
      try {
        const migration = await readFile(
          new URL(
            "../migrations/mysql/app/V13__person_ranking_lookup.sql",
            import.meta.url,
          ),
          "utf8",
        );
        await candidate.query(migration);
        await candidate.query(`CREATE TABLE persons (
        wca_id VARCHAR(10) NOT NULL,
        sub_id TINYINT NOT NULL,
        name VARCHAR(255) NOT NULL
      )`);
        await ensureWcaPersonLookupIndex(candidate);
        await ensureWcaPersonLookupIndex(candidate);

        const [indexes] = await candidate.query(
          `SELECT index_name, GROUP_CONCAT(column_name ORDER BY seq_in_index) AS columns_csv
           FROM information_schema.statistics
          WHERE table_schema = DATABASE()
            AND table_name = 'persons'
            AND index_name = 'idx_persons_wca_sub'
          GROUP BY index_name`,
        );
        assert.deepEqual(indexes, [
          {
            index_name: "idx_persons_wca_sub",
            columns_csv: "wca_id,sub_id",
          },
        ]);
      } finally {
        await candidate.end();
      }
    } finally {
      await admin.query(`DROP DATABASE IF EXISTS \`${schema}\``);
      await admin.end();
    }
  },
);
