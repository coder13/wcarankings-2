import type { PopularityIncrement } from "./types";

type PendingPopularityIncrement = PopularityIncrement;

function entryKey(increment: Omit<PopularityIncrement, "count">) {
  return `${increment.rankingListKey}\u0000${increment.popularityDate}`;
}

function validUtcDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return (
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value
  );
}

/** A bounded, process-local buffer for combined daily popularity increments. */
export class RankingPopularityBuffer {
  private pending = new Map<string, PendingPopularityIncrement>();
  private flushing: Promise<number> | undefined;

  constructor(private readonly maxEntries = 1_000) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1) {
      throw new Error(
        "The popularity buffer capacity must be a positive integer.",
      );
    }
  }

  record(rankingListKey: string, popularityDate: string) {
    if (!rankingListKey || !validUtcDate(popularityDate)) {
      throw new Error("The popularity buffer requires a key and a UTC date.");
    }
    const key = entryKey({ rankingListKey, popularityDate });
    const existing = this.pending.get(key);
    if (existing) {
      existing.count += 1;
      return true;
    }
    if (this.pending.size >= this.maxEntries) return false;
    this.pending.set(key, { rankingListKey, popularityDate, count: 1 });
    return true;
  }

  entries() {
    return [...this.pending.values()]
      .map((entry) => ({ ...entry }))
      .sort((left, right) => entryKey(left).localeCompare(entryKey(right)));
  }

  viewCount() {
    return [...this.pending.values()].reduce(
      (total, increment) => total + increment.count,
      0,
    );
  }

  async flush(
    write: (increments: readonly PopularityIncrement[]) => Promise<void>,
  ) {
    if (this.flushing) return this.flushing;
    const flush = this.flushPending(write);
    this.flushing = flush;
    try {
      return await flush;
    } finally {
      if (this.flushing === flush) this.flushing = undefined;
    }
  }

  private async flushPending(
    write: (increments: readonly PopularityIncrement[]) => Promise<void>,
  ) {
    const flushing = this.pending;
    this.pending = new Map();
    const increments = [...flushing.values()];
    if (increments.length === 0) return 0;

    try {
      await write(increments);
      return increments.reduce(
        (total, increment) => total + increment.count,
        0,
      );
    } catch (error) {
      this.restore(increments);
      throw error;
    }
  }

  private restore(increments: readonly PopularityIncrement[]) {
    for (const increment of increments) {
      const key = entryKey(increment);
      const existing = this.pending.get(key);
      if (existing) existing.count += increment.count;
      else this.pending.set(key, { ...increment });
    }
  }
}
