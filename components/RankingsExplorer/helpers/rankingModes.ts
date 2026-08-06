export const COMPETITION_RANKING_OPTIONS = [
  { value: "best-result", label: "Best result" },
  { value: "podiums", label: "Podiums" },
  { value: "competitor-count", label: "Competitor count" },
  { value: "latitude", label: "Latitude" },
] as const;

export type CompetitionRanking =
  (typeof COMPETITION_RANKING_OPTIONS)[number]["value"];

export const CITY_RANKING_OPTIONS = [
  { value: "fastest-single", label: "Fastest single" },
  { value: "fastest-average", label: "Fastest average" },
  { value: "competitors", label: "Competitors" },
  { value: "competitions", label: "Competitions" },
  { value: "solves", label: "Official solves" },
] as const;

export type CityRanking = (typeof CITY_RANKING_OPTIONS)[number]["value"];

export type RankingResource =
  | "people"
  | "person-competition-count"
  | "person-medal-rankings"
  | "results"
  | "competitions"
  | "podiums"
  | "competitor-count"
  | "latitude-north"
  | "latitude-south"
  | `city-${CityRanking}`;
