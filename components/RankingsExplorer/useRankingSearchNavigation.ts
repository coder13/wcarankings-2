"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import {
  animateScrollTo,
  cancelScrollAnimation,
  getCurrentViewportSubRank,
  getSearchAnimationDuration,
  SCROLL_SETTLE_DELAY_MS,
} from "./scrollEngine";
import {
  centeredRowScrollTop,
} from "./helpers/navigation";
import { planSearchNavigation } from "./helpers/navigationPlan";
import { RANKING_ROW_HEIGHT } from "./rankingLayout";
import type { useRankingDataRuntime } from "./useRankingDataRuntime";
import type { RankingEntry } from "./types";

const SEARCH_ANIMATION_ROWS = 3;

type SearchLayoutAnchor = {
  requestEpoch: number;
  personId: string;
  viewportTop: number;
};

export function useRankingSearchNavigation({
  data,
}: {
  data: ReturnType<typeof useRankingDataRuntime>;
}) {
  const { dataSource, window: windowController, viewport, session } = data;
  const { entries } = windowController.state;
  const { getDistantSearchWindow, getPersonWindow } = dataSource.requests;
  const { rankingType } = dataSource.queryFilters;
  const { patch, replacePage } = windowController.actions;
  const {
    entriesRef,
    listRef,
    startRankRef,
    scrollStateRef,
    virtualizer,
    virtualizerRef,
  } = viewport;
  const {
    navigationEpochRef,
    navigationTargetRankRef,
    pendingNavigationAppendRef,
    pendingRankRef,
    pendingScrollDirectionRef,
    preserveListDuringLoadRef,
    skipPageLoadStartRef,
  } = session.refs;
  const animationTimerRef = useRef<number | null>(null);
  const transformOffsetRef = useRef(0);
  const pendingLayoutAnchorRef = useRef<SearchLayoutAnchor | null>(null);

  const cancelMotion = useCallback(() => {
    pendingLayoutAnchorRef.current = null;
    cancelScrollAnimation(scrollStateRef.current);
    if (animationTimerRef.current !== null) {
      window.clearTimeout(animationTimerRef.current);
      animationTimerRef.current = null;
    }
    const activeList = listRef.current;
    const activeTransform = transformOffsetRef.current;
    if (activeList && activeTransform !== 0) {
      activeList.style.transform = "";
      window.scrollBy({ top: -activeTransform, behavior: "auto" });
      transformOffsetRef.current = 0;
    }
  }, [listRef, scrollStateRef]);

  useLayoutEffect(() => {
    const anchor = pendingLayoutAnchorRef.current;
    if (!anchor) return;
    pendingLayoutAnchorRef.current = null;
    if (anchor.requestEpoch !== navigationEpochRef.current) return;
    const anchoredIndex = entries.findIndex(
      (entry) => entry.personId === anchor.personId,
    );
    if (anchoredIndex < 0) return;
    const measuredTop = virtualizer.getOffsetForIndex(
      anchoredIndex,
      "start",
    )?.[0];
    const absoluteTop = measuredTop ??
      (listRef.current?.getBoundingClientRect().top ?? 0) +
        window.scrollY + anchoredIndex * RANKING_ROW_HEIGHT;
    scrollStateRef.current.programmatic = true;
    window.scrollTo({
      top: Math.max(0, absoluteTop - anchor.viewportTop),
      behavior: "auto",
    });
  }, [entries, listRef, navigationEpochRef, scrollStateRef, virtualizer]);

  const jumpToMatch = useCallback((
    match: RankingEntry | undefined,
    direction: -1 | 1 = 1,
    currentMatch: RankingEntry | null = null,
  ) => {
    if (!match) return;
    const requestEpoch = navigationEpochRef.current + 1;
    navigationEpochRef.current = requestEpoch;
    cancelMotion();

    const currentMatchViewportTop = (() => {
      if (!currentMatch) return null;
      const mountedRow = Array.from(
        document.querySelectorAll<HTMLElement>(".listItem[data-person-id]"),
      ).find((row) => row.dataset.personId === currentMatch.personId);
      if (mountedRow) return mountedRow.getBoundingClientRect().top;
      const currentEntryIndex = entriesRef.current.findIndex(
        (entry) => entry.personId === currentMatch.personId,
      );
      if (currentEntryIndex < 0) return null;
      const measuredTop = virtualizerRef.current.getOffsetForIndex(
        currentEntryIndex,
        "start",
      )?.[0];
      return measuredTop === undefined ? null : measuredTop - window.scrollY;
    })();

    pendingNavigationAppendRef.current = false;
    pendingRankRef.current = match.subRank;
    navigationTargetRankRef.current = match.subRank;
    patch({ error: "", loading: true, preserveListDuringLoad: true });
    preserveListDuringLoadRef.current = true;
    const finish = () => {
      if (navigationEpochRef.current !== requestEpoch) return;
      patch({ loading: false, preserveListDuringLoad: false });
      preserveListDuringLoadRef.current = false;
    };

    const currentSearchSubRank = currentMatch?.subRank ??
      getCurrentViewportSubRank(
        listRef.current,
        entriesRef.current,
        startRankRef.current,
      );
    const plan = planSearchNavigation({
      currentMatch,
      match,
      fallbackCurrentRank: currentSearchSubRank,
      requestedDirection: direction,
    });
    pendingScrollDirectionRef.current = plan.direction;
    const pageRequest = plan.jumpMode === "multi-page" && plan.currentPageStart !== null
      ? getDistantSearchWindow(plan.currentPageStart, match, plan.direction)
      : getPersonWindow(match);

    void pageRequest
      .then((page) => {
        if (navigationEpochRef.current !== requestEpoch) return;
        const targetIndex = page.entries.findIndex(
          (entry) => entry.personId === match.personId,
        );
        if (targetIndex < 0) {
          throw new Error("Could not locate the selected ranking result.");
        }
        const currentIndex = currentMatch
          ? page.entries.findIndex(
              (entry) => entry.personId === currentMatch.personId,
            )
          : -1;
        if (currentMatch && currentMatchViewportTop !== null && currentIndex >= 0) {
          pendingLayoutAnchorRef.current = {
            requestEpoch,
            personId: currentMatch.personId,
            viewportTop: currentMatchViewportTop,
          };
        }

        const nextSearchStart = page.entries[0]?.subRank ?? 1;
        replacePage(page, { rankingType, entries: page.entries });
        patch({ highlightedPersonId: match.personId });
        if (nextSearchStart !== startRankRef.current) {
          skipPageLoadStartRef.current = nextSearchStart;
          patch({ startRank: nextSearchStart });
        }
        pendingScrollDirectionRef.current = null;

        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            if (navigationEpochRef.current !== requestEpoch) return;
            const list = listRef.current;
            if (!list) {
              finish();
              return;
            }
            const listTop = list.getBoundingClientRect().top + window.scrollY;
            const measuredTargetTop = virtualizerRef.current.getOffsetForIndex(
              targetIndex,
              "start",
            )?.[0];
            const naturalTargetTop = Math.max(
              0,
              measuredTargetTop ?? listTop + targetIndex * RANKING_ROW_HEIGHT,
            );
            const centeredTargetTop = centeredRowScrollTop(
              naturalTargetTop,
              window.innerHeight,
            );
            const centerRenderedMatch = () => {
              const targetRow = Array.from(
                document.querySelectorAll<HTMLElement>(
                  ".listItem[data-person-id]",
                ),
              ).find((row) => row.dataset.personId === match.personId);
              if (!targetRow) return false;
              const rect = targetRow.getBoundingClientRect();
              window.scrollTo({
                top: centeredRowScrollTop(
                  rect.top + window.scrollY,
                  window.innerHeight,
                  rect.height,
                ),
                behavior: "auto",
              });
              return true;
            };

            if (currentIndex >= 0) {
              const duration = getSearchAnimationDuration(
                plan.jumpMode,
                plan.peopleDistance,
              );
              animateScrollTo(
                scrollStateRef.current,
                centeredTargetTop,
                "smooth",
                duration,
              );
              animationTimerRef.current = window.setTimeout(() => {
                if (navigationEpochRef.current !== requestEpoch) return;
                if (!centerRenderedMatch()) {
                  const settledTargetTop =
                    virtualizerRef.current.getOffsetForIndex(
                      targetIndex,
                      "start",
                    )?.[0];
                  if (settledTargetTop !== undefined) {
                    window.scrollTo({
                      top: centeredRowScrollTop(
                        settledTargetTop,
                        window.innerHeight,
                      ),
                      behavior: "auto",
                    });
                  }
                }
                animationTimerRef.current = null;
                finish();
              }, duration + SCROLL_SETTLE_DELAY_MS);
              return;
            }

            const transformOffset =
              plan.direction * SEARCH_ANIMATION_ROWS * RANKING_ROW_HEIGHT;
            const animatedTargetTop = Math.max(
              0,
              centeredTargetTop + transformOffset,
            );
            const duration = getSearchAnimationDuration(
              "local",
              plan.peopleDistance,
            );
            window.scrollTo({ top: centeredTargetTop, behavior: "auto" });
            list.style.transform = `translateY(${transformOffset}px)`;
            transformOffsetRef.current = transformOffset;
            window.requestAnimationFrame(() => {
              if (navigationEpochRef.current !== requestEpoch) return;
              animateScrollTo(
                scrollStateRef.current,
                animatedTargetTop,
                "smooth",
                duration,
              );
              animationTimerRef.current = window.setTimeout(() => {
                if (navigationEpochRef.current !== requestEpoch) return;
                list.style.transform = "";
                transformOffsetRef.current = 0;
                window.scrollBy({ top: -transformOffset, behavior: "auto" });
                centerRenderedMatch();
                animationTimerRef.current = null;
                finish();
              }, duration + SCROLL_SETTLE_DELAY_MS);
            });
          });
        });
      })
      .catch((error: unknown) => {
        if (navigationEpochRef.current !== requestEpoch) return;
        patch({
          error: error instanceof Error
            ? error.message
            : "Rankings are unavailable.",
        });
        finish();
      });
  }, [
    cancelMotion,
    entriesRef,
    getDistantSearchWindow,
    getPersonWindow,
    listRef,
    navigationEpochRef,
    navigationTargetRankRef,
    patch,
    pendingNavigationAppendRef,
    pendingRankRef,
    pendingScrollDirectionRef,
    preserveListDuringLoadRef,
    rankingType,
    replacePage,
    scrollStateRef,
    skipPageLoadStartRef,
    startRankRef,
    virtualizerRef,
  ]);

  const reset = useCallback(() => {
    navigationEpochRef.current += 1;
    pendingScrollDirectionRef.current = null;
    cancelMotion();
    patch({ highlightedPersonId: "" });
  }, [cancelMotion, navigationEpochRef, patch, pendingScrollDirectionRef]);

  useEffect(() => cancelMotion, [cancelMotion]);

  return { jumpToMatch, reset, cancelMotion };
}
