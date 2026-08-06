import {
  canonicalRankingListDescriptorJson,
  rankingListKey,
  type RankingListDescriptor,
} from "@/lib/ranking-list-descriptor";
import type { PopularRankingDescriptor } from "@/services/ranking-popularity/read-service";
import { FEED_SORT_CONSTANTS } from "./constants";
import type { FeedInventoryStat } from "./inventory";
import type { FeedUserPreferences } from "./preferences";
import type { FeedInterestingResult } from "./stat-previews";

function feedDescriptor(source: FeedInventoryStat): RankingListDescriptor {
  return {
    version: 1,
    family: source.kind === "person" ? "person-event" : "person-result",
    eventId: source.eventId,
    resultType: source.resultType,
    year: source.year,
    region: {
      scope: source.region.scope,
      regionId: source.region.regionId,
    },
    genders: source.gender === null ? [] : [source.gender],
    population: { kind: "everyone" },
  };
}

function popularityScores(popularity: readonly PopularRankingDescriptor[]) {
  return new Map(
    popularity.map((item) => [
      item.rankingListKey,
      item.score * FEED_SORT_CONSTANTS.statPopularity,
    ]),
  );
}

export function feedStatPopularityScore(
  source: FeedInventoryStat,
  popularity: readonly PopularRankingDescriptor[],
) {
  try {
    const descriptor = feedDescriptor(source);
    const key = rankingListKey(descriptor);
    return popularityScores(popularity).get(key) ?? 0;
  } catch {
    // Some events, such as Multi-Blind, do not support every result type.
    return 0;
  }
}

function personalScore(
  source: FeedInventoryStat,
  preferences: FeedUserPreferences | null,
) {
  if (!preferences) return 0;
  if (
    source.region.scope === "country" &&
    source.region.regionId === preferences.countryId
  )
    return FEED_SORT_CONSTANTS.personalCountry;
  if (
    source.region.scope === "country" &&
    preferences.preferredCountryIds.includes(source.region.regionId)
  ) {
    const index = preferences.preferredCountryIds.indexOf(
      source.region.regionId,
    );
    return FEED_SORT_CONSTANTS.preferredCountry / (index + 1);
  }
  if (
    source.region.scope === "continent" &&
    source.region.regionId === preferences.continentId
  )
    return FEED_SORT_CONSTANTS.personalContinent;
  if (
    source.region.scope === "continent" &&
    preferences.preferredContinentIds.includes(source.region.regionId)
  ) {
    const index = preferences.preferredContinentIds.indexOf(
      source.region.regionId,
    );
    return FEED_SORT_CONSTANTS.preferredContinent / (index + 1);
  }
  return 0;
}

export function feedNotabilityScore(candidate: FeedInterestingResult) {
  return Math.max(
    candidate.worldRank !== null && candidate.worldRank <= 10
      ? FEED_SORT_CONSTANTS.worldRank +
          (11 - candidate.worldRank) * FEED_SORT_CONSTANTS.rankStep
      : 0,
    candidate.continentRank !== null && candidate.continentRank <= 10
      ? FEED_SORT_CONSTANTS.continentRank +
          (11 - candidate.continentRank) * FEED_SORT_CONSTANTS.rankStep
      : 0,
    candidate.countryRank !== null && candidate.countryRank <= 10
      ? FEED_SORT_CONSTANTS.countryRank +
          (11 - candidate.countryRank) * FEED_SORT_CONSTANTS.rankStep
      : 0,
  );
}

export function sortFeedCandidates(
  candidates: readonly FeedInterestingResult[],
  preferences: FeedUserPreferences | null,
) {
  return [...candidates].sort((left, right) => {
    const rightScore =
      feedNotabilityScore(right) +
      (right.resultType === "average" ? FEED_SORT_CONSTANTS.averageResult : 0) +
      personalScore(right, preferences) +
      (right.statPopularityScore ?? 0);
    const leftScore =
      feedNotabilityScore(left) +
      (left.resultType === "average" ? FEED_SORT_CONSTANTS.averageResult : 0) +
      personalScore(left, preferences) +
      (left.statPopularityScore ?? 0);
    return rightScore - leftScore || left.id.localeCompare(right.id);
  });
}

export function addFeedStatPopularity(
  candidates: readonly FeedInterestingResult[],
  popularity: readonly PopularRankingDescriptor[],
) {
  return candidates.map((candidate) => ({
    ...candidate,
    statPopularityScore: feedStatPopularityScore(candidate, popularity),
  }));
}

export function descriptorJsonForFeedStat(source: FeedInventoryStat) {
  return canonicalRankingListDescriptorJson(feedDescriptor(source));
}
