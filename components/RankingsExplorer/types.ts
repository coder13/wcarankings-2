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
  resultSubtitle?: string;
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
  cacheMembershipVersion?: number;
  cacheDataVersion?: string | null;
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
  | "cacheMembershipVersion"
  | "cacheDataVersion"
  | "availableYears"
> & {
  startRank: number;
  startPosition: number;
  lastRank: number | null;
};

export type RegionOption = {
  key: string;
  scope: RegionScope;
  regionId: string;
  label: string;
  iso2?: string;
};

export type RegionSelection = Pick<RegionOption, "scope" | "regionId">;

export type RankingSource =
  | { kind: "saved"; listId: string; listName: string }
  | { kind: "dynamic"; personIds: string[]; listName: string };

export type RankingsRegions = {
  continents: Array<{ id: string; name: string }>;
  countries: Array<{ id: string; name: string; iso2?: string }>;
};

export type RankingsExplorerOptions = {
  showAllEventRankingOptions: boolean;
  showSubjectSwitch: boolean;
  showMyRank: boolean;
  regionSelectionDisabled: boolean;
};

export type RankingsListConfig = {
  owner?: {
    listId: string;
    visibility: "public" | "private";
    joinPolicy: "open" | "closed";
  };
  membership?: {
    listId: string;
    joinPolicy: "open" | "closed";
    state: "member" | "pending" | "not_member";
  };
  membershipRequests?: {
    listId: string;
    requests: Array<{ id: number; personId: string; name: string }>;
  };
  actions?: { listId: string; isOwner: boolean };
  dynamic?: { personIds: string[] };
  notice?: string;
};

export type RankingsExplorerConfig = {
  source?: RankingSource;
  list?: RankingsListConfig;
  regions: RankingsRegions;
  options: RankingsExplorerOptions;
  release?: {
    commitSha: string;
    lastResultIngestAt: string | null;
  };
};

const rankingNumberFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
});

export function formatRankingNumber(value: number) {
  return rankingNumberFormatter.format(value);
}

export function rankingScope(
  scope: "world" | "continent" | "national",
  regionLabel: string,
  rank: number,
) {
  const label = `#${formatRankingNumber(rank)}`;
  return { scope, label, ariaLabel: `${regionLabel} ${label}` };
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

export function formatFooterDate(exportDate: string | null) {
  if (!exportDate) return "date unavailable";
  const date = new Date(`${exportDate.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return "date unavailable";
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}/${date.getUTCFullYear()}`;
}
