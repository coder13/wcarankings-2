import { query } from "@/db";
import {
  canonicalRankingListDescriptorJson,
  normalizeRankingListDescriptor,
  rankingListKey,
} from "@/lib/ranking-list-descriptor";
import { RankingPopularityBuffer } from "./buffer";
import {
  rankingPopularityTotalsQuery,
  upsertDailyPopularityQuery,
  upsertRankingListDescriptorQuery,
} from "./queries";
import type {
  PopularityIncrement,
  PopularityQuery,
  RegisterRankingPopularityOptions,
  RankingPopularityScore,
  RankingPopularityTotals,
  RegisteredRankingPopularityDescriptor,
} from "./types";

type PopularityTotalsRow = {
  seven_day_views: number | string;
  thirty_day_views: number | string;
};

type RankingPopularityServiceOptions = {
  buffer?: RankingPopularityBuffer;
  flushEntryThreshold?: number;
  now?: () => Date;
  query?: PopularityQuery;
};

const DEFAULT_RANKING_POPULARITY_FLUSH_ENTRY_THRESHOLD = 100;

function positiveInteger(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : fallback;
}

function configuredFlushEntryThreshold() {
  return positiveInteger(
    Number(process.env.RANKING_POPULARITY_FLUSH_ENTRY_THRESHOLD),
    DEFAULT_RANKING_POPULARITY_FLUSH_ENTRY_THRESHOLD,
  );
}

function utcDate(value: Date) {
  if (!Number.isFinite(value.getTime())) {
    throw new Error("The popularity service requires a valid time.");
  }
  return value.toISOString().slice(0, 10);
}

function utcDateDaysBefore(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

function viewCount(value: number | string | undefined) {
  const count = Number(value ?? 0);
  if (!Number.isFinite(count) || count < 0) {
    throw new Error("The popularity query returned an invalid view count.");
  }
  return count;
}

function publicListId(
  descriptor: RegisteredRankingPopularityDescriptor["descriptor"],
) {
  if (
    (descriptor.family === "person-event" ||
      descriptor.family === "person-result") &&
    descriptor.population.kind === "public-list"
  ) {
    return descriptor.population.publicId;
  }
  return null;
}

function verifyPublicList(
  publicId: string | null,
  options: RegisterRankingPopularityOptions,
) {
  if (!publicId) return;
  if (options.verifiedPublicList?.publicId !== publicId) {
    throw new Error(
      "A public-list descriptor requires a verified public-list identity.",
    );
  }
}

export class RankingPopularityService {
  private readonly buffer: RankingPopularityBuffer;
  private readonly flushEntryThreshold: number;
  private readonly now: () => Date;
  private readonly database: PopularityQuery;

  constructor(options: RankingPopularityServiceOptions = {}) {
    this.buffer = options.buffer ?? new RankingPopularityBuffer();
    this.flushEntryThreshold = positiveInteger(
      options.flushEntryThreshold,
      configuredFlushEntryThreshold(),
    );
    this.now = options.now ?? (() => new Date());
    this.database = options.query ?? query;
  }

  async register(
    input: unknown,
    options: RegisterRankingPopularityOptions = {},
  ): Promise<RegisteredRankingPopularityDescriptor> {
    const descriptor = normalizeRankingListDescriptor(input);
    const customListPublicId = publicListId(descriptor);
    verifyPublicList(customListPublicId, options);

    const registered = {
      canonicalDescriptorJson: canonicalRankingListDescriptorJson(descriptor),
      descriptor,
      rankingListKey: rankingListKey(descriptor),
      customListPublicId,
    };
    await this.database(upsertRankingListDescriptorQuery(), [
      registered.rankingListKey,
      descriptor.family,
      registered.canonicalDescriptorJson,
      registered.customListPublicId,
    ]);
    return registered;
  }

  recordSuccessfulFirstPageView(
    registered: RegisteredRankingPopularityDescriptor,
    viewedAt = this.now(),
  ) {
    return this.buffer.record(registered.rankingListKey, utcDate(viewedAt));
  }

  async flush() {
    return this.buffer.flush(async (increments) => {
      await this.writeIncrements(increments);
    });
  }

  hasReachedFlushThreshold() {
    return this.buffer.viewCount() >= this.flushEntryThreshold;
  }

  async flushIfThresholdReached() {
    if (!this.hasReachedFlushThreshold()) return false;
    await this.flush();
    return true;
  }

  async totals(
    rankingListKey: string,
    viewedAt = this.now(),
  ): Promise<RankingPopularityTotals> {
    const today = utcDate(viewedAt);
    const sevenDayStart = utcDateDaysBefore(today, 6);
    const thirtyDayStart = utcDateDaysBefore(today, 29);
    const result = await this.database(rankingPopularityTotalsQuery(), [
      sevenDayStart,
      rankingListKey,
      thirtyDayStart,
    ]);
    const row = result.rows[0] as PopularityTotalsRow | undefined;
    return {
      sevenDayViews: viewCount(row?.seven_day_views),
      thirtyDayViews: viewCount(row?.thirty_day_views),
    };
  }

  async score(
    rankingListKey: string,
    viewedAt = this.now(),
  ): Promise<RankingPopularityScore> {
    const totals = await this.totals(rankingListKey, viewedAt);
    return rankingPopularityScore(totals);
  }

  entries() {
    return this.buffer.entries();
  }

  private async writeIncrements(increments: readonly PopularityIncrement[]) {
    if (increments.length === 0) return;
    const values = increments.flatMap((increment) => [
      increment.rankingListKey,
      increment.popularityDate,
      increment.count,
    ]);
    await this.database(upsertDailyPopularityQuery(increments.length), values);
  }
}

export function rankingPopularityScore(
  totals: RankingPopularityTotals,
): RankingPopularityScore {
  return {
    ...totals,
    score:
      Math.log2(1 + totals.sevenDayViews) +
      0.25 * Math.log2(1 + totals.thirtyDayViews),
  };
}

export const rankingPopularityService = new RankingPopularityService();
