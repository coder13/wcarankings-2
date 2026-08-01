"use client";

import { useCallback } from "react";
import type { RankingsFilterState } from "./rankingsUrl";
import { useListMemberManagement } from "./useListMemberManagement";
import { useRankingDataSource } from "./useRankingDataSource";
import { useRankingNavigationSession } from "./useRankingNavigationSession";
import { useRankingPageLoader } from "./useRankingPageLoader";
import { useRankingPagination } from "./useRankingPagination";
import { useRankingViewport } from "./useRankingViewport";
import { useRankingWindow } from "./useRankingWindow";
import type { InitialRankingData, RankingSource } from "./types";

export function useRankingDataRuntime({
  filters,
  initialData,
  source,
  ownerListId,
}: {
  filters: RankingsFilterState;
  initialData?: InitialRankingData;
  source?: RankingSource;
  ownerListId?: string;
}) {
  const dataSource = useRankingDataSource({ filters, source, initialData });
  const window = useRankingWindow({
    initialData,
    rankingType: filters.rankingType,
    queryFilters: dataSource.queryFilters,
    listKey: dataSource.listKey,
  });
  const { patch, reload: reloadWindow } = window.actions;
  const updateListOffset = useCallback(
    (listOffset: number) => patch({ listOffset }),
    [patch],
  );
  const viewport = useRankingViewport({
    entries: window.state.entries,
    startRank: window.state.startRank,
    startPosition: window.state.startPosition,
    listOffset: window.state.listOffset,
    focusedExpandedPersonId: window.state.focusedExpandedPersonId,
    expandableRows: filters.subject === "people",
    hasMore: window.state.hasMore,
    loading: window.state.loading,
    loadingPrevious: window.state.loadingPrevious,
    measurementKey: dataSource.listKey,
    onListOffsetChange: updateListOffset,
  });
  const session = useRankingNavigationSession({
    pageKey: dataSource.listKey,
    initialPageRequestKey: initialData
      ? `${dataSource.listKey}:${initialData.startRank}`
      : "",
    patchWindow: patch,
  });
  const reload = useCallback(() => {
    session.actions.forceNextPageLoad();
    patch({ startRank: 1 });
    reloadWindow();
  }, [patch, reloadWindow, session.actions]);
  const listMembers = useListMemberManagement({
    listId: ownerListId,
    onRemoved: reload,
  });
  const pagination = useRankingPagination({
    window,
    dataSource,
    viewport,
    session,
  });

  useRankingPageLoader({
    pageKey: dataSource.listKey,
    dataSource,
    window,
    viewport,
    session,
  });

  return {
    dataSource,
    window,
    viewport,
    resultsViewport: viewport.rendering,
    session,
    pagination,
    reload,
    listMembers,
  };
}
