import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const [dbSource, composeSource, envExample] = await Promise.all([
  readFile(new URL("db/index.ts", root), "utf8"),
  readFile(new URL("docker-compose.yml", root), "utf8"),
  readFile(new URL(".env.example", root), "utf8"),
]);

test("all checked-out database connections receive a ten-second statement timeout", () => {
  assert.match(
    dbSource,
    /positiveNumber\(process\.env\.DATABASE_STATEMENT_TIMEOUT_MS, 10_000\) \/ 1000/,
  );
  assert.equal(dbSource.match(/await applyStatementTimeout\(connection\);/g)?.length, 2);
  assert.match(dbSource, /catch \{\s+connection\.destroy\(\);\s+connection = undefined;/);
  assert.doesNotMatch(dbSource, /rankingStatementTimeout|RANKINGS_STATEMENT_TIMEOUT_MS/);
});

test("deployment configuration exposes the database-wide timeout", () => {
  assert.match(
    composeSource,
    /DATABASE_STATEMENT_TIMEOUT_MS: \$\{DATABASE_STATEMENT_TIMEOUT_MS:-10000\}/,
  );
  assert.match(envExample, /^DATABASE_STATEMENT_TIMEOUT_MS=10000$/m);
});
