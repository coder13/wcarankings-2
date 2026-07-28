import { redirect } from "next/navigation";
import { RankingsExplorer } from "@/components/RankingsExplorer/RankingsExplorer";
import type {
  RankingEntry,
  RankingPage,
} from "@/components/RankingsExplorer/types";
import { RESULTS_PAGE_SIZE } from "@/lib/rankings-config";
import { isEventId, isRankingType, isValidRegexPattern, parseRegionQuery } from "@/lib/wca";
import { getRegions } from "@/lib/regions";
import { loadRankings } from "@/lib/rankings";

const PAGE_SIZE = RESULTS_PAGE_SIZE;

export const dynamic = "force-dynamic";

function pageFirstSubRank(subRank: number) {
  return Math.floor((Math.max(1, subRank) - 1) / PAGE_SIZE) * PAGE_SIZE + 1;
}

function getSearchParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function getSearchParamWithLegacyKey(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
  legacyKey: string,
) {
  return getSearchParam(searchParams, key) || getSearchParam(searchParams, legacyKey);
}

function getCanonicalSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
  eventId: string,
  rankingType: "single" | "average",
  regionId: string,
) {
  const params = new URLSearchParams();
  Object.entries(searchParams).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
    else if (value !== undefined) params.set(key, value);
  });
  params.delete("event");
  params.delete("type");
  params.delete("scope");
  params.delete("regex");
  if (eventId === "333") params.delete("eventId");
  else params.set("eventId", eventId);
  if (rankingType === "single") params.delete("result");
  else params.set("result", rankingType);
  if (regionId) params.set("region", regionId);
  else params.delete("region");
  const search = getSearchParam(searchParams, "search").trim();
  if (getSearchParam(searchParams, "mode") === "vim" && search) params.set("mode", "vim");
  else params.delete("mode");
  return params;
}

type RankingsResponse = Partial<RankingPage> & {
  entries: RankingEntry[];
};

type RegionRecord = {
  id: string;
  name: string;
  iso2?: string;
};

type RegionKind = "continent" | "country";

async function fetchRankings(
  params: URLSearchParams,
): Promise<RankingsResponse> {
  return loadRankings(params) as Promise<RankingsResponse>;
}

async function fetchRegions(kind: RegionKind): Promise<RegionRecord[]> {
  return getRegions(kind);
}

async function getInitialRankings(
  searchParams: Record<string, string | string[] | undefined>,
) {
  const rawEventId = getSearchParamWithLegacyKey(searchParams, "eventId", "event");
  const rawRankingType = getSearchParamWithLegacyKey(searchParams, "result", "type");
  const eventId = isEventId(rawEventId) ? rawEventId : "333";
  const rankingType = eventId === "333mbf" ? "single" : isRankingType(rawRankingType) ? rawRankingType : "single";
  const { scope, regionId } = parseRegionQuery(getSearchParam(searchParams, "region"));
  const search = getSearchParam(searchParams, "search").trim().slice(0, 80);
  const regexSearch = getSearchParam(searchParams, "mode") === "vim" && isValidRegexPattern(search);
  const searchResult = search
    ? await fetchRankings(
        new URLSearchParams({
          eventId,
          result: rankingType,
          search,
          ...(regexSearch ? { mode: "vim" } : {}),
          ...(scope === "world" ? {} : { region: regionId }),
        }),
      )
    : null;
  const searchMatches = searchResult && Array.isArray(searchResult.entries)
    ? searchResult.entries
    : [];
  const firstMatch = searchMatches[0];
  const targetPageStart = pageFirstSubRank(firstMatch?.subRank ?? 1);
  const pageStarts = firstMatch
    ? [targetPageStart - PAGE_SIZE, targetPageStart, targetPageStart + PAGE_SIZE]
        .filter((start) => start > 0)
    : [1];
  const pages = await Promise.all(
    pageStarts.map((startRank) =>
      fetchRankings(
        new URLSearchParams({
          eventId,
          result: rankingType,
          start: String(startRank - 1),
          limit: String(PAGE_SIZE),
          paged: "1",
          ...(scope === "world" ? {} : { region: regionId }),
        }),
      ),
    ),
  );
  if (pages.some((page) => !Array.isArray(page.entries))) {
    throw new Error("Initial ranking page was unavailable.");
  }
  const firstPage = pages[0];
  const lastPage = pages.at(-1) ?? firstPage;
  if (!Array.isArray(firstPage.entries) || !Array.isArray(lastPage.entries)) {
    throw new Error("Initial ranking page was unavailable.");
  }
  const entries = pages.flatMap((page) => page.entries);
  const startRank = pageStarts[0];
  return {
    entries,
    hasMore: lastPage.hasMore ?? false,
    nextPageStart: lastPage.nextPageStart ?? null,
    previousPageStart: firstPage.previousPageStart ?? null,
    startPosition: firstPage.startPosition ?? Math.max(0, startRank - 1),
    lastRank: lastPage.lastRank ?? null,
    total: lastPage.total ?? 0,
    fetchedAt: lastPage.fetchedAt ?? lastPage.exportDate ?? null,
    startRank,
    searchMatches,
    searchTotal: searchResult?.total ?? 0,
    initialMatchPersonId: firstMatch?.personId ?? "",
    regexSearch,
  };
}

type SearchParams = Record<string, string | string[] | undefined>;

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const rawEventId = getSearchParamWithLegacyKey(resolvedSearchParams, "eventId", "event");
  const rawRankingType = getSearchParamWithLegacyKey(resolvedSearchParams, "result", "type");
  const eventId = isEventId(rawEventId) ? rawEventId : "333";
  const rankingType = eventId === "333mbf" ? "single" : isRankingType(rawRankingType) ? rawRankingType : "single";
  const { scope, regionId } = parseRegionQuery(getSearchParam(resolvedSearchParams, "region"));
  const canonicalParams = getCanonicalSearchParams(resolvedSearchParams, eventId, rankingType, regionId);
  const currentParams = new URLSearchParams();
  Object.entries(resolvedSearchParams).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach((item) => currentParams.append(key, item));
    else if (value !== undefined) currentParams.set(key, value);
  });
  if (canonicalParams.toString() !== currentParams.toString()) {
    const query = canonicalParams.toString();
    redirect(query ? `/?${query}` : "/");
  }
  const [initialRankings, continents, countries] = await Promise.all([
    getInitialRankings(resolvedSearchParams),
    fetchRegions("continent"),
    fetchRegions("country"),
  ]);
  const initialSearch = getSearchParam(resolvedSearchParams, "search").trim().slice(0, 80);
  const initialRegexSearch = getSearchParam(resolvedSearchParams, "mode") === "vim" && isValidRegexPattern(initialSearch);
  return (
    <RankingsExplorer
      initialData={initialRankings}
      initialSearch={initialSearch}
      initialRegexSearch={initialRegexSearch}
      initialEventId={eventId}
      initialRankingType={rankingType}
      initialRegionSelection={{ scope, regionId }}
      initialRegions={{ continents, countries }}
    />
  );
}
