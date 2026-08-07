import assert from "node:assert/strict";
import test from "node:test";
import {
  RANKINGS_CACHE_CAPACITY_333,
  RANKINGS_CACHE_CAPACITY_DEFAULT,
  RankingsPageCache,
  RankingsWindowCache,
} from "@/services/rankings/cache";

const page = (
  eventId: string,
  startRank: number,
  scope: "world" | "country" = "world",
) => ({
  eventId,
  type: "single" as const,
  scope,
  regionId: scope === "country" ? "USA" : "",
  startRank,
});

test("keeps first world pages while evicting old normal pages at each event limit", async () => {
  const cache = new RankingsPageCache<{ value: number }>();
  let value = 0;
  await cache.get(page("333", 1), async () => ({ value: ++value }));
  for (let start = 2; start <= RANKINGS_CACHE_CAPACITY_333 + 20; start += 1) {
    await cache.get(page("333", start), async () => ({ value: ++value }));
  }
  assert.equal(cache.entryCount("333"), RANKINGS_CACHE_CAPACITY_333);
  assert.equal(cache.has(page("333", 1)), true);
  assert.equal(cache.has(page("333", 2)), false);

  await cache.get(page("222", 1), async () => ({ value: ++value }));
  for (
    let start = 2;
    start <= RANKINGS_CACHE_CAPACITY_DEFAULT + 20;
    start += 1
  ) {
    await cache.get(page("222", start), async () => ({ value: ++value }));
  }
  assert.equal(cache.entryCount("222"), RANKINGS_CACHE_CAPACITY_DEFAULT);
  assert.equal(cache.has(page("222", 1)), true);
  assert.equal(cache.has(page("222", 2)), false);
});

test("coalesces concurrent cache misses and does not retain failures", async () => {
  const cache = new RankingsPageCache<number[]>();
  let loads = 0;
  const key = page("333", 51, "country");
  const load = async () => {
    loads += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return [7];
  };
  const values = await Promise.all(
    Array.from({ length: 100 }, () => cache.get(key, load)),
  );
  assert.deepEqual(
    values,
    Array.from({ length: 100 }, () => [7]),
  );
  assert.equal(loads, 1);

  await assert.rejects(
    cache.get(page("333", 101), async () => {
      throw new Error("nope");
    }),
  );
  assert.equal(cache.has(page("333", 101)), false);
});

test("reports cache pressure and generation reset metrics", async () => {
  const cache = new RankingsPageCache<{ value: number }>();
  await cache.get(page("333", 1), async () => ({ value: 1 }));
  await cache.get(page("333", 1), async () => ({ value: 2 }));
  await cache.get(page("333", 2), async () => ({ value: 3 }));

  const snapshot = cache.snapshot();
  const pool = snapshot.pools.find((entry) => entry.eventId === "333");
  assert.ok(pool);
  assert.equal(pool.hits, 1);
  assert.equal(pool.misses, 2);
  assert.equal(pool.pinnedEntries, 1);
  assert.equal(pool.entries, 2);
  assert.equal(snapshot.totals.estimatedBytes > 0, true);

  cache.clear();
  assert.equal(cache.snapshot().generationClears, 1);
  assert.equal(cache.snapshot().totals.entries, 0);
});

test("keeps explicitly primed ranking windows until the generation changes", async () => {
  const cache = new RankingsWindowCache<{ value: number }>();
  await cache.getWithStatus("SOR:world:1", async () => ({ value: 1 }), {
    pin: true,
  });
  for (let index = 0; index < 150; index += 1) {
    await cache.getWithStatus(`lazy:${index}`, async () => ({ value: index }));
  }

  assert.equal(cache.has("SOR:world:1"), true);
  const hit = await cache.getWithStatus("SOR:world:1", async () => ({
    value: 2,
  }));
  assert.equal(hit.outcome, "hit");
  assert.equal(hit.value.value, 1);

  cache.clear();
  assert.equal(cache.has("SOR:world:1"), false);
});

test("coalesces lazy ranking windows and permits retry after failure", async () => {
  const cache = new RankingsWindowCache<{ value: number }>();
  let loads = 0;
  const load = async () => {
    loads += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { value: 7 };
  };
  const results = await Promise.all(
    Array.from({ length: 20 }, () => cache.getWithStatus("gender:333:f", load)),
  );
  assert.equal(loads, 1);
  assert.equal(
    results.filter(({ outcome }) => outcome === "coalesced").length,
    19,
  );

  await assert.rejects(
    cache.getWithStatus("year:333:2025", async () => {
      throw new Error("nope");
    }),
  );
  const retry = await cache.getWithStatus("year:333:2025", async () => ({
    value: 8,
  }));
  assert.equal(retry.outcome, "miss");
  assert.equal(retry.value.value, 8);
});
