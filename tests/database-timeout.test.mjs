import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dbSource = await readFile(new URL("../db/index.ts", import.meta.url), "utf8");
const composeSource = await readFile(new URL("../docker-compose.yml", import.meta.url), "utf8");
const envExample = await readFile(new URL("../.env.example", import.meta.url), "utf8");

test("all checked-out database connections receive a ten-second statement timeout", () => {
  assert.match(
    dbSource,
    /positiveNumber\(process\.env\.DATABASE_STATEMENT_TIMEOUT_MS, 10_000\) \/ 1000/,
  );
  assert.equal(dbSource.match(/await applyStatementTimeout\(connection\);/g)?.length, 2);
  assert.doesNotMatch(dbSource, /rankingStatementTimeout|RANKINGS_STATEMENT_TIMEOUT_MS/);
});

test("deployment configuration exposes the database-wide timeout", () => {
  assert.match(
    composeSource,
    /DATABASE_STATEMENT_TIMEOUT_MS: \$\{DATABASE_STATEMENT_TIMEOUT_MS:-10000\}/,
  );
  assert.match(envExample, /^DATABASE_STATEMENT_TIMEOUT_MS=10000$/m);
});
