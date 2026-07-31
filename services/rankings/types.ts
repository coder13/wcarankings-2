import type { RankingType, RegionScope, GenderFilter } from "@/lib/wca";
import type { LRUCache } from "lru-cache";

export type RankingRow = {
  rank: number;
  sub_rank: number;
  total_count?: number;
  person_id: string;
  person_name: string;
  country_id: string;
  country_name: string;
  country_iso2: string;
  continent_id: string;
  best: number;
  competition_id: string;
  competition_name: string;
  is_world_record: number;
  is_continent_record: number;
  is_country_record: number;
};

export type KinchOrder = "regional" | "continent";

export type QueryInput = {
  eventId: string;
  type: RankingType;
  gender: GenderFilter[];
  scope: RegionScope;
  regionId: string;
  year: number | null;
  kinchOrder: KinchOrder;
  startRank: number;
  cursorRank: number | null;
  cursorId: string;
  limit: number;
  locate: string;
  search: string;
  regexSearch: boolean;
  searchLimit: number;
  paged: boolean;
};

export type PersonMetricRow = {
  rank: number;
  sub_rank: number;
  person_id: string;
  person_name: string;
  country_id: string;
  country_name: string;
  country_iso2: string;
  continent_id: string;
  best: number;
};

export type FilteredPersonMetricRow = PersonMetricRow & { total_count?: number };

export type PersonRankingRow = {
  person_id: string;
  person_name: string;
  country_id: string;
  country_name: string;
  country_iso2: string;
  continent_id: string;
  rank: number;
  result_id: number;
  result_value: number;
  competition_id: string;
  competition_name: string;
  competition_start_date: string;
  round_type_id: string;
};

export type ResultRankingRow = {
  result_id: number;
  result_value: number;
  rank: number;
  position: number;
  person_id: string;
  person_name: string;
  country_id: string;
  country_name: string;
  country_iso2: string;
  continent_id: string;
  competition_id: string;
  competition_name: string;
  record_code: string;
  total_count?: number;
};

export type CompetitionRow = {
  rank: number;
  competition_id: string;
  competition_name: string;
  start_date: string;
  city_name: string;
  country_id: string;
  country_name: string;
  country_iso2: string;
  latitude: number | null;
  longitude: number | null;
  competitor_count: number;
  result_id: number | null;
  result_value: number | null;
  person_id: string | null;
  person_name: string | null;
  round_type_id: string | null;
  position: number;
};

export type LatitudeRow = {
  rank: number;
  position: number;
  competition_id: string;
  competition_name: string;
  venue: string;
  city_name: string;
  country_name: string;
  country_iso2: string;
  latitude: number;
};

export type PodiumRow = CompetitionRow & {
  score: number;
  podium_position: number;
  member_person_id: string;
  member_person_name: string;
  member_result_id: number;
  member_result_value: number;
};

export type CityRow = {
  rank: number;
  city_name: string;
  country_id: string;
  country_name: string;
  country_iso2: string;
  result_id: number;
  result_value: number;
  person_id: string;
  person_name: string;
  competition_id: string;
  competition_name: string;
  competition_start_date: string;
  round_type_id: string;
};

export type RankingsMetadata = {
  fetchedAt: string;
  exportDate: string | null;
  counts: Map<string, number>;
  yearCounts: Map<string, number>;
  availableYears: number[];
  yearProjectionAvailable: boolean;
};

export type CountRow = {
  event_id: string;
  ranking_type: RankingType;
  scope: RegionScope;
  region_id: string;
  count: number;
};

export type YearCountRow = CountRow & { year: number; cohort_id: number };
export type MetadataRow = { key: string; value: string };

export type RankingsPageKey = {
  eventId: string;
  year?: number | null;
  type: RankingType;
  scope: RegionScope;
  regionId: string;
  startRank: number;
};

export type CachePool<T extends object> = {
  cache: LRUCache<string, T>;
  pinnedKeys: Set<string>;
};
