import type { RankingListDescriptor } from "@/lib/ranking-list-descriptor";

export type FeedMode = "person" | "home";
export type RankingFeedCandidate = {
  cardId: string;
  listKey: string;
  descriptor: RankingListDescriptor;
  title: string;
  exploreUrl: string;
  previewRows: Record<string, unknown>[];
  sourceFamily: RankingListDescriptor["family"];
  diversityKey: string;
  anchor: string | null;
  focusEntityId?: string;
  publicListAttribution?: string;
  rank?: number;
  change?: {
    type: "leader" | "enter" | "leave" | "move" | "value" | "tie";
    detectedAt: string;
    summary: string;
  };
};

export type RankingFeedCandidateWithPopularity = RankingFeedCandidate & {
  popularityScore: number;
};

export type RankingFeedCursor = {
  version: 1;
  mode: FeedMode;
  generationId: string;
  popularityDate: string;
  seed: string;
  offset: number;
  listKeys: string[];
  diversityKeys: string[];
  anchors: string[];
};

export type FeedTopFiveRow = {
  entityId: string;
  rank: number;
  value: number | string | null;
};

export type FeedTopFiveChange = {
  type: "leader" | "enter" | "leave" | "move" | "value" | "tie";
  previousTopFive: FeedTopFiveRow[];
  currentTopFive: FeedTopFiveRow[];
  focusEntityId: string | null;
  summary: string;
};
