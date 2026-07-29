import type { RankingPage } from "./types";

type ClientPageCacheEntry = { request: Promise<RankingPage>; permanent: boolean };

export class RankingsPageCache {
  private readonly pools = new Map<string, Map<string, ClientPageCacheEntry>>();

  private pool(eventId: string) {
    let pool = this.pools.get(eventId);
    if (!pool) {
      pool = new Map();
      this.pools.set(eventId, pool);
    }
    return pool;
  }

  get(eventId: string, key: string) {
    const pool = this.pool(eventId);
    const entry = pool.get(key);
    if (!entry) return undefined;
    if (!entry.permanent) {
      pool.delete(key);
      pool.set(key, entry);
    }
    return entry.request;
  }

  set(eventId: string, key: string, request: Promise<RankingPage>, permanent: boolean) {
    const pool = this.pool(eventId);
    pool.set(key, { request, permanent });
    const capacity = eventId === "333" ? 512 : 128;
    while (pool.size > capacity) {
      const oldest = [...pool.entries()].find(([, entry]) => !entry.permanent);
      if (!oldest) break;
      pool.delete(oldest[0]);
    }
  }

  delete(eventId: string, key: string) {
    this.pool(eventId).delete(key);
  }
}

export async function fetchRankingPage(input: RequestInfo | URL) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await fetch(input);
    } catch (error) {
      lastError = error;
      if (attempt === 0) await new Promise((resolve) => window.setTimeout(resolve, 150));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Rankings are unavailable.");
}
