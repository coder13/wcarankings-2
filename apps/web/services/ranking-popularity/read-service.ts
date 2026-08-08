import {
  normalizeRankingListDescriptor,
  type RankingListDescriptor,
} from "@/lib/ranking-list-descriptor";
import { query as defaultQuery } from "@/db";
import { popularRankingDescriptorsQuery } from "./queries";
import { rankingPopularityScore } from "./service";
import type { PopularityQuery, RankingPopularityScore } from "./types";

type PopularityDescriptorRow = {
  ranking_list_key: string;
  source_family: string;
  canonical_descriptor_json: string;
  custom_list_public_id: string | null;
  first_seen_at: string | Date;
  last_seen_at: string | Date;
  seven_day_views: number | string;
  thirty_day_views: number | string;
};

export type PopularRankingDescriptor = RankingPopularityScore & {
  rankingListKey: string;
  sourceFamily: RankingListDescriptor["family"];
  canonicalDescriptorJson: string;
  descriptor: RankingListDescriptor;
  customListPublicId: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
};

export type ReadPopularRankingDescriptorsOptions = {
  limit?: number;
  viewedAt?: Date;
  query?: PopularityQuery;
};

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function positiveLimit(value: number | undefined) {
  const limit = value ?? DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new Error(
      `Popularity limit must be an integer from 1 to ${MAX_LIMIT}.`,
    );
  }
  return limit;
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

function count(value: number | string) {
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) {
    throw new Error("The popularity query returned an invalid view count.");
  }
  return result;
}

function timestamp(value: string | Date) {
  return value instanceof Date ? value.toISOString() : value;
}

function mapRow(row: PopularityDescriptorRow): PopularRankingDescriptor {
  const descriptor = normalizeRankingListDescriptor(
    JSON.parse(row.canonical_descriptor_json),
  );
  if (descriptor.family !== row.source_family) {
    throw new Error("The popularity descriptor family does not match its row.");
  }
  const totals = {
    sevenDayViews: count(row.seven_day_views),
    thirtyDayViews: count(row.thirty_day_views),
  };
  return {
    rankingListKey: row.ranking_list_key,
    sourceFamily: descriptor.family,
    canonicalDescriptorJson: row.canonical_descriptor_json,
    descriptor,
    customListPublicId: row.custom_list_public_id,
    firstSeenAt: timestamp(row.first_seen_at),
    lastSeenAt: timestamp(row.last_seen_at),
    ...rankingPopularityScore(totals),
  };
}

export async function readPopularRankingDescriptors(
  options: ReadPopularRankingDescriptorsOptions = {},
): Promise<PopularRankingDescriptor[]> {
  const viewedAt = options.viewedAt ?? new Date();
  const today = utcDate(viewedAt);
  const result = await (options.query ?? defaultQuery)(
    popularRankingDescriptorsQuery(),
    [
      utcDateDaysBefore(today, 6),
      utcDateDaysBefore(today, 29),
      positiveLimit(options.limit),
    ],
  );
  return result.rows.map((row) =>
    mapRow(row as unknown as PopularityDescriptorRow),
  );
}
