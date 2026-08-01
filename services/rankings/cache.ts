import { LRUCache } from "lru-cache";
import { isPermanentPage, rankingPageKey } from "@/services/rankings/helpers";
import type { CachePool, RankingsPageKey } from "@/services/rankings/types";

export const RANKINGS_CACHE_REFRESH_MS = 60_000;
export const RANKINGS_CACHE_CAPACITY_333 = 512;
export const RANKINGS_CACHE_CAPACITY_DEFAULT = 128;

/** Process-local LRU pools. First world pages are pinned so warm navigation stays fast. */
export class RankingsPageCache<T extends object> {
  private readonly pools = new Map<string, CachePool<T>>();
  private readonly pending = new Map<string, Promise<T>>();

  private pool(eventId: string) {
    let pool = this.pools.get(eventId);
    if (!pool) {
      const capacity =
        eventId === "333" ? RANKINGS_CACHE_CAPACITY_333 : RANKINGS_CACHE_CAPACITY_DEFAULT;
      pool = { cache: new LRUCache<string, T>({ max: capacity }), pinnedKeys: new Set() };
      this.pools.set(eventId, pool);
    }
    return pool;
  }

  clear() {
    this.pools.clear();
    this.pending.clear();
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
    const normalized = { ...key, startRank: Math.max(1, Math.floor(key.startRank)) };
    const cacheKey = `${normalized.eventId}:${rankingPageKey(normalized)}`;
    const pool = this.pool(normalized.eventId);
    const cached = pool.cache.get(rankingPageKey(normalized));
    if (cached !== undefined) {
      return { value: cached, outcome: "hit" as const };
    }
    const inFlight = this.pending.get(cacheKey);
    if (inFlight) return { value: await inFlight, outcome: "coalesced" as const };

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
}

export const rankingsPageCache = new RankingsPageCache<Record<string, unknown>>();

export function normalPageKey(input: RankingsPageKey) {
  return { ...input, startRank: Math.max(1, Math.floor(input.startRank)) };
}
