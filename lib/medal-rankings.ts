const MEDAL_RANKING_TYPES = [
  "overall",
  "gold",
  "silver",
  "bronze",
] as const;

export type MedalRankingType = (typeof MEDAL_RANKING_TYPES)[number];

export const MEDAL_RANKING_OPTIONS = [
  { value: "overall", label: "Overall medals" },
  { value: "gold", label: "Gold medals" },
  { value: "silver", label: "Silver medals" },
  { value: "bronze", label: "Bronze medals" },
] as const satisfies ReadonlyArray<{ value: MedalRankingType; label: string }>;

export const ALL_MEDAL_EVENTS_OPTION = {
  id: "all",
  name: "All events",
  shortName: "All events",
  symbol: "◆",
} as const;

export function isMedalRankingType(value: string): value is MedalRankingType {
  return MEDAL_RANKING_TYPES.some((candidate) => candidate === value);
}
