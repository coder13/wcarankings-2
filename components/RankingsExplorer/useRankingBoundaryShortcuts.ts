"use client";

import { useEffect } from "react";
import type { useRankingNavigation } from "./useRankingNavigation";

type BoundaryNavigation = Pick<
  ReturnType<typeof useRankingNavigation>,
  "jumpToEnd" | "resetToRank"
>;

export function useRankingBoundaryShortcuts({
  jumpToEnd,
  resetToRank,
}: BoundaryNavigation) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const isEditable = target instanceof Element &&
        target.matches("input, textarea, select, [contenteditable='true']");
      if (isEditable || event.altKey || event.shiftKey) return;
      const toTop =
        (event.metaKey && !event.ctrlKey && event.key === "ArrowUp") ||
        (event.ctrlKey && !event.metaKey && event.key === "Home");
      const toBottom =
        (event.metaKey && !event.ctrlKey && event.key === "ArrowDown") ||
        (event.ctrlKey && !event.metaKey && event.key === "End");
      if (!toTop && !toBottom) return;
      event.preventDefault();
      if (event.repeat) return;
      if (toTop) resetToRank(1);
      else jumpToEnd();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [jumpToEnd, resetToRank]);
}
