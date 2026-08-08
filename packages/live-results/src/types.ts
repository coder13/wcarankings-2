export const LIVE_RESULT_SOURCES = [
  "unknown",
  "ilr",
  "wca-live",
  "cubing-china",
] as const;

export type LiveResultSource = (typeof LIVE_RESULT_SOURCES)[number];

export interface LiveResult {
  sourceResultId: string;
  eventId: string;
  roundNumber: number;
  roundTypeId: string;
  formatId: string | null;
  personId: string;
  personName: string;
  countryIso2: string | null;
  best: number;
  average: number;
  position: number;
  attempts: number[];
}

export interface LiveResultsSnapshot {
  results: LiveResult[];
  skippedRoundIds?: string[];
}

export interface LiveResultsSourceRow {
  source_name: LiveResultSource;
  competition_id: string;
  remote_competition_id: string;
  competition_year: number;
  lease_token: string | null;
}

export interface ClaimedProvisionalRankingJob {
  source_version: number;
  lease_token: string;
}
