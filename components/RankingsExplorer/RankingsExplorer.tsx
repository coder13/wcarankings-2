"use client";

import { useCallback, useMemo, useState } from "react";
import { RESULTS_PAGE_SIZE } from "@/lib/rankings-config";
import { FALLBACK_CONTINENTS, FALLBACK_COUNTRIES } from "@/lib/wca";
import { ViewportEdgeGradients } from "../ViewportEdgeGradients/ViewportEdgeGradients";
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
import {
  ListMemberManagementOverlays,
  useListMemberManagement,
} from "./useListMemberManagement";
import { useHasScrolled } from "./useRailScrollProgress";
import { useRankingCommands } from "./useRankingCommands";
import { useRankingFocus } from "./useRankingFocus";
import { useRankingsApi } from "./useRankingsApi";
import { useRankingsSearch } from "./useRankingsSearch";
import { useRankingsState } from "./useRankingsState";
import { useVimNavigation } from "./useVimNavigation";
import { useVirtualRankings } from "./useVirtualRankings";
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
  const state = useRankingsState();
  const api = useRankingsApi({
    filters: state.filters,
    initialData: initial?.data,
    source,
  });
  const [initialDataset] = useState(() => ({
    key: api.datasetKey,
    data: initial?.data,
  }));
  const rankings = useVirtualRankings({
    datasetKey: api.datasetKey,
    api: api.range,
    initialData: initialDataset.key === api.datasetKey
      ? initialDataset.data
      : undefined,
    expandableRows:
      state.filters.subject === "people" &&
      !state.filters.personCompetitionRanking,
  });
  const listMembers = useListMemberManagement({
    listId: list?.owner?.listId,
    onRemoved: rankings.reload,
  });
  const focus = useRankingFocus({
    filters: state.filters,
    api,
    rankings,
    url: state.url,
  });
  const search = useRankingsSearch({
    query: state.filters.search,
    regexSearch: state.filters.regexSearch,
    requestKey: api.datasetKey,
    request: api.search,
    onMatch: focus.jumpToEntry,
    onReset: focus.clearHighlight,
    patchFilters: state.patchFilters,
  });

  const toRank = useCallback((rank: number, animate = true) => {
    focus.clear();
    rankings.jumpToIndex(rank - 1, animate);
  }, [focus, rankings]);
  const navigation = useMemo(() => ({
    toRank,
    toTop: () => toRank(1),
    toEnd: () => toRank(rankings.total),
    up: () => toRank(rankings.currentIndex + 1 - 5_000),
    down: () => toRank(rankings.currentIndex + 1 + 5_000),
  }), [rankings.currentIndex, rankings.total, toRank]);
  const commands = useRankingCommands();
  const vim = useVimNavigation({
    getCurrentRank: () => rankings.currentIndex + 1,
    goToRank: navigation.toRank,
    goToEnd: navigation.toEnd,
    jumpSize: RESULTS_PAGE_SIZE * 2,
    search: {
      active: search.state.regexSearch,
      query: search.state.regexSearch ? search.state.query : "",
      reset: search.actions.reset,
      setOpen: search.actions.setOpen,
      start: search.actions.startRegexSearch,
    },
  });

  useExplorerKeyboardShortcuts({
    commands,
    search,
    vim,
    patchFilters: state.patchFilters,
    goToTop: navigation.toTop,
    goToEnd: navigation.toEnd,
  });

  const hasScrolled = useHasScrolled();
  const pagerEnabled =
    !listMembers.selection.active &&
    (!source || rankings.total > RESULTS_PAGE_SIZE);

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
        filters: state.filters,
        filterActions: state.actions,
        rankings,
        search,
        focus,
        listMembers,
        navigation,
        commands,
        vim,
        hasScrolled,
      }}
    >
      <RankingsAppShell>
        <ViewportEdgeGradients
          topVisible={hasScrolled}
          bottomVisible={pagerEnabled && (rankings.jumpAnimating || hasScrolled)}
        />
        <RankingsExplorerHeader />
        <RankingsTopRail />
        <main>
          <RankingsResults />
        </main>
        <RankingsNavigationFooter />
        <ListMemberManagementOverlays />
        <VimNavigationOverlay />
      </RankingsAppShell>
    </RankingsExplorerContext>
  );
}
