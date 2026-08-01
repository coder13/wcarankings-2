import { rankingEntryKey, type RankingEntry, type RankingPage } from "../types";

type PageLoadDirection = -1 | 1 | null;

type MergedPageWindow = {
  page: RankingPage;
  entries: RankingEntry[];
  startPosition: number;
};

export function mergePageWindow({
  page,
  previousEntries,
  previousStartPosition,
  append,
  direction,
  nextPageStart,
  previousPageStart,
}: {
  page: RankingPage;
  previousEntries: RankingEntry[];
  previousStartPosition: number;
  append: boolean;
  direction: PageLoadDirection;
  nextPageStart: number | null;
  previousPageStart: number | null;
}): MergedPageWindow {
  if (!append) {
    return { page, entries: page.entries, startPosition: page.startPosition };
  }

  const existingKeys = new Set(previousEntries.map(rankingEntryKey));
  const incomingEntries = page.entries.filter(
    (entry) => !existingKeys.has(rankingEntryKey(entry)),
  );
  const entries = direction === 1
    ? [...previousEntries, ...incomingEntries]
    : [...incomingEntries, ...previousEntries];
  return {
    page: {
      ...page,
      nextPageStart: direction === 1 ? page.nextPageStart : nextPageStart,
      previousPageStart: direction === -1
        ? page.previousPageStart
        : previousPageStart,
    },
    entries,
    startPosition: direction === -1
      ? page.startPosition
      : previousStartPosition,
  };
}

export function pageTargetIndex({
  entries,
  requestedRank,
  direction,
  focusLast,
  focusedPersonId,
}: {
  entries: RankingEntry[];
  requestedRank: number;
  direction: PageLoadDirection;
  focusLast: boolean;
  focusedPersonId?: string;
}) {
  const focusedIndex = focusedPersonId
    ? entries.findIndex((entry) => entry.personId === focusedPersonId)
    : -1;
  let requestedIndex = entries.findIndex(
    (entry) => entry.subRank >= requestedRank,
  );
  if (focusLast) requestedIndex = Math.max(0, entries.length - 1);
  else if (focusedIndex >= 0) requestedIndex = focusedIndex;

  let targetIndex = requestedIndex;
  if (targetIndex < 0) {
    targetIndex = direction === -1 ? Math.max(0, entries.length - 1) : 0;
  }
  return { focusedIndex, targetIndex };
}

export function pageTargetAlignment(
  focusLast: boolean,
  focusedIndex: number,
): "bottom" | "center" | "top" {
  if (focusLast) return "bottom";
  return focusedIndex >= 0 ? "center" : "top";
}
