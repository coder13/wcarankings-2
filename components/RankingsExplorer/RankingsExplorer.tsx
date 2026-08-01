"use client";

import { RESULTS_PAGE_SIZE } from "@/lib/rankings-config";
import { FALLBACK_CONTINENTS, FALLBACK_COUNTRIES } from "@/lib/wca";
import { RankingsExplorerContext } from "./RankingsExplorerContext";
import { RankingsExplorerHeader } from "./RankingsExplorerHeader";
import { RankingsNavigationFooter } from "./RankingsNavigationFooter";
import { RankingsResults } from "./RankingsResults";
import { RankingsTopRail } from "./RankingsTopRail";
import {
  RankingsAppShell,
  VimNavigationOverlay,
} from "./VimNavigation";
import { useExplorerKeyboardShortcuts } from "./useExplorerKeyboardShortcuts";
import { ListMemberManagementOverlays } from "./useListMemberManagement";
import { useRankingBoundaryShortcuts } from "./useRankingBoundaryShortcuts";
import { useRankingCommands } from "./useRankingCommands";
import { useRankingDataRuntime } from "./useRankingDataRuntime";
import { useRankingInteractionRuntime } from "./useRankingInteractionRuntime";
import { useRankingsFilters } from "./useRankingsFilters";
import { useVimNavigation } from "./useVimNavigation";
import type {
  InitialRankingData,
  RankingsExplorerConfig,
  RankingsExplorerOptions,
  RankingsListConfig,
  RankingsRegions,
  RankingSource,
} from "./types";

type RankingsExplorerProps = {
  initial?: {
    data?: InitialRankingData;
    regions?: RankingsRegions;
    release?: RankingsExplorerConfig["release"];
  };
  options?: Partial<RankingsExplorerOptions>;
  source?: RankingSource;
  list?: RankingsListConfig;
};

export function RankingsExplorer({
  initial,
  options,
  source,
  list,
}: RankingsExplorerProps) {
  const url = useRankingsFilters();
  const data = useRankingDataRuntime({
    filters: url.filters,
    initialData: initial?.data,
    source,
    ownerListId: list?.owner?.listId,
  });
  const interactions = useRankingInteractionRuntime({
    filters: url.filters,
    patchFilters: url.patchFilters,
    url: { state: url.urlState, write: url.writeUrl },
    data,
  });
  const commands = useRankingCommands();
  const vim = useVimNavigation({
    getCurrentRank: interactions.navigation.getCurrentRank,
    goToRank: interactions.navigation.resetToRank,
    goToEnd: interactions.navigation.jumpToEnd,
    jumpSize: RESULTS_PAGE_SIZE * 2,
    search: {
      active: interactions.search.state.regexSearch,
      query: interactions.search.state.regexSearch
        ? interactions.search.state.query
        : "",
      reset: interactions.search.actions.reset,
      setOpen: interactions.search.actions.setOpen,
      start: interactions.search.actions.startRegexSearch,
    },
  });

  useRankingBoundaryShortcuts(interactions.navigation);
  useExplorerKeyboardShortcuts({
    commands,
    search: interactions.search,
    vim,
    patchFilters: url.patchFilters,
  });

  return (
    <RankingsExplorerContext
      value={{
        config: {
          source,
          list,
          regions: initial?.regions ?? {
            continents: FALLBACK_CONTINENTS,
            countries: FALLBACK_COUNTRIES,
          },
          options: {
            showAllEventRankingOptions:
              options?.showAllEventRankingOptions ?? false,
            showSubjectSwitch: options?.showSubjectSwitch ?? false,
            showMyRank: options?.showMyRank ?? true,
            regionSelectionDisabled:
              options?.regionSelectionDisabled ?? false,
          },
          release: initial?.release,
        },
        filters: url.filters,
        data: {
          window: data.window,
          pagination: data.pagination,
          reload: data.reload,
          listMembers: data.listMembers,
        },
        interactions,
        commands,
        vim,
      }}
    >
      <RankingsAppShell>
        <RankingsExplorerHeader />
        <RankingsTopRail />
        <main>
          <RankingsResults viewport={data.resultsViewport} />
          <RankingsNavigationFooter visibleRank={data.viewport.visibleSubRank} />
        </main>
        <ListMemberManagementOverlays />
        <VimNavigationOverlay />
      </RankingsAppShell>
    </RankingsExplorerContext>
  );
}
