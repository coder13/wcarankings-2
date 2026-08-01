"use client";

import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  rankingEntryKey,
  type InitialRankingData,
  type RankingEntry,
  type RankingPage,
} from "./types";
import {
  useRankingInfiniteQuery,
  rankingWindowQueryKey,
  type RankingQueryFilters,
} from "./rankingsQueries";

type RankingWindowUiState = {
  startRank: number;
  entriesRankingType: "single" | "average";
  loading: boolean;
  preserveListDuringLoad: boolean;
  loadingMore: boolean;
  loadingPrevious: boolean;
  error: string;
  focusNotice: string;
  listOffset: number;
  reloadNonce: number;
  highlightedPersonId: string;
  focusedExpandedPersonId: string;
  pagerNavigationBusy: boolean;
};

type RankingWindowState = RankingWindowUiState & {
  entries: RankingEntry[];
  startPosition: number;
  nextPageStart: number | null;
  previousPageStart: number | null;
  lastRank: number | null;
  total: number;
  exportDate: string | null;
  availableYears: number[];
  offlineStale: boolean;
  hasMore: boolean;
};

const EMPTY_PAGES: RankingPage[] = [];

function uniqueEntries(pages: RankingPage[]) {
  const seen = new Set<string>();
  return pages.flatMap((page) => page.entries.filter((entry) => {
    const key = rankingEntryKey(entry);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }));
}

export function useRankingWindow({
  initialData,
  rankingType,
  queryFilters,
  listKey,
}: {
  initialData?: InitialRankingData;
  rankingType: "single" | "average";
  queryFilters: RankingQueryFilters;
  listKey: string;
}) {
  const queryClient = useQueryClient();
  const [initialListKey] = useState(listKey);
  const [ui, setUi] = useState<RankingWindowUiState>(() => ({
    startRank: initialData?.startRank ?? 1,
    entriesRankingType: rankingType,
    loading: !initialData,
    preserveListDuringLoad: false,
    loadingMore: false,
    loadingPrevious: false,
    error: "",
    focusNotice: "",
    listOffset: 0,
    reloadNonce: 0,
    highlightedPersonId: "",
    focusedExpandedPersonId: "",
    pagerNavigationBusy: false,
  }));
  const query = useRankingInfiniteQuery(
    queryFilters,
    ui.startRank,
    initialListKey === listKey ? initialData : undefined,
  );
  const pages = query.data?.pages ?? EMPTY_PAGES;
  const queryKey = useMemo(
    () => rankingWindowQueryKey(queryFilters),
    [queryFilters],
  );
  const firstPage = pages[0];
  const lastPage = pages.at(-1);
  const entries = useMemo(() => uniqueEntries(pages), [pages]);

  const patch = useCallback((value: Partial<RankingWindowUiState>) => {
    setUi((current) => ({ ...current, ...value }));
  }, []);
  const replacePage = useCallback((
    page: RankingPage,
    options: {
      rankingType: "single" | "average";
      entries?: RankingEntry[];
      startPosition?: number;
    },
  ) => {
    queryClient.setQueryData(queryKey, {
      pages: [{
        ...page,
        entries: options.entries ?? page.entries,
        startPosition: options.startPosition ?? page.startPosition,
      }],
      pageParams: [ui.startRank],
    });
    setUi((current) => ({
      ...current,
      entriesRankingType: options.rankingType,
    }));
  }, [queryClient, queryKey, ui.startRank]);
  const reload = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: ["rankings", "page"],
      refetchType: "none",
    });
    setUi((current) => ({
      ...current,
      reloadNonce: current.reloadNonce + 1,
    }));
  }, [queryClient]);
  const actions = useMemo(
    () => ({ patch, replacePage, reload }),
    [patch, reload, replacePage],
  );
  const queryError = query.error instanceof Error
    ? query.error.message
    : query.isError
      ? "Rankings are unavailable."
      : "";
  const state = useMemo<RankingWindowState>(() => ({
    ...ui,
    entries,
    startPosition: firstPage?.startPosition ?? 0,
    nextPageStart: lastPage?.nextPageStart ?? null,
    previousPageStart: firstPage?.previousPageStart ?? null,
    lastRank: lastPage?.lastRank ?? null,
    total: lastPage?.total ?? Number.POSITIVE_INFINITY,
    exportDate: lastPage?.exportDate ?? null,
    availableYears: lastPage?.availableYears ?? [],
    offlineStale: Boolean(lastPage?.offlineStale),
    hasMore: lastPage?.hasMore ?? true,
    loading: ui.loading || query.isPending,
    error: ui.error || queryError,
  }), [
    entries,
    firstPage,
    lastPage,
    query.isPending,
    queryError,
    ui,
  ]);

  return { state, actions, query };
}
