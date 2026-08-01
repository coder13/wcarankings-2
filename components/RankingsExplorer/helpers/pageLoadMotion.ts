"use client";

import type { MutableRefObject } from "react";
import { flushSync } from "react-dom";
import {
  animateScrollTo,
  getCurrentViewportPosition,
  getCurrentViewportSubRank,
  getScrollAnimationDuration,
  scrollToEntry,
} from "../scrollEngine";
import {
  EXPANDED_RANKING_ROW_HEIGHT,
  RANKING_ROW_HEIGHT,
} from "../rankingLayout";
import type { useRankingViewport } from "../useRankingViewport";
import type { useRankingWindow } from "../useRankingWindow";
import { mergePageWindow, pageTargetAlignment, pageTargetIndex } from "./pageLoad";
import { rankingEntryKey, type RankingPage } from "../types";

const END_MARKER_PEEK = RANKING_ROW_HEIGHT + 40;

export type PendingPersonFocus = {
  personId: string;
  animate: boolean;
};

type PageLoaderRefs = {
  forcePageLoadRef: MutableRefObject<boolean>;
  initialPageKeyRef: MutableRefObject<string>;
  navigationEpochRef: MutableRefObject<number>;
  navigationTargetRankRef: MutableRefObject<number | null>;
  pagerNavigationBusyRef: MutableRefObject<boolean>;
  pendingFirstPageFallbackRef: MutableRefObject<boolean>;
  pendingFocusLastRef: MutableRefObject<boolean>;
  pendingFocusNoticeRef: MutableRefObject<string>;
  pendingNavigationAppendRef: MutableRefObject<boolean>;
  pendingNavigationRebaseRef: MutableRefObject<(() => void) | null>;
  pendingPersonFocusRef: MutableRefObject<PendingPersonFocus | null>;
  pendingRankRef: MutableRefObject<number>;
  pendingScrollDirectionRef: MutableRefObject<-1 | 1 | null>;
  pendingScrollToTopRef: MutableRefObject<boolean>;
  preserveListDuringLoadRef: MutableRefObject<boolean>;
  skipPageLoadStartRef: MutableRefObject<number | null>;
};

export type PageLoaderViewport = Pick<
  ReturnType<typeof useRankingViewport>,
  | "containerRef"
  | "entriesRef"
  | "startPositionRef"
  | "startRankRef"
  | "scrollStateRef"
  | "virtualizerRef"
>;

type ReplacePage = ReturnType<
  typeof useRankingWindow
>["actions"]["replacePage"];

function renderedPersonTop(personId: string) {
  const row = Array.from(
    document.querySelectorAll<HTMLElement>(".listItem[data-person-id]"),
  ).find((element) => element.dataset.personId === personId);
  return row ? row.getBoundingClientRect().top + window.scrollY : undefined;
}

export function applyLoadedPage({
  page,
  intent,
  window,
  viewport,
  session,
}: {
  page: RankingPage;
  intent: {
    focusLast: boolean;
    focusMatch: { personId: string; subRank: number } | null;
    personFocus: PendingPersonFocus | null;
  };
  window: {
    nextPageStart: number | null;
    previousPageStart: number | null;
    rankingType: "single" | "average";
    replacePage: ReplacePage;
  };
  viewport: PageLoaderViewport;
  session: {
    refs: PageLoaderRefs;
    finishPagerNavigation: () => void;
    isActive: () => boolean;
  };
}) {
  const { focusLast, focusMatch, personFocus } = intent;
  const {
    nextPageStart,
    previousPageStart,
    rankingType,
    replacePage,
  } = window;
  const {
    containerRef,
    entriesRef,
    startPositionRef,
    startRankRef,
    scrollStateRef,
    virtualizerRef,
  } = viewport;
  const { refs, finishPagerNavigation, isActive } = session;
  const {
    navigationTargetRankRef,
    pagerNavigationBusyRef,
    pendingNavigationAppendRef,
    pendingNavigationRebaseRef,
    pendingPersonFocusRef,
    pendingRankRef,
    pendingScrollDirectionRef,
    pendingScrollToTopRef,
  } = refs;

  const currentPosition = getCurrentViewportPosition(
    containerRef.current,
    entriesRef.current,
    startPositionRef.current,
    virtualizerRef.current.getVirtualItems()[0]?.index,
  );
  const currentSubRank = getCurrentViewportSubRank(
    containerRef.current,
    entriesRef.current,
    startRankRef.current,
  );
  const scrollToTop = pendingScrollToTopRef.current;
  const pendingDirection = pendingScrollDirectionRef.current;
  const rankForStep = pendingRankRef.current;
  const appendNavigation =
    pendingNavigationAppendRef.current &&
    !scrollToTop &&
    !focusLast &&
    !focusMatch &&
    Boolean(pendingDirection);
  const previousEntries = entriesRef.current;
  const previousStartPosition = startPositionRef.current;
  const previousListHeight = appendNavigation && pendingDirection === -1
    ? virtualizerRef.current.getTotalSize()
    : null;
  const mergedWindow = mergePageWindow({
    page,
    previousEntries,
    previousStartPosition,
    append: appendNavigation,
    direction: pendingDirection,
    nextPageStart,
    previousPageStart,
  });
  const loadedEntries = mergedWindow.entries;

  pendingScrollToTopRef.current = false;
  pendingNavigationAppendRef.current = false;
  entriesRef.current = loadedEntries;
  startPositionRef.current = mergedWindow.startPosition;
  flushSync(() => {
    replacePage(mergedWindow.page, {
      rankingType,
      entries: loadedEntries,
      startPosition: mergedWindow.startPosition,
    });
  });
  virtualizerRef.current.measure();

  const { focusedIndex: focusedTargetIndex, targetIndex } = pageTargetIndex({
    entries: loadedEntries,
    requestedRank: rankForStep,
    direction: pendingDirection,
    focusLast,
    focusedPersonId: personFocus?.personId,
  });

  const rebaseAppendedWindow = appendNavigation
    ? () => {
        if (!isActive()) return;
        const list = containerRef.current;
        const targetEntry = loadedEntries[targetIndex];
        const rebasedTargetIndex = targetEntry
          ? page.entries.findIndex(
              (entry) =>
                rankingEntryKey(entry) === rankingEntryKey(targetEntry),
            )
          : -1;
        const oldListTop = list
          ? list.getBoundingClientRect().top + globalThis.window.scrollY
          : 0;
        const oldTargetOffset =
          virtualizerRef.current.getOffsetForIndex(targetIndex, "start")?.[0] ??
          targetIndex * RANKING_ROW_HEIGHT;
        const targetViewportTop =
          oldListTop + oldTargetOffset - globalThis.window.scrollY;

        scrollStateRef.current.programmatic = true;
        entriesRef.current = page.entries;
        startPositionRef.current = page.startPosition;
        flushSync(() => replacePage(page, { rankingType }));
        virtualizerRef.current.measure();
        globalThis.window.requestAnimationFrame(() => {
          const nextListTop = containerRef.current
            ? containerRef.current.getBoundingClientRect().top +
              globalThis.window.scrollY
            : 0;
          const nextIndex = Math.max(0, rebasedTargetIndex);
          const nextTargetOffset =
            virtualizerRef.current.getOffsetForIndex(nextIndex, "start")?.[0] ??
            nextIndex * RANKING_ROW_HEIGHT;
          globalThis.window.scrollTo({
            top: Math.max(
              0,
              nextListTop + nextTargetOffset - targetViewportTop,
            ),
            behavior: "auto",
          });
          globalThis.window.requestAnimationFrame(() => {
            scrollStateRef.current.programmatic = false;
            navigationTargetRankRef.current = null;
            finishPagerNavigation();
          });
        });
      }
    : null;
  pendingNavigationRebaseRef.current = rebaseAppendedWindow;
  const finishNavigation = () => {
    const rebase = pendingNavigationRebaseRef.current;
    pendingNavigationRebaseRef.current = null;
    if (rebase) rebase();
    else finishPagerNavigation();
  };
  const shouldScrollToTarget = Boolean(
    scrollToTop ||
      focusLast ||
      pendingDirection ||
      appendNavigation ||
      focusedTargetIndex >= 0,
  );
  if (focusedTargetIndex >= 0) pendingPersonFocusRef.current = null;
  pendingScrollDirectionRef.current = null;

  if (scrollToTop) {
    animateScrollTo(
      scrollStateRef.current,
      0,
      "smooth",
      getScrollAnimationDuration(currentPosition),
      pagerNavigationBusyRef.current ? finishPagerNavigation : undefined,
    );
    return;
  }
  if (!shouldScrollToTarget) return;

  if (previousListHeight !== null) {
    globalThis.window.requestAnimationFrame(() => {
      const addedHeight = Math.max(
        0,
        virtualizerRef.current.getTotalSize() - previousListHeight,
      );
      if (addedHeight > 0) {
        globalThis.window.scrollBy({ top: addedHeight, behavior: "auto" });
      }
    });
  }
  globalThis.window.requestAnimationFrame(() => {
    scrollToEntry({
      state: scrollStateRef.current,
      list: containerRef.current,
      index: targetIndex,
      alignment: pageTargetAlignment(focusLast, focusedTargetIndex),
      bottomOffset: focusLast ? END_MARKER_PEEK : 0,
      requestedBehavior:
        focusedTargetIndex >= 0 && !personFocus?.animate ? "auto" : "smooth",
      requestedDuration: getScrollAnimationDuration(
        Math.abs(rankForStep - currentSubRank),
      ),
      rowHeight: focusedTargetIndex >= 0
        ? EXPANDED_RANKING_ROW_HEIGHT
        : RANKING_ROW_HEIGHT,
      targetOffset: focusLast
        ? undefined
        : () =>
            (personFocus
              ? renderedPersonTop(personFocus.personId)
              : undefined) ??
            virtualizerRef.current.getOffsetForIndex(targetIndex, "start")?.[0],
      onComplete:
        rebaseAppendedWindow || pagerNavigationBusyRef.current
          ? finishNavigation
          : undefined,
    });
  });
}
