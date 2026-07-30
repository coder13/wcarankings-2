export const COMPETITION_RANKING_OPTIONS = [
  { value: "best-result", label: "Best result" },
  { value: "podiums", label: "Podiums" },
  { value: "competitor-count", label: "Competitor count" },
  { value: "latitude", label: "Latitude" },
] as const;

export type CompetitionRanking = (typeof COMPETITION_RANKING_OPTIONS)[number]["value"];

export type RankingResource = "people" | "results" | "competitions" | "podiums" | "competitor-count" | "latitude-north" | "latitude-south";
