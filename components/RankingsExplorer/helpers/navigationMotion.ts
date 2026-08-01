import type { MutableRefObject, RefObject } from "react";
import {
  getScrollAnimationDuration,
  scrollToEntry,
  type ScrollAnimationState,
} from "../scrollEngine";
import {
  EXPANDED_RANKING_ROW_HEIGHT,
  RANKING_ROW_HEIGHT,
} from "../rankingLayout";
import type { useRankingViewport } from "../useRankingViewport";

const END_MARKER_PEEK = RANKING_ROW_HEIGHT + 40;

function renderedPersonTop(personId: string) {
  const row = Array.from(
    document.querySelectorAll<HTMLElement>(".listItem[data-person-id]"),
  ).find((element) => element.dataset.personId === personId);
  return row ? row.getBoundingClientRect().top + window.scrollY : undefined;
}

export function animateToLoadedRanking({
  scrollStateRef,
  containerRef,
  virtualizer,
  targetIndex,
  focusedPersonId,
  distance,
  onComplete,
}: {
  scrollStateRef: MutableRefObject<ScrollAnimationState>;
  containerRef: RefObject<HTMLDivElement | null>;
  virtualizer: ReturnType<typeof useRankingViewport>["virtualizer"];
  targetIndex: number;
  focusedPersonId: string | null;
  distance: number;
  onComplete?: () => void;
}) {
  scrollToEntry({
    state: scrollStateRef.current,
    list: containerRef.current,
    index: targetIndex,
    alignment: focusedPersonId ? "center" : "top",
    requestedBehavior: "smooth",
    requestedDuration: getScrollAnimationDuration(distance),
    rowHeight: focusedPersonId
      ? EXPANDED_RANKING_ROW_HEIGHT
      : RANKING_ROW_HEIGHT,
    targetOffset: () =>
      (focusedPersonId ? renderedPersonTop(focusedPersonId) : undefined) ??
      virtualizer.getOffsetForIndex(targetIndex, "start")?.[0],
    onComplete,
  });
}

export function animateToLoadedEnd({
  scrollStateRef,
  containerRef,
  entryCount,
  distance,
}: {
  scrollStateRef: MutableRefObject<ScrollAnimationState>;
  containerRef: RefObject<HTMLDivElement | null>;
  entryCount: number;
  distance: number;
}) {
  scrollToEntry({
    state: scrollStateRef.current,
    list: containerRef.current,
    index: Math.max(0, entryCount - 1),
    alignment: "bottom",
    bottomOffset: END_MARKER_PEEK,
    requestedBehavior: "smooth",
    requestedDuration: getScrollAnimationDuration(distance),
  });
}
