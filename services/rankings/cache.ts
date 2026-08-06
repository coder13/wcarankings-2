import { LRUCache } from "lru-cache";
import { isPermanentPage, rankingPageKey } from "@/services/rankings/helpers";
import type { CachePool, RankingsPageKey } from "@/services/rankings/types";

export const RANKINGS_CACHE_REFRESH_MS = 60_000;
export const RANKINGS_CACHE_CAPACITY_333 = 512;
export const RANKINGS_CACHE_CAPACITY_DEFAULT = 128;
export const RANKINGS_WINDOW_SIZE = 400;
const RANKINGS_WINDOW_CACHE_CAPACITY = 128;

type RankingsCachePoolSnapshot = {
  eventId: string;
  capacity: number;
  entries: number;
  pinnedEntries: number;
  estimatedBytes: number;
  hits: number;
  misses: number;
  coalesced: number;
  evictions: number;
  hitRate: number;
};

export type RankingsCacheSnapshot = {
  startedAt: string;
  generationClears: number;
  pools: RankingsCachePoolSnapshot[];
  totals: Omit<
    RankingsCachePoolSnapshot,
    "eventId" | "capacity" | "entries" | "pinnedEntries" | "estimatedBytes"
  > & {
    entries: number;
    pinnedEntries: number;
    estimatedBytes: number;
  };
};

/** Process-local LRU pools. First world pages are pinned so warm navigation stays fast. */
export class RankingsPageCache<T extends object> {
  private readonly pools = new Map<string, CachePool<T>>();
  private readonly pending = new Map<string, Promise<T>>();
  private readonly startedAt = new Date().toISOString();
  private generationClears = 0;

  private pool(eventId: string) {
    let pool = this.pools.get(eventId);
    if (!pool) {
      const capacity =
        eventId === "333"
          ? RANKINGS_CACHE_CAPACITY_333
          : RANKINGS_CACHE_CAPACITY_DEFAULT;
      const nextPool: CachePool<T> = {
        cache: new LRUCache<string, T>({
          max: capacity,
          dispose: (_value, _key, reason) => {
            if (reason === "evict") nextPool.evictions += 1;
          },
        }),
        pinnedKeys: new Set(),
        hits: 0,
        misses: 0,
        coalesced: 0,
        evictions: 0,
      };
      pool = nextPool;
      this.pools.set(eventId, pool);
    }
    return pool;
  }

  clear() {
    this.pools.clear();
    this.pending.clear();
    this.generationClears += 1;
  }

  entryCount(eventId: string) {
    return this.pools.get(eventId)?.cache.size ?? 0;
  }

  has(key: RankingsPageKey) {
    return this.pools.get(key.eventId)?.cache.has(rankingPageKey(key)) ?? false;
  }

  async get(key: RankingsPageKey, load: () => Promise<T>) {
    return (await this.getWithStatus(key, load)).value;
  }

  async getWithStatus(key: RankingsPageKey, load: () => Promise<T>) {
    const normalized = {
      ...key,
      startRank: Math.max(1, Math.floor(key.startRank)),
    };
    const cacheKey = `${normalized.eventId}:${rankingPageKey(normalized)}`;
    const pool = this.pool(normalized.eventId);
    const cached = pool.cache.get(rankingPageKey(normalized));
    if (cached !== undefined) {
      pool.hits += 1;
      return { value: cached, outcome: "hit" as const };
    }
    const inFlight = this.pending.get(cacheKey);
    if (inFlight) {
      pool.coalesced += 1;
      return { value: await inFlight, outcome: "coalesced" as const };
    }

    pool.misses += 1;

    const request = load().then((value) => {
      this.put(normalized, value);
      return value;
    });
    this.pending.set(cacheKey, request);
    try {
      return { value: await request, outcome: "miss" as const };
    } finally {
      this.pending.delete(cacheKey);
    }
  }

  private put(key: RankingsPageKey, value: T) {
    const pool = this.pool(key.eventId);
    const pageKey = rankingPageKey(key);
    if (isPermanentPage(key)) {
      pool.pinnedKeys.add(pageKey);
    } else {
      // Refresh pinned first-world pages before insertion so the LRU package
      // evicts an ordinary page first while preserving the fixed capacity.
      for (const pinnedKey of pool.pinnedKeys) pool.cache.get(pinnedKey);
    }
    pool.cache.set(pageKey, value);
  }

  snapshot(): RankingsCacheSnapshot {
    const pools = [...this.pools.entries()].map(([eventId, pool]) => {
      const hits = pool.hits;
      const misses = pool.misses;
      const requests = hits + misses + pool.coalesced;
      const estimatedBytes = [...pool.cache.values()].reduce((total, value) => {
        try {
          return total + Buffer.byteLength(JSON.stringify(value));
        } catch {
          return total;
        }
      }, 0);
      return {
        eventId,
        capacity: pool.cache.max,
        entries: pool.cache.size,
        pinnedEntries: pool.pinnedKeys.size,
        estimatedBytes,
        hits,
        misses,
        coalesced: pool.coalesced,
        evictions: pool.evictions,
        hitRate: requests === 0 ? 0 : hits / requests,
      };
    });
    const totals = pools.reduce(
      (total, pool) => ({
        entries: total.entries + pool.entries,
        pinnedEntries: total.pinnedEntries + pool.pinnedEntries,
        estimatedBytes: total.estimatedBytes + pool.estimatedBytes,
        hits: total.hits + pool.hits,
        misses: total.misses + pool.misses,
        coalesced: total.coalesced + pool.coalesced,
        evictions: total.evictions + pool.evictions,
        hitRate: 0,
      }),
      {
        entries: 0,
        pinnedEntries: 0,
        estimatedBytes: 0,
        hits: 0,
        misses: 0,
        coalesced: 0,
        evictions: 0,
        hitRate: 0,
      },
    );
    const requests = totals.hits + totals.misses + totals.coalesced;
    totals.hitRate = requests === 0 ? 0 : totals.hits / requests;
    return {
      startedAt: this.startedAt,
      generationClears: this.generationClears,
      pools,
      totals,
    };
  }
}

export const rankingsPageCache = new RankingsPageCache<
  Record<string, unknown>
>();

/** Shared process-local windows used to serve adjacent 50-row pages from one 400-row query. */
export class RankingsWindowCache<T extends object> {
  private readonly cache = new LRUCache<string, T>({
    max: RANKINGS_WINDOW_CACHE_CAPACITY,
  });
  private readonly pinned = new Map<string, T>();
  private readonly pending = new Map<string, Promise<T>>();

  clear() {
    this.cache.clear();
    this.pinned.clear();
    this.pending.clear();
  }

  has(key: string) {
    return this.pinned.has(key) || this.cache.has(key);
  }

  async getWithStatus(
    key: string,
    load: () => Promise<T>,
    { pin = false } = {},
  ) {
    const cached = this.pinned.get(key) ?? this.cache.get(key);
    if (cached !== undefined) return { value: cached, outcome: "hit" as const };
    const inFlight = this.pending.get(key);
    if (inFlight)
      return { value: await inFlight, outcome: "coalesced" as const };
    const request = load().then((value) => {
      if (pin) this.pinned.set(key, value);
      else this.cache.set(key, value);
      return value;
    });
    this.pending.set(key, request);
    try {
      return { value: await request, outcome: "miss" as const };
    } finally {
      this.pending.delete(key);
    }
  }
}

export const rankingsWindowCache = new RankingsWindowCache<
  Record<string, unknown>
>();
