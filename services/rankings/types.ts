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
  world_rank_delta: number | null;
  world_rank_delta_state: "changed" | "new" | null;
  continent_rank_delta: number | null;
  continent_rank_delta_state: "changed" | "new" | null;
  country_rank_delta: number | null;
  country_rank_delta_state: "changed" | "new" | null;
  record_streak_weeks: number | null;
};

type KinchOrder = "regional" | "continent";

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

export type FilteredPersonMetricRow = PersonMetricRow & {
  total_count?: number;
};

export type PersonCompetitionRankingRow = {
  person_id: string;
  person_name: string;
  country_name: string;
  country_iso2: string;
  competition_count: number;
  rank: number;
  position: number;
};

export type ResultRankingRow = {
  result_id: number;
  attempt_number: number | null;
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
  hits: number;
  misses: number;
  coalesced: number;
  evictions: number;
};

export type ResultRankingsQueryInput = {
  source: string;
  rankColumn: string;
  positionColumn: string;
  conditions: string[];
};

export type GenderRankingQueryInput = {
  source: string;
  baseConditions: string[];
  conditions: string[];
  selectColumns: string;
};

export type GenderPersonRankingRow = {
  person_id: string;
  result_id: number;
  result_value: number;
  country_id: string;
  country_name: string;
  country_iso2: string;
  continent_id: string;
  person_name: string;
  world_rank: number;
  competition_id: string;
  competition_name: string;
  is_world_record: number;
  is_continent_record: number;
  is_country_record: number;
};

export type RankingPageQueryInput = {
  selectColumns: string;
  from: string;
  predicate: string;
  qualifiedSubRank: string;
  personColumn: string;
};

export type RankingSearchQueryInput = RankingPageQueryInput & {
  personIds: string[];
};
export type RankingCursorQueryInput = RankingPageQueryInput & {
  cursor: string;
};

export type PersonMetricQueryInput = {
  rankColumn: string;
  positionColumn: string;
  scoreExpression: string;
  conditions: string[];
};

export type FilteredPersonMetricQueryInput = {
  scoreValue: string;
  scoreOrder: string;
  conditions: string[];
  pageConditions: string[];
};
export type LatitudeQueryInput = {
  prefix: string;
  direction?: "ASC" | "DESC";
  regionColumn?: string;
  scoped: boolean;
};
export type CompetitionEntityQueryInput = {
  valueColumn: string;
  resultIdColumn: string;
  rankColumn: string;
  positionColumn: string;
};
export type PodiumEntityQueryInput = { positionColumn: string };
