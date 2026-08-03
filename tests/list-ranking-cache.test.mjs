import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cache = await import("../lib/list-ranking-cache.ts");

test("list cache filter keys use the WCA gender-set order", () => {
  assert.equal(
    cache.listRankingFilterKey({ scope: "world", regionId: "", genders: ["f", "m"] }),
    "world||m,f",
  );
});

test("cache support is limited to projections with matching ranks", () => {
  assert.equal(cache.isListRankingCacheable("person", "single", {
    scope: "world", regionId: "", genders: [],
  }), true);
  assert.equal(cache.isListRankingCacheable("person", "single", {
    scope: "world", regionId: "", genders: ["m"],
  }), false);
  assert.equal(cache.isListRankingCacheable("result", "single", {
    scope: "country", regionId: "USA", genders: ["m"],
  }), false);
  assert.equal(cache.isListRankingCacheable("result", "average", {
    scope: "country", regionId: "USA", genders: ["m", "f"],
  }), true);
});

test("person and result caches remain separate in the worker and migration", async () => {
  const worker = await readFile(new URL("../scripts/list-ranking-worker.mjs", import.meta.url), "utf8");
  const migration = await readFile(new URL("../migrations/mysql/app/V16__grain_aware_list_ranking_cache.sql", import.meta.url), "utf8");
  assert.match(worker, /list_person_ranking_cache_scopes/);
  assert.match(worker, /list_result_ranking_cache_entries/);
  assert.match(worker, /const values = \[cacheVersionId, \.\.\.spec\.values/);
  assert.match(migration, /CREATE TABLE list_result_ranking_cache_scopes/);
  assert.match(migration, /RENAME TABLE[\s\S]*list_person_ranking_cache_entries/);
});
