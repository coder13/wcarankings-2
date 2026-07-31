import type { RecordBadgeCode, RegionScope } from "@/lib/wca";

export type RankingEntry = {
  entryKey?: string;
  resultId?: number;
  rank: number;
  subRank: number;
  personId: string;
  personName: string;
  profileHref?: string;
  identitySubtitle?: string;
  countryName: string;
  countryIso2: string;
  best: number;
  formattedValue?: string;
  competitionId: string;
  competitionName: string;
  recordBadges: RecordBadgeCode[];
};

export function rankingEntryKey(entry: Pick<RankingEntry, "entryKey" | "personId">) {
  return entry.entryKey ?? entry.personId;
}

export type RankingPage = {
  entries: RankingEntry[];
  hasMore: boolean;
  nextPageStart: number | null;
  previousPageStart: number | null;
  startPosition: number;
  lastRank: number | null;
  total: number;
  exportDate?: string | null;
  offlineStale?: boolean;
  availableYears?: number[];
};

export type InitialRankingData = Pick<
  RankingPage,
  | "entries"
  | "hasMore"
  | "nextPageStart"
  | "previousPageStart"
  | "total"
  | "exportDate"
  | "availableYears"
> & {
  startRank: number;
  startPosition: number;
  lastRank: number | null;
  searchMatches: RankingEntry[];
  initialMatchPersonId: string;
  regexSearch?: boolean;
};

export type RegionOption = {
  key: string;
  scope: RegionScope;
  regionId: string;
  label: string;
  iso2?: string;
};

export type RegionSelection = Pick<RegionOption, "scope" | "regionId">;

const rankingNumberFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
});

export function formatRankingNumber(value: number) {
  return rankingNumberFormatter.format(value);
}

export function formatExportDate(value: string) {
  const exportDate = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(exportDate.getTime())) return "date unavailable";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(exportDate);
}

export function formatRankingsFreshness(exportDate: string | null) {
  if (exportDate) return `WCA export dated ${formatExportDate(exportDate)}`;
  return "WCA export date unavailable";
}
