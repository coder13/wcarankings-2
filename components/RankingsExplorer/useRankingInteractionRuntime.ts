"use client";

import type {
  PatchRankingsFilters,
  RankingsFilterState,
} from "./useRankingsFilters";
import type { useRankingsUrlState } from "./useRankingsUrlState";
import type { useRankingDataRuntime } from "./useRankingDataRuntime";
import { useRankingFilterActions } from "./useRankingFilterActions";
import { useRankingNavigation } from "./useRankingNavigation";
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
  const navigation = useRankingNavigation({
    filters,
    dataSource: data.dataSource,
    rankings: data.rankings,
    url,
  });
  const search = useRankingsSearch({
    query: filters.search,
    regexSearch: filters.regexSearch,
    requestKey: data.dataSource.listKey,
    request: data.dataSource.requests.searchRankings,
    onMatch: navigation.jumpToEntry,
    onReset: navigation.clearHighlight,
    patchFilters,
  });
  const filterActions = useRankingFilterActions({
    state: filters,
    patchFilters,
  });

  return { search, filterActions, navigation };
}
