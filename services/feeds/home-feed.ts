import { getProjectionFeatureSwitch } from "@/lib/projection-feature-switch";
import { readPopularRankingDescriptors } from "@/services/ranking-popularity/read-service";
import {
  precomputeRecentChangeCandidates,
  type PrecomputeRecentChangeCandidatesOptions,
} from "./recent-changes";
import { selectRankingFeedCandidates } from "./selection";

export type HomeFeedOptions = PrecomputeRecentChangeCandidatesOptions & {
  popularityLimit?: number;
  limit?: number;
  generationId?: string;
  readPopularity?: typeof readPopularRankingDescriptors;
};

export async function loadHomeFeed(options: HomeFeedOptions = {}) {
  const now = options.now ?? new Date();
  const featureSwitch = options.generationId
    ? { generationId: options.generationId }
    : await getProjectionFeatureSwitch();
  const popularity = await (
    options.readPopularity ?? readPopularRankingDescriptors
  )({
    limit: options.popularityLimit ?? 100,
    viewedAt: now,
    query: options.query,
  });
  const precomputed = await precomputeRecentChangeCandidates(options);
  const cards = selectRankingFeedCandidates(
    "home",
    precomputed.candidates,
    popularity,
    options.limit,
  );
  return {
    cards,
    generationId: featureSwitch.generationId ?? "unavailable",
    popularityDate: now.toISOString().slice(0, 10),
    triggerCount: precomputed.triggers.length,
    candidateCount: precomputed.candidates.length,
  };
}
