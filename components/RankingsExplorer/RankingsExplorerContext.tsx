"use client";

import { createContext, useContext } from "react";
import type { ListMemberManagementController } from "./useListMemberManagement";
import type { RankingFocus } from "./useRankingFocus";
import type { RankingCommands } from "./useRankingCommands";
import type { useRankingsSearch } from "./useRankingsSearch";
import type { RankingFilterActions } from "./useRankingsState";
import type { RankingsFilterState } from "./rankingsUrl";
import type { useVimNavigation } from "./useVimNavigation";
import type { useVirtualRankings } from "./useVirtualRankings";
import type { RankingsExplorerConfig } from "./types";

export type RankingNavigation = {
  toRank: (rank: number, animate?: boolean) => void;
  toTop: () => void;
  toEnd: () => void;
  up: () => void;
  down: () => void;
};

export type RankingsExplorerContextValue = {
  config: RankingsExplorerConfig;
  filters: RankingsFilterState;
  filterActions: RankingFilterActions;
  rankings: ReturnType<typeof useVirtualRankings>;
  search: ReturnType<typeof useRankingsSearch>;
  focus: RankingFocus;
  listMembers: ListMemberManagementController;
  navigation: RankingNavigation;
  commands: RankingCommands;
  vim: ReturnType<typeof useVimNavigation>;
  hasScrolled: boolean;
};

export const RankingsExplorerContext =
  createContext<RankingsExplorerContextValue | null>(null);

export function useRankingsExplorer() {
  const value = useContext(RankingsExplorerContext);
  if (!value) {
    throw new Error("useRankingsExplorer must be used inside RankingsExplorer.");
  }
  return value;
}
