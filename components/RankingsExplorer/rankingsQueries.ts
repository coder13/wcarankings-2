"use client";

import { queryOptions, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { RESULTS_PAGE_SIZE } from "@/lib/rankings-config";
import type { GenderFilter } from "@/lib/wca";
import type { MedalRankingType } from "@/lib/medal-rankings";
import type { PersonActivityMetric } from "./rankingsUrl";
import { rankingStatSource } from "@/lib/ranking-stat-sources";
import type { RankingResource } from "./helpers/rankingModes";
import type {
  InitialRankingData,
  RankingEntry,
  RankingPage,
  RankingSource,
  RegionSelection,
} from "./types";

const PAGE_SIZE = RESULTS_PAGE_SIZE;
const PAGE_STALE_TIME_MS = 5 * 60 * 1000;
const PR_STREAK_API = rankingStatSource("person-pr-streak").paths.api;

function personSearchEndpoint(resource: RankingResource) {
  if (resource === "results") return "/api/rankings/results";
  if (resource === "person-pr-streak") return PR_STREAK_API;
  return "/api/rankings";
}

export type RankingQueryFilters = {
  eventId: string;
  rankingType: "single" | "average";
  regionSelection: RegionSelection;
  resource: RankingResource;
  source?: RankingSource;
  gender: readonly GenderFilter[];
  year: number | null;
  medalType: MedalRankingType;
  personActivityMetric: PersonActivityMetric;
  membershipVersion?: number;
  rankingsDataVersion?: string | null;
};

const savedListVersionWindows = new Map<
  string,
  { membershipVersion: number; rankingsDataVersion: string }
>();

function savedListVersionKey(filters: RankingQueryFilters) {
  return filters.source?.kind === "saved"
    ? `${filters.source.listId}:${filters.eventId}:${filters.rankingType}`
    : null;
}

export function seedSavedListVersionWindow(
  filters: RankingQueryFilters,
  initialData?: InitialRankingData,
) {
  const key = savedListVersionKey(filters);
  if (
    !key ||
    !initialData?.cacheMembershipVersion ||
    !initialData.cacheDataVersion
  )
    return;
  savedListVersionWindows.set(key, {
    membershipVersion: initialData.cacheMembershipVersion,
    rankingsDataVersion: initialData.cacheDataVersion,
  });
}

function rankingPageStart(subRank: number) {
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
    filters.medalType,
    filters.personActivityMetric,
    filters.regionSelection.scope,
    filters.regionSelection.regionId,
    filters.gender.join(","),
    filters.resource === "people" ||
    filters.resource === "person-competition-count" ||
    filters.resource === "person-activity-rankings" ||
    filters.resource === "person-pr-streak" ||
    filters.resource === "person-medal-rankings"
      ? (filters.year ?? "all")
      : "all",
    filters.membershipVersion ?? "current",
    filters.rankingsDataVersion ?? "current",
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
  const versionKey = savedListVersionKey(filters);
  const versionWindow = versionKey
    ? savedListVersionWindows.get(versionKey)
    : null;
  if (
    versionWindow &&
    filters.regionSelection.scope === "world" &&
    filters.gender.length === 0
  ) {
    params.set("membershipVersion", String(versionWindow.membershipVersion));
    params.set("rankingsDataVersion", versionWindow.rankingsDataVersion);
  }
  if (
    (filters.resource === "people" ||
      filters.resource === "person-competition-count" ||
      filters.resource === "person-activity-rankings" ||
      filters.resource === "person-pr-streak" ||
      filters.resource === "person-medal-rankings") &&
    filters.year
  ) {
    params.set("year", String(filters.year));
  }
  if (
    (filters.resource === "people" ||
      filters.resource === "person-competition-count" ||
      filters.resource === "person-activity-rankings" ||
      filters.resource === "person-pr-streak" ||
      filters.resource === "person-medal-rankings" ||
      filters.resource === "results") &&
    filters.gender.length
  ) {
    params.set("gender", filters.gender.join(","));
  }
  if (filters.regionSelection.scope !== "world") {
    params.set("region", filters.regionSelection.regionId);
  }
  if (filters.resource === "person-activity-rankings") {
    params.set("metric", filters.personActivityMetric);
  }
}

export function rankingPageRequestUrl(
  filters: RankingQueryFilters,
  start: number,
) {
  const params = new URLSearchParams({
    start: String(
      filters.resource === "person-medal-rankings" ||
        filters.resource === "person-pr-streak" ||
        filters.resource === "person-activity-rankings"
        ? start
        : rankingPageStart(start),
    ),
    limit: String(PAGE_SIZE),
    paged: "1",
  });
  if (filters.resource !== "person-pr-streak") {
    params.set("result", filters.rankingType);
  }
  if (
    (filters.resource !== "person-medal-rankings" || filters.eventId !== "all") &&
    filters.resource !== "person-pr-streak" &&
    (filters.resource !== "person-activity-rankings" ||
      ["rounds", "solves"].includes(filters.personActivityMetric))
  ) {
    params.set("eventId", filters.eventId);
  }
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
    if (
      cityRanking === "competitors" ||
      cityRanking === "competitions" ||
      cityRanking === "solves"
    ) {
      params.set("stat", cityRanking);
    } else {
      params.set(
        "result",
        cityRanking === "fastest-average" ? "average" : "single",
      );
    }
  }
  if (filters.resource === "person-medal-rankings") {
    params.set("medal", filters.medalType);
  }
  if (filters.resource === "person-activity-rankings") {
    params.set("metric", filters.personActivityMetric);
  }

  let endpoint = "/api/rankings";
  if (filters.resource === "results") endpoint = "/api/rankings/results";
  else if (filters.resource === "person-competition-count") {
    endpoint = "/api/rankings/people/competitions";
  } else if (filters.resource === "person-activity-rankings") {
    endpoint = "/api/rankings/people/activity";
  } else if (filters.resource === "person-medal-rankings") {
    endpoint = "/api/rankings/people/medals";
  } else if (filters.resource === "person-pr-streak") {
    endpoint = PR_STREAK_API;
  } else if (filters.resource.startsWith("city-"))
    endpoint = "/api/rankings/cities";
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
  const response = await fetch(rankingPageRequestUrl(filters, start), {
    signal,
  });
  if (!response.ok) {
    const body = (await response.json()) as { error?: string };
    throw new Error(body.error ?? "Rankings are unavailable.");
  }
  type RawRankingEntry = RankingEntry & { position?: number };
  const data = (await response.json()) as Omit<RankingPage, "entries"> & {
    entries: RawRankingEntry[];
  };
  const versionKey = savedListVersionKey(filters);
  if (versionKey && data.cacheMembershipVersion && data.cacheDataVersion) {
    savedListVersionWindows.set(versionKey, {
      membershipVersion: data.cacheMembershipVersion,
      rankingsDataVersion: data.cacheDataVersion,
    });
  }
  return {
    entries: data.entries.map((entry) => ({
      ...entry,
      subRank: entry.subRank ?? entry.position ?? 0,
    })),
    hasMore: data.hasMore,
    nextPageStart: data.nextPageStart,
    previousPageStart: data.previousPageStart,
    startPosition: data.startPosition,
    lastRank: data.lastRank,
    total: data.total,
    exportDate: data.exportDate ?? null,
    availableYears: data.availableYears,
    cacheMembershipVersion: data.cacheMembershipVersion,
    cacheDataVersion:
      data.cacheDataVersion ?? response.headers.get("X-Rankings-Data-Version"),
    offlineStale: response.headers.get("X-Rankings-Offline-Stale") === "1",
  } satisfies RankingPage;
}

function rankingPageQueryOptions(filters: RankingQueryFilters, start: number) {
  const pageStart = rankingPageStart(start);
  return queryOptions({
    queryKey: [
      "rankings",
      "page",
      ...rankingFilterKey(filters),
      pageStart,
    ] as const,
    queryFn: ({ signal }) => requestRankingPage(filters, pageStart + 1, signal),
    staleTime: PAGE_STALE_TIME_MS,
  });
}

export function useRankingsQueryApi(filters: RankingQueryFilters) {
  const queryClient = useQueryClient();

  return useMemo(() => {
    const getPage = (start: number) =>
      queryClient.fetchQuery(rankingPageQueryOptions(filters, start));

    const getRange = async (
      start: number,
      count: number,
      signal?: AbortSignal,
    ) => {
      signal?.throwIfAborted();
      const end = Math.max(start, start + count);
      const firstPageStart = Math.floor(start / PAGE_SIZE) * PAGE_SIZE;
      const finalPageStart =
        Math.floor(Math.max(start, end - 1) / PAGE_SIZE) * PAGE_SIZE;
      const pageStarts = Array.from(
        { length: (finalPageStart - firstPageStart) / PAGE_SIZE + 1 },
        (_, index) => firstPageStart + index * PAGE_SIZE,
      );
      const pages = await Promise.all(
        pageStarts.map((pageStart) => getPage(pageStart + 1)),
      );
      signal?.throwIfAborted();
      const rows: Record<number, RankingEntry> = {};
      for (const page of pages) {
        page.entries.forEach((entry, entryIndex) => {
          const globalIndex =
            entry.subRank > 0
              ? entry.subRank - 1
              : page.startPosition + entryIndex;
          if (globalIndex >= start && globalIndex < end) {
            rows[globalIndex] = entry;
          }
        });
      }
      const metadata = pages.at(-1) ?? pages[0];
      return {
        rows,
        total: metadata?.total ?? 0,
        dataVersion:
          metadata?.cacheDataVersion ?? metadata?.exportDate ?? "current",
        exportDate: metadata?.exportDate ?? null,
        availableYears: metadata?.availableYears ?? [],
        offlineStale: Boolean(metadata?.offlineStale),
      };
    };

    const peopleFilters = {
      ...filters,
      resource: "people",
    } satisfies RankingQueryFilters;
    const searchRankings = async (
      search: string,
      regexSearch: boolean,
      signal: AbortSignal,
    ) => {
      const params = new URLSearchParams({
        result: filters.rankingType,
        search,
        searchLimit: "500",
      });
      if (
        filters.resource !== "person-activity-rankings" ||
        ["rounds", "solves"].includes(filters.personActivityMetric)
      ) {
        params.set("eventId", filters.eventId);
      }
      if (regexSearch) params.set("mode", "vim");
      addRankingFilterParams(params, filters);
      const endpoint = personSearchEndpoint(filters.resource);
      const response = await fetch(`${endpoint}?${params}`, { signal });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "Search is unavailable.");
      }
      return response.json() as Promise<{ entries: RankingEntry[] }>;
    };

    const locateRanking = (wcaId: string) =>
      queryClient.fetchQuery({
        queryKey: [
          "rankings",
          "locate",
          ...rankingFilterKey(peopleFilters),
          wcaId,
        ] as const,
        queryFn: async ({ signal }) => {
          const params = new URLSearchParams({
            eventId: filters.eventId,
            result: filters.rankingType,
            locate: wcaId,
          });
          addRankingFilterParams(params, peopleFilters);
          const endpoint =
            filters.resource === "person-pr-streak"
              ? PR_STREAK_API
              : "/api/rankings";
          const response = await fetch(`${endpoint}?${params}`, { signal });
          if (!response.ok) {
            const body = (await response.json()) as { error?: string };
            throw new Error(
              body.error ?? "Could not find this person in the rankings.",
            );
          }
          return response.json() as Promise<{ located: RankingEntry | null }>;
        },
        staleTime: PAGE_STALE_TIME_MS,
      });

    return {
      getRange,
      searchRankings,
      locateRanking,
    };
  }, [filters, queryClient]);
}
