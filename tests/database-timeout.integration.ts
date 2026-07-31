import assert from "node:assert/strict";
import { getPool, query, withTransaction } from "../db/index.ts";

const table = "database_timeout_integration_probe";

function isStatementTimeout(error: unknown) {
  return Number((error as { errno?: unknown }).errno) === 1969;
}

try {
  await query(`DROP TABLE IF EXISTS ${table}`);
  await query(`CREATE TABLE ${table} (id INT NOT NULL PRIMARY KEY)`);

  await assert.rejects(
    query("SELECT SLEEP(1) AS slept"),
    isStatementTimeout,
  );
  const healthy = await query<{ value: number }>("SELECT 1 AS value");
  assert.equal(Number(healthy.rows[0]?.value), 1);

  await assert.rejects(
    withTransaction(async (connection) => {
      await connection.query(`INSERT INTO ${table} (id) VALUES (1)`);
      await connection.query("SELECT SLEEP(1)");
    }),
    isStatementTimeout,
  );
  const rolledBack = await query<{ total: number }>(`SELECT COUNT(*) AS total FROM ${table}`);
  assert.equal(Number(rolledBack.rows[0]?.total), 0);
} finally {
  await query(`DROP TABLE IF EXISTS ${table}`).catch(() => undefined);
  await getPool().end();
}
