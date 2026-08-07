import type { PopularRankingDescriptor } from "@/services/ranking-popularity/read-service";
import type {
  FeedMode,
  RankingFeedCandidate,
  RankingFeedCandidateWithPopularity,
} from "./types";

const FEED_CARD_LIMIT = 5;

function popularityByListKey(popularity: readonly PopularRankingDescriptor[]) {
  return new Map(popularity.map((item) => [item.rankingListKey, item.score]));
}

function recentChangeTime(candidate: RankingFeedCandidate) {
  return candidate.change ? Date.parse(candidate.change.detectedAt) : 0;
}

function compareCandidates(
  mode: FeedMode,
  left: RankingFeedCandidateWithPopularity,
  right: RankingFeedCandidateWithPopularity,
) {
  if (mode === "home") {
    const changePriority = {
      leader: 0,
      enter: 1,
      leave: 2,
      move: 3,
      value: 4,
      tie: 5,
    };
    const changeDifference =
      (left.change ? changePriority[left.change.type] : 99) -
      (right.change ? changePriority[right.change.type] : 99);
    if (changeDifference) return changeDifference;
    const dateDifference = recentChangeTime(right) - recentChangeTime(left);
    if (dateDifference) return dateDifference;
  }
  const popularityDifference = right.popularityScore - left.popularityScore;
  if (popularityDifference) return popularityDifference;
  const rankDifference =
    (left.rank ?? Number.MAX_SAFE_INTEGER) -
    (right.rank ?? Number.MAX_SAFE_INTEGER);
  if (rankDifference) return rankDifference;
  return left.cardId.localeCompare(right.cardId);
}

function hasAdjacentSimilarity(
  candidate: RankingFeedCandidateWithPopularity,
  selected: readonly RankingFeedCandidateWithPopularity[],
) {
  const previous = selected.at(-1);
  if (!previous) return false;
  return (
    previous.sourceFamily === candidate.sourceFamily ||
    previous.descriptor.family === candidate.descriptor.family ||
    (candidate.focusEntityId !== undefined &&
      candidate.focusEntityId === previous.focusEntityId)
  );
}

function isEligibleFeedCandidate(
  mode: FeedMode,
  candidate: RankingFeedCandidate,
) {
  if (mode === "person") {
    return candidate.rank !== undefined && candidate.rank <= 5;
  }
  return candidate.change !== undefined;
}

export function selectRankingFeedCandidates(
  mode: FeedMode,
  candidates: readonly RankingFeedCandidate[],
  popularity: readonly PopularRankingDescriptor[],
  limit = FEED_CARD_LIMIT,
) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("The feed limit must be an integer from 1 to 100.");
  }
  const scores = popularityByListKey(popularity);
  const eligible = candidates
    .filter((candidate) => isEligibleFeedCandidate(mode, candidate))
    .map((candidate) => ({
      ...candidate,
      popularityScore: scores.get(candidate.listKey) ?? 0,
    }))
    .sort((left, right) => compareCandidates(mode, left, right));
  const selected: RankingFeedCandidateWithPopularity[] = [];
  const listKeys = new Set<string>();
  const anchors = new Set<string>();
  for (const candidate of eligible) {
    if (listKeys.has(candidate.listKey)) continue;
    if (candidate.anchor && anchors.has(candidate.anchor)) continue;
    if (hasAdjacentSimilarity(candidate, selected)) {
      const alternative = eligible.find(
        (item) =>
          !listKeys.has(item.listKey) &&
          (!item.anchor || !anchors.has(item.anchor)) &&
          !hasAdjacentSimilarity(item, selected),
      );
      if (alternative && alternative.cardId !== candidate.cardId) continue;
    }
    selected.push(candidate);
    listKeys.add(candidate.listKey);
    if (candidate.anchor) anchors.add(candidate.anchor);
    if (selected.length === limit) break;
  }
  return selected;
}
