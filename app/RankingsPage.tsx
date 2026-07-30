import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { RankingsExplorer } from "@/components/RankingsExplorer/RankingsExplorer";
import type {
  RankingEntry,
  RankingPage,
} from "@/components/RankingsExplorer/types";
import { RESULTS_PAGE_SIZE } from "@/lib/rankings-config";
import { isEventId, isRankingEventId, isRankingType, isValidRegexPattern, normalizeGenderFilters, parseRegionQuery, type GenderFilter, WCA_EVENTS } from "@/lib/wca";
import { getRegions } from "@/lib/regions";
import { loadRankings } from "@/lib/rankings";
import { loadCompetitionRankings } from "@/lib/semantic-entity-rankings";
import { loadResultRankings } from "@/lib/semantic-result-rankings";
import { getAuthUser } from "@/lib/auth";

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

function getGenderFilters(searchParams: Record<string, string | string[] | undefined>): GenderFilter[] {
  const raw = searchParams.gender;
  const values = (Array.isArray(raw) ? raw : raw ? [raw] : []).flatMap((value) => value.split(","));
  return normalizeGenderFilters(values.filter((value): value is GenderFilter => value === "m" || value === "f" || value === "o"));
}

function getCanonicalSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
  eventId: string,
  rankingType: "single" | "average",
  regionId: string,
  gender: readonly GenderFilter[],
  allEventRankingId: "SOR" | null,
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
  if (allEventRankingId) params.set("eventId", allEventRankingId);
  else if (eventId === "333") params.delete("eventId");
  else params.set("eventId", eventId);
  if (eventId === "sor-kinch" || rankingType === "single") params.delete("result");
  else params.set("result", rankingType);
  if (regionId) params.set("region", regionId);
  else params.delete("region");
  if (eventId === "sor-kinch" && regionId && getSearchParam(searchParams, "kinch") === "continent")
    params.set("kinch", "continent");
  else params.delete("kinch");
  if (gender.length) params.set("gender", gender.join(","));
  else params.delete("gender");
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
  focusedWcaId = "",
  yearOverride: number | null = null,
) {
  const rawEventId = getSearchParamWithLegacyKey(searchParams, "eventId", "event");
  const rawRankingType = getSearchParamWithLegacyKey(searchParams, "result", "type");
  const eventId = isRankingEventId(rawEventId) ? rawEventId : "333";
  const rankingType = eventId === "333mbf" || eventId === "sor-kinch" ? "single" : isRankingType(rawRankingType) ? rawRankingType : "single";
  const { scope, regionId } = parseRegionQuery(getSearchParam(searchParams, "region"));
  const gender = getGenderFilters(searchParams);
  const year = yearOverride === null ? getSearchParam(searchParams, "year") : String(yearOverride);
  const yearParams: Record<string, string> = /^\d{4}$/.test(year) ? { year } : {};
  const search = getSearchParam(searchParams, "search").trim().slice(0, 80);
  const regexSearch = getSearchParam(searchParams, "mode") === "vim" && isValidRegexPattern(search);
  const searchResult = search
    ? await fetchRankings(
        new URLSearchParams({
          eventId,
          result: rankingType,
          search,
          searchLimit: "500",
          ...(regexSearch ? { mode: "vim" } : {}),
          ...(scope === "world" ? {} : { region: regionId }),
          ...(gender.length ? { gender: gender.join(",") } : {}),
          ...yearParams,
        }),
      )
    : null;
  const focusedResult = focusedWcaId
    ? await fetchRankings(
        new URLSearchParams({
          eventId,
          result: rankingType,
          locate: focusedWcaId,
          ...(scope === "world" ? {} : { region: regionId }),
          ...(gender.length ? { gender: gender.join(",") } : {}),
          ...yearParams,
        }),
      ) as unknown as { located: RankingEntry | null }
    : null;
  const searchMatches = searchResult && Array.isArray(searchResult.entries)
    ? searchResult.entries
    : [];
  const firstMatch = focusedResult?.located ?? searchMatches[0];
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
          ...(gender.length ? { gender: gender.join(",") } : {}),
          ...yearParams,
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
    exportDate: lastPage.exportDate ?? null,
    availableYears: lastPage.availableYears ?? [],
    startRank,
    searchMatches,
    initialMatchPersonId: firstMatch?.personId ?? "",
    regexSearch,
    gender,
  };
}

async function getInitialCompetitionRankings(
  eventId: (typeof WCA_EVENTS)[number]["id"],
  rankingType: "single" | "average",
  competitionRanking: "best-result" | "podiums" | "competitor-count" | "latitude",
  latitudeHemisphere: "north" | "south",
  regionId: string,
  gender: readonly GenderFilter[],
) {
  const loaded = await loadCompetitionRankings(new URLSearchParams({
    eventId,
    result: rankingType,
    start: "0",
    limit: String(PAGE_SIZE),
    paged: "1",
    ...(regionId ? { region: regionId } : {}),
    ...(competitionRanking === "podiums"
      ? { ranking: "podium" }
      : competitionRanking === "latitude"
        ? { ranking: "latitude", hemisphere: latitudeHemisphere }
        : competitionRanking === "competitor-count"
          ? { ranking: "competitor-count" }
        : {}),
  }));
  const data = loaded.data as RankingsResponse;
  return {
    entries: data.entries,
    hasMore: data.hasMore ?? false,
    nextPageStart: data.nextPageStart ?? null,
    previousPageStart: data.previousPageStart ?? null,
    startPosition: data.startPosition ?? 0,
    lastRank: data.lastRank ?? null,
    total: data.total ?? 0,
    exportDate: data.exportDate ?? null,
    startRank: 1,
    searchMatches: [],
    initialMatchPersonId: "",
    regexSearch: false,
  };
}

async function getInitialResultRankings(
  searchParams: Record<string, string | string[] | undefined>,
  eventId: (typeof WCA_EVENTS)[number]["id"],
  rankingType: "single" | "average",
  regionId: string,
  gender: readonly GenderFilter[],
) {
  const search = getSearchParam(searchParams, "search").trim().slice(0, 80);
  const regexSearch = getSearchParam(searchParams, "mode") === "vim" && isValidRegexPattern(search);
  const common = { eventId, result: rankingType, ...(regionId ? { region: regionId } : {}), ...(gender.length ? { gender: gender.join(",") } : {}) };
  const searched = search ? await loadResultRankings(new URLSearchParams({ ...common, search, searchLimit: "500", ...(regexSearch ? { mode: "vim" } : {}) })) : null;
  const searchMatches = searched ? searched.data.entries as RankingEntry[] : [];
  const firstMatch = searchMatches[0];
  const targetPageStart = pageFirstSubRank(firstMatch?.subRank ?? 1);
  const pageStarts = firstMatch ? [targetPageStart - PAGE_SIZE, targetPageStart, targetPageStart + PAGE_SIZE].filter((start) => start > 0) : [1];
  const pages = await Promise.all(pageStarts.map((startRank) => loadResultRankings(new URLSearchParams({ ...common, start: String(startRank - 1), limit: String(PAGE_SIZE) }))));
  const pageData = pages.map((page) => page.data as RankingsResponse);
  const firstPage = pageData[0];
  const lastPage = pageData.at(-1) ?? firstPage;
  return {
    entries: pageData.flatMap((page) => page.entries),
    hasMore: lastPage.hasMore ?? false,
    nextPageStart: lastPage.nextPageStart ?? null,
    previousPageStart: firstPage.previousPageStart ?? null,
    startPosition: firstPage.startPosition ?? Math.max(0, pageStarts[0] - 1),
    lastRank: lastPage.lastRank ?? null,
    total: lastPage.total ?? 0,
    exportDate: lastPage.exportDate ?? null,
    startRank: pageStarts[0],
    searchMatches,
    initialMatchPersonId: firstMatch?.entryKey ?? firstMatch?.personId ?? "",
    regexSearch,
  };
}

export type SearchParams = Record<string, string | string[] | undefined>;

export async function RankingsPage({
  searchParams,
  pathname = "/",
  initialYearOverride,
  initialSubject = "people",
  initialCompetitionRanking = "best-result",
}: {
  searchParams: Promise<SearchParams>;
  pathname?: string;
  initialYearOverride?: number | null;
  initialSubject?: "people" | "results" | "competitions";
  initialCompetitionRanking?: "best-result" | "podiums" | "competitor-count" | "latitude";
}) {
  const resolvedSearchParams = await searchParams;
  const latitudeHemisphere =
    getSearchParam(resolvedSearchParams, "hemisphere") === "south"
      ? "south"
      : "north";
  const rawEventId = getSearchParamWithLegacyKey(resolvedSearchParams, "eventId", "event");
  const rawRankingType = getSearchParamWithLegacyKey(resolvedSearchParams, "result", "type");
  const parsedEventId = initialSubject === "people"
    ? isRankingEventId(rawEventId) ? rawEventId : "333"
    : isEventId(rawEventId) ? rawEventId : "333";
  const eventId =
    initialSubject === "competitions" &&
    initialCompetitionRanking === "podiums" &&
    parsedEventId === "333mbf"
      ? "333"
      : parsedEventId;
  const initialAllEventRankingId =
    initialSubject === "people" && rawEventId === "SOR" ? rawEventId : null;
  const rankingType = initialSubject === "competitions" && initialCompetitionRanking === "podiums"
    ? ["333bf", "444bf", "555bf"].includes(eventId) ? "single" : "average"
    : eventId === "333mbf" || eventId === "sor-kinch"
      ? "single"
      : isRankingType(rawRankingType) ? rawRankingType : "single";
  const { scope, regionId } = parseRegionQuery(getSearchParam(resolvedSearchParams, "region"));
  const gender = (initialSubject === "people" || initialSubject === "results") ? getGenderFilters(resolvedSearchParams) : [];
  const initialYear = initialYearOverride ?? (/^\d{4}$/.test(getSearchParam(resolvedSearchParams, "year")) ? Number(getSearchParam(resolvedSearchParams, "year")) : null);
  const requestedWcaId = getSearchParam(resolvedSearchParams, "wcaId")
    .trim()
    .toUpperCase();
  const focusedWcaId = requestedWcaId || (
    getSearchParam(resolvedSearchParams, "focus") === "me"
      ? (await getAuthUser(new Request("http://localhost", { headers: await headers() })))?.wcaId ?? ""
      : ""
  );
  const canonicalParams = getCanonicalSearchParams(
    resolvedSearchParams,
    eventId,
    rankingType,
    regionId,
    gender,
    initialAllEventRankingId,
  );
  if (initialSubject === "competitions" && initialCompetitionRanking === "podiums") {
    canonicalParams.delete("result");
  }
  if (initialSubject === "competitions" && initialCompetitionRanking === "latitude") {
    canonicalParams.delete("eventId");
    canonicalParams.delete("result");
    if (latitudeHemisphere === "south") canonicalParams.set("hemisphere", "south");
    else canonicalParams.delete("hemisphere");
  } else {
    canonicalParams.delete("hemisphere");
  }
  if (initialSubject === "competitions" && initialCompetitionRanking === "competitor-count") {
    canonicalParams.delete("eventId");
    canonicalParams.delete("result");
  }
  const currentParams = new URLSearchParams();
  Object.entries(resolvedSearchParams).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach((item) => currentParams.append(key, item));
    else if (value !== undefined) currentParams.set(key, value);
  });
  if (canonicalParams.toString() !== currentParams.toString()) {
    const query = canonicalParams.toString();
    redirect(query ? `${pathname}?${query}` : pathname);
  }
  const initialRankingsRequest = initialSubject === "people"
    ? getInitialRankings(
      resolvedSearchParams,
      focusedWcaId,
      initialYear,
    )
    : initialSubject === "results"
      ? getInitialResultRankings(resolvedSearchParams, eventId as (typeof WCA_EVENTS)[number]["id"], rankingType, regionId, gender)
    : initialSubject === "competitions"
      ? getInitialCompetitionRankings(
          eventId as (typeof WCA_EVENTS)[number]["id"],
          initialCompetitionRanking === "podiums"
            ? ["333bf", "444bf", "555bf"].includes(eventId) ? "single" : "average"
            : rankingType,
          initialCompetitionRanking,
          latitudeHemisphere,
          regionId,
        )
      : Promise.resolve(undefined);
  const [initialRankings, continents, countries] = await Promise.all([
    initialRankingsRequest,
    fetchRegions("continent"),
    fetchRegions("country"),
  ]);
  const initialSearch = getSearchParam(resolvedSearchParams, "search").trim().slice(0, 80);
  const initialRegexSearch = getSearchParam(resolvedSearchParams, "mode") === "vim" && isValidRegexPattern(initialSearch);
  return (
    <RankingsExplorer
      key={`${initialSubject}:${initialCompetitionRanking}:${initialYear ?? "all"}`}
      initialData={initialRankings}
      initialSearch={initialSearch}
      initialRegexSearch={initialRegexSearch}
      initialEventId={eventId}
      initialRankingType={rankingType}
      initialGender={gender}
      initialYear={initialYear}
      initialRegionSelection={{ scope, regionId }}
      initialRegions={{ continents, countries }}
      initialSubject={initialSubject}
      initialCompetitionRanking={initialCompetitionRanking}
      initialLatitudeHemisphere={latitudeHemisphere}
      showSubjectSwitch
      showAllEventRankingOptions
    />
  );
}
