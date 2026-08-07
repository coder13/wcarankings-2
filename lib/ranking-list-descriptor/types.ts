import type { MedalRankingType } from "@/lib/medal-rankings";
import type { GenderFilter, RankingType, RegionScope } from "@/lib/wca";

export const RANKING_LIST_DESCRIPTOR_VERSION = 1 as const;

export class RankingListDescriptorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RankingListDescriptorError";
  }
}

export type RankingPopulation =
  | { kind: "everyone" }
  | { kind: "public-list"; publicId: string }
  | { kind: "system-list"; systemAlias: string };

export type RankingRegion = { scope: RegionScope; regionId: string };

type PersonFilters = {
  region: RankingRegion;
  genders: GenderFilter[];
};

type ListPersonFilters = PersonFilters & {
  population: RankingPopulation;
};

type CityFilters = { region: RankingRegion; genders: GenderFilter[] };

type PersonEventDescriptor = ListPersonFilters & {
  version: typeof RANKING_LIST_DESCRIPTOR_VERSION;
  family: "person-event";
  eventId: string;
  resultType: RankingType;
  year: number | null;
};

type PersonResultDescriptor = ListPersonFilters & {
  version: typeof RANKING_LIST_DESCRIPTOR_VERSION;
  family: "person-result";
  eventId: string;
  resultType: RankingType;
  year: number | null;
};

type SumOfRanksDescriptor = PersonFilters & {
  version: typeof RANKING_LIST_DESCRIPTOR_VERSION;
  family: "person-composite";
  metric: "sum-of-ranks";
  resultType: RankingType;
  year: number | null;
};

type KinchDescriptor = PersonFilters & {
  version: typeof RANKING_LIST_DESCRIPTOR_VERSION;
  family: "person-composite";
  metric: "kinch";
  order: "regional" | "continent";
};

type PersonActivityCompetitionsDescriptor = PersonFilters & {
  version: typeof RANKING_LIST_DESCRIPTOR_VERSION;
  family: "person-activity";
  metric: "competitions";
  year: number | null;
};

type PersonActivityCountDescriptor = PersonFilters & {
  version: typeof RANKING_LIST_DESCRIPTOR_VERSION;
  family: "person-activity";
  metric: "countries" | "rounds" | "solves";
};

type PersonMedalsDescriptor = PersonFilters & {
  version: typeof RANKING_LIST_DESCRIPTOR_VERSION;
  family: "person-medals";
  medalType: MedalRankingType;
  eventId: string | "all";
  year: number | null;
};

type CompetitionFastestDescriptor = {
  version: typeof RANKING_LIST_DESCRIPTOR_VERSION;
  family: "competition";
  metric: "fastest";
  eventId: string;
  resultType: RankingType;
};

type CompetitionPodiumDescriptor = {
  version: typeof RANKING_LIST_DESCRIPTOR_VERSION;
  family: "competition";
  metric: "podium";
  eventId: string;
};

type CompetitionCompetitorCountDescriptor = {
  version: typeof RANKING_LIST_DESCRIPTOR_VERSION;
  family: "competition";
  metric: "competitor-count";
};

type CompetitionLatitudeDescriptor = {
  version: typeof RANKING_LIST_DESCRIPTOR_VERSION;
  family: "competition";
  metric: "latitude";
  hemisphere: "north" | "south";
  region: RankingRegion;
};

type CityFastestDescriptor = CityFilters & {
  version: typeof RANKING_LIST_DESCRIPTOR_VERSION;
  family: "city";
  metric: "fastest";
  eventId: string;
  resultType: RankingType;
};

type CityCountDescriptor = CityFilters & {
  version: typeof RANKING_LIST_DESCRIPTOR_VERSION;
  family: "city";
  metric: "competitors" | "competitions" | "solves";
  eventId: string;
};

export type RankingListDescriptor =
  | PersonEventDescriptor
  | PersonResultDescriptor
  | SumOfRanksDescriptor
  | KinchDescriptor
  | PersonActivityCompetitionsDescriptor
  | PersonActivityCountDescriptor
  | PersonMedalsDescriptor
  | CompetitionFastestDescriptor
  | CompetitionPodiumDescriptor
  | CompetitionCompetitorCountDescriptor
  | CompetitionLatitudeDescriptor
  | CityFastestDescriptor
  | CityCountDescriptor;

export type RankingResultWindow = { start: number; limit: number };

export type RankingListCacheIdentity = {
  generationId: string;
  listKey: string;
  window: RankingResultWindow;
};
