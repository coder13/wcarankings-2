import type { ExplorerSubject } from "../../ExplorerSubjectSwitch/ExplorerSubjectSwitch";
import type { RankingEntry } from "../types";

export const SUBJECT_PATHS: Record<ExplorerSubject, string> = {
  people: "/",
  results: "/results",
  competitions: "/competitions/best-result",
};

export function subjectPath(subject: ExplorerSubject) {
  return SUBJECT_PATHS[subject];
}

export function centeredRowScrollTop(rowTop: number, viewportHeight: number, rowHeight = 65.45) {
  return Math.max(0, rowTop - Math.max(0, (viewportHeight - rowHeight) / 2));
}

export function getSearchScrollDirection(
  currentMatch: Pick<RankingEntry, "subRank"> | null,
  targetMatch: Pick<RankingEntry, "subRank">,
  fallbackDirection: -1 | 1,
): -1 | 1 {
  if (!currentMatch || currentMatch.subRank === targetMatch.subRank) return fallbackDirection;
  return targetMatch.subRank > currentMatch.subRank ? 1 : -1;
}
