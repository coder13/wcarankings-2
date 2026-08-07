import type { ApiDiagnostics } from "@/lib/api/projection";
import type {
  GenderFilter,
  RankingEntry,
  RankingType,
  RegionScope,
} from "@/lib/wca";

export interface ResultRankingRequest {
  eventId: string;
  resultType: RankingType;
  scope: RegionScope;
  regionId: string;
  requestedStart: number;
  requestedLimit: number;
  start: number;
  limit: number;
  search: string;
  searchLimit: number | null;
  regexSearch: boolean;
  baseTable: "result_rankings_average" | "result_rankings_single";
  gender: GenderFilter[];
  year: number | null;
}

interface ResultRankingEntry extends RankingEntry {
  entryKey: string;
  resultId: number;
}

export interface ResultRankingData extends Record<string, unknown> {
  entries: ResultRankingEntry[];
  hasMore: boolean;
  nextPageStart: number | null;
  previousPageStart: number | null;
  startPosition: number;
  lastRank: number | null;
  total: number;
}

export interface ResultRankingLoadResult extends Record<string, unknown> {
  data: ResultRankingData;
  diagnostics: ApiDiagnostics;
}
