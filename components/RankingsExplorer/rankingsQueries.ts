"use client";

import {
  keepPreviousData,
  queryOptions,
  useInfiniteQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useMemo } from "react";
import { RESULTS_PAGE_SIZE } from "@/lib/rankings-config";
import type { GenderFilter } from "@/lib/wca";
import { getSearchBridgePageStarts } from "./scrollEngine";
import type { RankingResource } from "./helpers/rankingModes";
import type {
  InitialRankingData,
  RankingEntry,
  RankingPage,
  RankingSource,
  RegionSelection,
} from "./types";
import { rankingEntryKey } from "./types";

const PAGE_SIZE = RESULTS_PAGE_SIZE;
const PAGE_STALE_TIME_MS = 5 * 60 * 1000;
const SEARCH_PREFETCH_RADIUS = 3;

export type RankingQueryFilters = {
  eventId: string;
  rankingType: "single" | "average";
  regionSelection: RegionSelection;
  resource: RankingResource;
  source?: RankingSource;
  gender: readonly GenderFilter[];
  year: number | null;
};

export function rankingPageStart(subRank: number) {
  return Math.floor((Math.max(1, subRank) - 1) / PAGE_SIZE) * PAGE_SIZE;
}

function rankingSourceKey(source: RankingSource | undefined) {
  if (!source) return "all";
  return source.kind === "saved"
    ? `saved:${source.listId}`
    : `dynamic:${source.personIds.join(",")}`;
}

function rankingFilterKey(filters: RankingQueryFilters) {
  return [
    filters.resource,
    rankingSourceKey(filters.source),
    filters.eventId,
    filters.rankingType,
    filters.regionSelection.scope,
    filters.regionSelection.regionId,
    filters.gender.join(","),
    filters.resource === "people" ? filters.year ?? "all" : "all",
  ] as const;
}

export function rankingWindowQueryKey(filters: RankingQueryFilters) {
  return ["rankings", "window", ...rankingFilterKey(filters)] as const;
}

function addSourceParams(params: URLSearchParams, source?: RankingSource) {
  if (!source) return;
  if (source.kind === "saved") params.set("list", source.listId);
  else params.set("wca_ids", source.personIds.join(","));
}

function addRankingFilterParams(
  params: URLSearchParams,
  filters: RankingQueryFilters,
) {
  addSourceParams(params, filters.source);
  if (filters.resource === "people" && filters.year) {
    params.set("year", String(filters.year));
  }
  if ((filters.resource === "people" || filters.resource === "results") && filters.gender.length) {
    params.set("gender", filters.gender.join(","));
  }
  if (filters.regionSelection.scope !== "world") {
    params.set("region", filters.regionSelection.regionId);
  }
}

function pageRequest(filters: RankingQueryFilters, start: number) {
  const params = new URLSearchParams({
    eventId: filters.eventId,
    result: filters.rankingType,
    start: String(rankingPageStart(start)),
    limit: String(PAGE_SIZE),
    paged: "1",
  });
  addRankingFilterParams(params, filters);
  if (filters.resource === "podiums") params.set("ranking", "podium");
  if (filters.resource === "competitor-count") {
    params.set("ranking", "competitor-count");
  }
  if (filters.resource.startsWith("latitude-")) {
    params.set("ranking", "latitude");
    params.set("hemisphere", filters.resource.slice("latitude-".length));
  }
  if (filters.resource.startsWith("city-")) {
    const cityRanking = filters.resource.slice("city-".length);
    if (cityRanking === "competitors" || cityRanking === "competitions" || cityRanking === "solves") {
      params.set("stat", cityRanking);
    } else {
      params.set("result", cityRanking === "fastest-average" ? "average" : "single");
    }
  }

  let endpoint = "/api/rankings";
  if (filters.resource === "results") endpoint = "/api/rankings/results";
  else if (filters.resource.startsWith("city-")) endpoint = "/api/rankings/cities";
  else if (filters.resource !== "people") {
    endpoint = "/api/rankings/competitions";
  }
  return `${endpoint}?${params}`;
}

async function requestRankingPage(
  filters: RankingQueryFilters,
  start: number,
  signal?: AbortSignal,
) {
  const response = await fetch(pageRequest(filters, start), { signal });
  if (!response.ok) {
    const body = (await response.json()) as { error?: string };
    throw new Error(body.error ?? "Rankings are unavailable.");
  }
  const data = (await response.json()) as RankingPage;
  return {
    entries: data.entries,
    hasMore: data.hasMore,
    nextPageStart: data.nextPageStart,
    previousPageStart: data.previousPageStart,
    startPosition: data.startPosition,
    lastRank: data.lastRank,
    total: data.total,
    exportDate: data.exportDate ?? null,
    availableYears: data.availableYears,
    offlineStale: response.headers.get("X-Rankings-Offline-Stale") === "1",
  } satisfies RankingPage;
}

function rankingPageQueryOptions(
  filters: RankingQueryFilters,
  start: number,
) {
  const pageStart = rankingPageStart(start);
  return queryOptions({
    queryKey: ["rankings", "page", ...rankingFilterKey(filters), pageStart] as const,
    queryFn: ({ signal }) => requestRankingPage(filters, pageStart + 1, signal),
    staleTime: PAGE_STALE_TIME_MS,
  });
}

function initialRankingPage(initialData: InitialRankingData): RankingPage {
  return {
    entries: initialData.entries,
    hasMore: initialData.hasMore,
    nextPageStart: initialData.nextPageStart,
    previousPageStart: initialData.previousPageStart,
    startPosition: initialData.startPosition,
    lastRank: initialData.lastRank,
    total: initialData.total,
    exportDate: initialData.exportDate,
    availableYears: initialData.availableYears,
  };
}

export function useRankingInfiniteQuery(
  filters: RankingQueryFilters,
  start: number,
  initialData?: InitialRankingData,
) {
  const queryClient = useQueryClient();
  return useInfiniteQuery({
    queryKey: rankingWindowQueryKey(filters),
    initialPageParam: rankingPageStart(start) + 1,
    queryFn: ({ pageParam }) =>
      queryClient.fetchQuery(rankingPageQueryOptions(filters, pageParam)),
    getNextPageParam: (page) => page.nextPageStart ?? undefined,
    getPreviousPageParam: (page) => page.previousPageStart ?? undefined,
    initialData: initialData
      ? {
          pages: [initialRankingPage(initialData)],
          pageParams: [initialData.startRank],
        }
      : undefined,
    placeholderData: keepPreviousData,
    staleTime: PAGE_STALE_TIME_MS,
  });
}

function mergePages(pages: RankingPage[]) {
  const seen = new Set<string>();
  return pages.flatMap((page) => page.entries.filter((entry) => {
    const key = rankingEntryKey(entry);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }));
}

export function useRankingsQueryApi(filters: RankingQueryFilters) {
  const queryClient = useQueryClient();

  return useMemo(() => {
    const getPage = (start: number) => queryClient.fetchQuery(
      rankingPageQueryOptions(filters, start),
    );

    const getEndWindow = async (endSubRank: number) => {
      const finalPageStart = rankingPageStart(endSubRank);
      const pageStarts = [
        Math.max(0, finalPageStart - PAGE_SIZE),
        finalPageStart,
      ].filter((value, index, values) => values.indexOf(value) === index);
      const pages = await Promise.all(
        pageStarts.map((pageStart) => getPage(pageStart + 1)),
      );
      const firstPage = pages[0];
      const lastPage = pages.at(-1) ?? firstPage;
      return {
        ...lastPage,
        entries: mergePages(pages),
        startPosition: firstPage.startPosition,
        previousPageStart: firstPage.previousPageStart,
      };
    };

    const getNavigationWindow = async (targetSubRank: number) => {
      const targetPageStart = rankingPageStart(targetSubRank);
      const pages = (await Promise.all([
        targetPageStart,
        targetPageStart + PAGE_SIZE,
      ].map((pageStart) => getPage(pageStart + 1))))
        .filter((page) => page.entries.length > 0);
      const firstPage = pages[0];
      if (!firstPage) return getPage(targetPageStart + 1);
      const lastPage = pages.at(-1) ?? firstPage;
      return {
        ...lastPage,
        entries: mergePages(pages),
        startPosition: firstPage.startPosition,
        previousPageStart: firstPage.previousPageStart,
        nextPageStart: lastPage.nextPageStart,
      };
    };

    const peopleFilters = { ...filters, resource: "people" } satisfies RankingQueryFilters;
    const getPeoplePage = (start: number) => queryClient.fetchQuery(
      rankingPageQueryOptions(peopleFilters, start),
    );
    const getPersonWindow = async (
      match: Pick<RankingEntry, "personId" | "subRank">,
    ) => {
      const targetPageStart = rankingPageStart(match.subRank);
      const starts = [targetPageStart - PAGE_SIZE, targetPageStart, targetPageStart + PAGE_SIZE]
        .filter((value) => value >= 0)
        .filter((value, index, values) => values.indexOf(value) === index);
      const pages = await Promise.all(
        starts.map((pageStart) => getPeoplePage(pageStart + 1)),
      );
      const entries = mergePages(pages);
      if (!entries.some((entry) => entry.personId === match.personId)) {
        throw new Error("Could not locate the selected ranking result.");
      }
      const firstPage = pages[0];
      const lastPage = pages.at(-1) ?? firstPage;
      return {
        ...lastPage,
        entries,
        startPosition: firstPage.startPosition,
        previousPageStart: firstPage.previousPageStart,
        nextPageStart: lastPage.nextPageStart,
      };
    };

    const getDistantSearchWindow = async (
      currentPageStart: number,
      match: RankingEntry,
      direction: -1 | 1,
    ) => {
      const targetPageStart = rankingPageStart(match.subRank);
      const starts = [
        currentPageStart,
        ...getSearchBridgePageStarts(
          currentPageStart,
          targetPageStart,
          direction,
          PAGE_SIZE,
        ),
        targetPageStart - PAGE_SIZE,
        targetPageStart,
        targetPageStart + PAGE_SIZE,
      ]
        .filter((value) => value >= 0)
        .filter((value, index, values) => values.indexOf(value) === index)
        .sort((left, right) => left - right);
      const pages = (await Promise.all(
        starts.map((pageStart) => getPeoplePage(pageStart + 1)),
      )).filter((page) => page.entries.length > 0);
      const entries = mergePages(pages);
      if (!entries.some((entry) => entry.personId === match.personId)) {
        throw new Error("Could not locate the selected ranking result.");
      }
      const firstPage = pages[0];
      const lastPage = pages.at(-1) ?? firstPage;
      return {
        ...lastPage,
        entries,
        startPosition: firstPage.startPosition,
        previousPageStart: firstPage.previousPageStart,
        nextPageStart: lastPage.nextPageStart,
      };
    };

    const prefetchSearchResultPages = (
      matches: Array<RankingEntry | null | undefined>,
      currentMatchIndex: number,
    ) => {
      if (matches.length < 2 || currentMatchIndex < 0) return;
      const requested = new Set<number>();
      for (const direction of [-1, 1] as const) {
        for (let distance = 1; distance <= SEARCH_PREFETCH_RADIUS; distance += 1) {
          const matchIndex =
            (currentMatchIndex + direction * distance + matches.length) % matches.length;
          const match = matches[matchIndex];
          if (!match) continue;
          const requestKey = rankingPageStart(match.subRank);
          if (requested.has(requestKey)) continue;
          requested.add(requestKey);
          void getPersonWindow(match).catch(() => undefined);
        }
      }
    };

    const searchRankings = async (
      search: string,
      regexSearch: boolean,
      signal: AbortSignal,
    ) => {
      const params = new URLSearchParams({
        eventId: filters.eventId,
        result: filters.rankingType,
        search,
        searchLimit: "500",
      });
      if (regexSearch) params.set("mode", "vim");
      addRankingFilterParams(params, filters);
      const response = await fetch(
        `${filters.resource === "results"
          ? "/api/rankings/results"
          : "/api/rankings"}?${params}`,
        { signal },
      );
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "Search is unavailable.");
      }
      return response.json() as Promise<{ entries: RankingEntry[] }>;
    };

    const locateRanking = (wcaId: string) => queryClient.fetchQuery({
        queryKey: ["rankings", "locate", ...rankingFilterKey(peopleFilters), wcaId] as const,
        queryFn: async ({ signal }) => {
          const params = new URLSearchParams({
            eventId: filters.eventId,
            result: filters.rankingType,
            locate: wcaId,
          });
          addRankingFilterParams(params, peopleFilters);
          const response = await fetch(`/api/rankings?${params}`, { signal });
          if (!response.ok) {
            const body = (await response.json()) as { error?: string };
            throw new Error(body.error ?? "Could not find this person in the rankings.");
          }
          return response.json() as Promise<{ located: RankingEntry | null }>;
        },
        staleTime: PAGE_STALE_TIME_MS,
      });

    return {
      getPage,
      getEndWindow,
      getNavigationWindow,
      getPersonWindow,
      getDistantSearchWindow,
      prefetchSearchResultPages,
      searchRankings,
      locateRanking,
    };
  }, [filters, queryClient]);
}
