import {
  rankingListKey,
  type RankingListDescriptor,
} from "@/lib/ranking-list-descriptor";
import type { PopularRankingDescriptor } from "@/services/ranking-popularity/read-service";
import { FEED_SORT_CONSTANTS } from "./constants";
import type { FeedInventoryStat } from "./inventory";
import type { FeedUserPreferences } from "./preferences";
import type { FeedInterestingResult } from "./stat-previews";

function feedDescriptor(source: FeedInventoryStat): RankingListDescriptor {
  const region = {
    scope: source.region.scope,
    regionId: source.region.regionId,
  };
  const genders = source.gender === null ? [] : [source.gender];

  if (source.kind === "person-competition") {
    return {
      version: 1,
      family: "person-activity",
      metric: "competitions",
      year: source.year,
      region,
      genders,
    };
  }
  if (source.kind === "person-medals") {
    return {
      version: 1,
      family: "person-medals",
      medalType: "overall",
      eventId: source.eventId,
      year: source.year,
      region,
      genders,
    };
  }
  if (source.kind.startsWith("person-activity-")) {
    const metric = source.kind.replace("person-activity-", "") as
      "countries" | "rounds" | "solves";
    return {
      version: 1,
      family: "person-activity",
      metric,
      region,
      genders,
    };
  }
  if (source.kind === "competition") {
    return {
      version: 1,
      family: "competition",
      metric: "fastest",
      eventId: source.eventId,
      resultType: source.resultType,
    };
  }
  if (source.kind === "city") {
    return {
      version: 1,
      family: "city",
      metric: "fastest",
      eventId: source.eventId,
      resultType: source.resultType,
      region,
      genders,
    };
  }

  return {
    version: 1,
    family: source.kind === "person" ? "person-event" : "person-result",
    eventId: source.eventId,
    resultType: source.resultType,
    year: source.year,
    region,
    genders,
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

function feedStatPopularityScore(
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

function rankForRegion(candidate: FeedInterestingResult) {
  if (candidate.region.scope === "world") return candidate.worldRank;
  if (candidate.region.scope === "continent") return candidate.continentRank;
  return candidate.countryRank;
}

function baseForRegion(candidate: FeedInterestingResult) {
  if (candidate.region.scope === "world") return FEED_SORT_CONSTANTS.worldRank;
  if (candidate.region.scope === "continent")
    return FEED_SORT_CONSTANTS.continentRank;
  return FEED_SORT_CONSTANTS.countryRank;
}

function statGroupKey(candidate: FeedInterestingResult) {
  return [
    candidate.eventId,
    candidate.resultType,
    candidate.kind,
    candidate.region.scope,
    candidate.region.regionId,
    candidate.gender ?? "all",
    candidate.year ?? "all",
  ].join(":");
}

function feedStatFamilyWeight(candidate: FeedInterestingResult) {
  if (
    candidate.kind === "person" ||
    candidate.kind === "person-competition" ||
    candidate.kind === "person-medals" ||
    candidate.kind.startsWith("person-activity-")
  ) {
    return FEED_SORT_CONSTANTS.personRankingWeight;
  }
  if (candidate.kind === "result") {
    return candidate.year === null
      ? FEED_SORT_CONSTANTS.allTimePersonResultWeight
      : FEED_SORT_CONSTANTS.currentYearPersonResultWeight;
  }
  if (candidate.kind === "competition") {
    return FEED_SORT_CONSTANTS.competitionWeight;
  }
  return FEED_SORT_CONSTANTS.cityWeight;
}

function sameStatResultBoost(
  candidate: FeedInterestingResult,
  statCounts: ReadonlyMap<string, number>,
) {
  const count = Math.min(
    statCounts.get(statGroupKey(candidate)) ?? 1,
    FEED_SORT_CONSTANTS.maxSameStatResultBoost + 1,
  );
  return Math.max(0, count - 1) * FEED_SORT_CONSTANTS.sameStatResultWeight;
}

function feedNotabilityScore(candidate: FeedInterestingResult) {
  const rank = rankForRegion(candidate);
  if (rank === null || rank > 10) return 0;
  return baseForRegion(candidate) + (11 - rank) * FEED_SORT_CONSTANTS.rankStep;
}

export function sortFeedCandidates(
  candidates: readonly FeedInterestingResult[],
  preferences: FeedUserPreferences | null,
) {
  const statCounts = new Map<string, number>();
  for (const candidate of candidates) {
    const key = statGroupKey(candidate);
    statCounts.set(key, (statCounts.get(key) ?? 0) + 1);
  }
  return [...candidates].sort((left, right) => {
    const rightScore =
      feedNotabilityScore(right) +
      (right.resultType === "average" ? FEED_SORT_CONSTANTS.averageResult : 0) +
      feedStatFamilyWeight(right) +
      sameStatResultBoost(right, statCounts) +
      personalScore(right, preferences) +
      (right.statPopularityScore ?? 0);
    const leftScore =
      feedNotabilityScore(left) +
      (left.resultType === "average" ? FEED_SORT_CONSTANTS.averageResult : 0) +
      feedStatFamilyWeight(left) +
      sameStatResultBoost(left, statCounts) +
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

export function rankingListKeyForFeedStat(source: FeedInventoryStat) {
  try {
    return rankingListKey(feedDescriptor(source));
  } catch {
    // Some event/result combinations are not valid ranking descriptors.
    return null;
  }
}
