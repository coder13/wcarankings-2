"use client";

import { useCallback, useMemo } from "react";
import {
  rankingsFilterStateFromUrl,
  type RankingsFilterState,
  type RankingsUrlNavigation,
  type RankingsUrlUpdate,
} from "./rankingsUrl";
import { useRankingsUrlState } from "./useRankingsUrlState";

export type { RankingsFilterState } from "./rankingsUrl";

export type PatchRankingsFilters = (
  patch: Partial<RankingsFilterState>,
  navigation?: RankingsUrlNavigation,
  urlPatch?: RankingsUrlUpdate,
) => void;

export function useRankingsFilters() {
  const { state: urlState, write: writeUrl } = useRankingsUrlState();
  const filters = useMemo(
    () => rankingsFilterStateFromUrl(urlState),
    [urlState],
  );
  const patchFilters = useCallback<PatchRankingsFilters>((
    patch,
    navigation,
    urlPatch,
  ) => {
    writeUrl({ ...filters, ...patch, ...urlPatch }, navigation);
  }, [filters, writeUrl]);

  return { filters, patchFilters, urlState, writeUrl };
}
