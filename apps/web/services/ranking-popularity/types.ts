import type { RankingListDescriptor } from "@/lib/ranking-list-descriptor";

export type PopularityQuery = (
  text: string,
  values?: unknown[],
) => Promise<{ rows: Record<string, unknown>[] }>;

export type RegisterRankingPopularityOptions = {
  verifiedPublicList?: { publicId: string };
};

export type RegisteredRankingPopularityDescriptor = {
  canonicalDescriptorJson: string;
  descriptor: RankingListDescriptor;
  rankingListKey: string;
  customListPublicId: string | null;
};

export type PopularityIncrement = {
  rankingListKey: string;
  popularityDate: string;
  count: number;
};

export type RankingPopularityTotals = {
  sevenDayViews: number;
  thirtyDayViews: number;
};

export type RankingPopularityScore = RankingPopularityTotals & {
  score: number;
};
