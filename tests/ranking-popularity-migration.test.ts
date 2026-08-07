import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the popularity migration creates the registry and daily totals tables", async () => {
  const migration = await readFile(
    new URL(
      "../migrations/mysql/app/V20__ranking_list_popularity.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    migration,
    /CREATE TABLE IF NOT EXISTS ranking_list_descriptors/,
  );
  assert.match(
    migration,
    /CREATE TABLE IF NOT EXISTS ranking_list_daily_popularity/,
  );
  assert.match(migration, /PRIMARY KEY \(ranking_list_key, popularity_date\)/);
  assert.match(migration, /REFERENCES lists \(public_id\) ON DELETE SET NULL/);
  assert.match(
    migration,
    /REFERENCES ranking_list_descriptors \(ranking_list_key\) ON DELETE CASCADE/,
  );
});
