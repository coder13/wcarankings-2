export const FEED_SORT_CONSTANTS = {
  worldRank: 300,
  continentRank: 200,
  countryRank: 100,
  rankStep: 10,
  averageResult: 25,
  personRankingWeight: 24,
  allTimePersonResultWeight: 18,
  currentYearPersonResultWeight: 10,
  competitionWeight: 6,
  cityWeight: 0,
  sameStatResultWeight: 8,
  maxSameStatResultBoost: 4,
  personalCountry: 160,
  preferredCountry: 80,
  personalContinent: 90,
  preferredContinent: 45,
  statPopularity: 1,
  maxPreferredCountries: 5,
} as const;

export const FEED_PAGE_SIZE = 5;
export const FEED_ITEM_PAGE_SIZE = 50;

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const FEED_TOP_SCAN_SIZE = positiveInteger(
  process.env.FEED_TOP_SCAN_SIZE,
  10,
);
