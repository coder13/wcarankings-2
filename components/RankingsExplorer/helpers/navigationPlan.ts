import { RESULTS_PAGE_SIZE } from "@/lib/rankings-config";
import {
  clampTargetSubRank,
  getEndSubRank,
  getPagerJumpTarget,
  getSearchJumpMode,
} from "../scrollEngine";
import { getSearchScrollDirection } from "./navigation";
import { rankingPageStart } from "../rankingsQueries";
import type { RankingEntry } from "../types";

export function navigationDirection(
  target: number,
  current: number,
): -1 | 1 | null {
  if (target < current) return -1;
  if (target > current) return 1;
  return null;
}

export function planRankNavigation({
  requestedRank,
  currentRank,
  total,
  lastRank,
  entries,
  focusedPersonId,
  animate,
}: {
  requestedRank: number;
  currentRank: number;
  total: number;
  lastRank: number | null;
  entries: RankingEntry[];
  focusedPersonId: string | null;
  animate: boolean;
}) {
  const targetRank = clampTargetSubRank(requestedRank, total, lastRank);
  const direction = animate
    ? navigationDirection(targetRank, currentRank)
    : null;
  const firstLoadedRank = entries[0]?.subRank ?? Number.POSITIVE_INFINITY;
  const lastLoadedRank = entries.at(-1)?.subRank ?? 0;
  const usesLoadedWindow =
    animate && targetRank >= firstLoadedRank && targetRank <= lastLoadedRank;
  const focusedIndex = focusedPersonId
    ? entries.findIndex((entry) => entry.personId === focusedPersonId)
    : -1;
  const rankedIndex = entries.findIndex((entry) => entry.subRank >= targetRank);
  const requestedIndex = focusedIndex >= 0 ? focusedIndex : rankedIndex;
  let targetIndex = requestedIndex;
  if (targetIndex < 0) targetIndex = direction === -1 ? 0 : Math.max(0, entries.length - 1);

  return {
    targetRank,
    currentRank,
    direction,
    pageStart: rankingPageStart(targetRank) + 1,
    usesLoadedWindow,
    focusedIndex,
    targetIndex,
  };
}

export function planEndNavigation({
  boundaryTotal,
  boundaryLastRank,
  fallbackLastRank,
  visibleRank,
  currentRank,
  currentPageStart,
  entryCount,
}: {
  boundaryTotal: number;
  boundaryLastRank: number | null;
  fallbackLastRank: number | null;
  visibleRank: number;
  currentRank: number;
  currentPageStart: number;
  entryCount: number;
}) {
  const targetRank = getEndSubRank(
    boundaryTotal,
    boundaryLastRank ?? fallbackLastRank,
    visibleRank,
  );
  const pageStart = rankingPageStart(targetRank) + 1;
  return {
    targetRank,
    currentRank,
    pageStart,
    direction: navigationDirection(targetRank, currentRank),
    usesLoadedWindow: pageStart === currentPageStart && entryCount > 0,
  };
}

export function pagerJumpTarget(
  currentRank: number,
  direction: -1 | 1,
  total: number,
) {
  return getPagerJumpTarget(currentRank, direction, total);
}

export function planSearchNavigation({
  currentMatch,
  match,
  fallbackCurrentRank,
  requestedDirection,
}: {
  currentMatch: RankingEntry | null;
  match: RankingEntry;
  fallbackCurrentRank: number;
  requestedDirection: -1 | 1;
}) {
  const direction = getSearchScrollDirection(
    currentMatch,
    match,
    requestedDirection,
  );
  const targetPageStart = rankingPageStart(match.subRank);
  const currentPageStart = currentMatch
    ? rankingPageStart(currentMatch.subRank)
    : null;
  return {
    direction,
    targetPageStart,
    currentPageStart,
    peopleDistance: Math.abs(
      match.subRank - (currentMatch?.subRank ?? fallbackCurrentRank),
    ),
    jumpMode: currentPageStart === null
      ? "local" as const
      : getSearchJumpMode(
          currentPageStart,
          targetPageStart,
          direction,
          RESULTS_PAGE_SIZE,
        ),
  };
}
