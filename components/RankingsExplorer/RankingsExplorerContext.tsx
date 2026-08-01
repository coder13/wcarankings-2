"use client";

import { createContext, useContext } from "react";
import type { useRankingDataRuntime } from "./useRankingDataRuntime";
import type { useRankingInteractionRuntime } from "./useRankingInteractionRuntime";
import type { RankingCommands } from "./useRankingCommands";
import type { RankingsFilterState } from "./rankingsUrl";
import type { useVimNavigation } from "./useVimNavigation";
import type { RankingsExplorerConfig } from "./types";

export type RankingsExplorerContextValue = {
  config: RankingsExplorerConfig;
  filters: RankingsFilterState;
  data: Pick<
    ReturnType<typeof useRankingDataRuntime>,
    "window" | "pagination" | "reload" | "listMembers"
  >;
  interactions: ReturnType<typeof useRankingInteractionRuntime>;
  commands: RankingCommands;
  vim: ReturnType<typeof useVimNavigation>;
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
