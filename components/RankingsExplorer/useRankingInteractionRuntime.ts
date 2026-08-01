"use client";

import type {
  PatchRankingsFilters,
  RankingsFilterState,
} from "./useRankingsFilters";
import type { useRankingsUrlState } from "./useRankingsUrlState";
import { useCancelRankingNavigationOnInput } from "./useExplorerKeyboardShortcuts";
import type { useRankingDataRuntime } from "./useRankingDataRuntime";
import { useRankingFilterActions } from "./useRankingFilterActions";
import { useRankingNavigation } from "./useRankingNavigation";
import { useRankingSearchNavigation } from "./useRankingSearchNavigation";
import { useRankingsSearch } from "./useRankingsSearch";

export function useRankingInteractionRuntime({
  filters,
  patchFilters,
  url,
  data,
}: {
  filters: RankingsFilterState;
  patchFilters: PatchRankingsFilters;
  url: Pick<ReturnType<typeof useRankingsUrlState>, "state" | "write">;
  data: ReturnType<typeof useRankingDataRuntime>;
}) {
  const { dataSource, window, viewport, session } = data;
  const searchNavigation = useRankingSearchNavigation({ data });
  const search = useRankingsSearch({
    query: filters.search,
    regexSearch: filters.regexSearch,
    requestKey: dataSource.listKey,
    request: dataSource.requests.searchRankings,
    onMatch: searchNavigation.jumpToMatch,
    onReset: searchNavigation.reset,
    onPrefetch: dataSource.requests.prefetchSearchResultPages,
    patchFilters,
  });
  const filterActions = useRankingFilterActions({
    state: filters,
    patchFilters,
    patchWindow: window.actions.patch,
    viewport,
    session,
    preserveSearchOnNextRequest: search.actions.preserveOnNextRequest,
  });
  const navigation = useRankingNavigation({
    filters,
    data,
    search: {
      controller: search,
      cancelMotion: searchNavigation.cancelMotion,
    },
    url,
  });

  useCancelRankingNavigationOnInput({
    viewport,
    searchNavigation,
    windowController: window,
    navigationSession: session,
  });

  return { search, filterActions, navigation };
}
