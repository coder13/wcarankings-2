"use client";

import {
  useCallback,
  useMemo,
} from "react";
import {
  getCurrentViewportSubRank,
} from "./scrollEngine";
import type { useRankingsUrlState } from "./useRankingsUrlState";
import type { useRankingsSearch } from "./useRankingsSearch";
import { useRankingFocus } from "./useRankingFocus";
import type { RankingsFilterState } from "./rankingsUrl";
import type { useRankingDataRuntime } from "./useRankingDataRuntime";
import {
  pagerJumpTarget,
  planEndNavigation,
  planRankNavigation,
} from "./helpers/navigationPlan";
import {
  animateToLoadedEnd,
  animateToLoadedRanking,
} from "./helpers/navigationMotion";

type NavigationSearch = {
  controller: ReturnType<typeof useRankingsSearch>;
  cancelMotion: () => void;
};

export function useRankingNavigation({
  filters,
  data,
  search,
  url,
}: {
  filters: RankingsFilterState;
  data: ReturnType<typeof useRankingDataRuntime>;
  search: NavigationSearch;
  url: {
    state: Pick<
      ReturnType<typeof useRankingsUrlState>["state"],
      "focusMe" | "wcaId"
    >;
    write: ReturnType<typeof useRankingsUrlState>["write"];
  };
}) {
  const { dataSource, window, viewport, session } = data;
  const { entries, lastRank, total } = window.state;
  const { visibleSubRank } = viewport;
  const { refs } = session;
  const { finishPagerNavigation } = session.actions;
  const {
    subject,
    eventId,
    rankingType,
    regionSelection,
  } = filters;
  const { getPage, locateRanking } = dataSource.requests;
  const { patch, reload } = window.actions;
  const { state: urlState, write: writeUrl } = url;
  const {
    controller: searchController,
    cancelMotion: cancelSearchMotion,
  } = search;
  const {
    preserveOnNextRequest: preserveSearchOnNextRequest,
    reset: resetSearch,
    setOpen: setSearchOpen,
  } = searchController.actions;
  const searchQuery = searchController.state.query;
  const {
    containerRef,
    entriesRef,
    startRankRef,
    scrollStateRef,
    virtualizer,
  } = viewport;
  const {
    forcePageLoadRef,
    navigationEpochRef,
    navigationTargetRankRef,
    pagerNavigationBusyRef,
    pendingFocusLastRef,
    pendingFocusNoticeRef,
    pendingNavigationAppendRef,
    pendingNavigationRebaseRef,
    pendingPersonFocusRef,
    pendingRankRef,
    pendingScrollDirectionRef,
    pendingScrollToTopRef,
    preserveListDuringLoadRef,
  } = refs;
  const getCurrentRank = useCallback(() => {
    const navigationInProgress =
      scrollStateRef.current.active ||
      scrollStateRef.current.programmatic ||
      preserveListDuringLoadRef.current;
    if (navigationInProgress && navigationTargetRankRef.current !== null) {
      return navigationTargetRankRef.current;
    }
    return getCurrentViewportSubRank(
      containerRef.current,
      entriesRef.current,
      startRankRef.current,
    );
  }, [
    containerRef,
    entriesRef,
    navigationTargetRankRef,
    preserveListDuringLoadRef,
    scrollStateRef,
    startRankRef,
  ]);

  const queuePersonFocus = useCallback((personId: string, animate: boolean) => {
    patch({
      highlightedPersonId: personId,
      focusedExpandedPersonId: personId,
    });
    pendingPersonFocusRef.current = { personId, animate };
  }, [patch, pendingPersonFocusRef]);

  const clearPersonFocus = useCallback(() => {
    patch({
      highlightedPersonId: "",
      focusedExpandedPersonId: "",
    });
    if (urlState.wcaId || urlState.focusMe) {
      writeUrl({ wcaId: "", focusMe: false });
    }
  }, [patch, urlState.focusMe, urlState.wcaId, writeUrl]);

  const resetToRank = useCallback((
    rank: number,
    animate = true,
    focusedPersonId: string | null = null,
  ) => {
    navigationEpochRef.current += 1;
    cancelSearchMotion();
    pendingNavigationAppendRef.current = false;
    pendingNavigationRebaseRef.current = null;
    patch({ loading: false });
    if (!focusedPersonId) clearPersonFocus();

    const plan = planRankNavigation({
      requestedRank: rank,
      currentRank: getCurrentRank(),
      total,
      lastRank,
      entries,
      focusedPersonId,
      animate,
    });
    navigationTargetRankRef.current = plan.targetRank;
    pendingRankRef.current = plan.targetRank;
    if (focusedPersonId) queuePersonFocus(focusedPersonId, animate);
    else pendingPersonFocusRef.current = null;

    if (plan.targetRank === 1) {
      if (searchQuery.trim()) preserveSearchOnNextRequest();
      resetSearch();
      setSearchOpen(false);
      pendingFocusLastRef.current = false;
      pendingScrollDirectionRef.current = null;
      pendingScrollToTopRef.current = animate;
      preserveListDuringLoadRef.current = true;
      patch({ preserveListDuringLoad: true, startRank: 1 });
      forcePageLoadRef.current = true;
      reload();
      return;
    }

    pendingScrollToTopRef.current = false;
    pendingFocusLastRef.current = false;
    pendingScrollDirectionRef.current = plan.direction;
    pendingNavigationAppendRef.current = Boolean(
      pendingScrollDirectionRef.current,
    );
    const nextStart = plan.pageStart;
    if (!animate) {
      preserveListDuringLoadRef.current = true;
      patch({ preserveListDuringLoad: true, startRank: nextStart });
      if (nextStart === startRankRef.current) {
        forcePageLoadRef.current = true;
        reload();
      }
      return;
    }

    if (plan.usesLoadedWindow) {
      animateToLoadedRanking({
        scrollStateRef,
        containerRef,
        virtualizer,
        targetIndex: plan.targetIndex,
        focusedPersonId,
        distance: Math.abs(plan.targetRank - plan.currentRank),
        onComplete: pagerNavigationBusyRef.current
          ? finishPagerNavigation
          : undefined,
      });
      pendingPersonFocusRef.current = null;
      pendingScrollDirectionRef.current = null;
      return;
    }
    preserveListDuringLoadRef.current = true;
    patch({ preserveListDuringLoad: true, startRank: nextStart });
  }, [
    clearPersonFocus,
    containerRef,
    entries,
    finishPagerNavigation,
    forcePageLoadRef,
    getCurrentRank,
    lastRank,
    navigationEpochRef,
    navigationTargetRankRef,
    pagerNavigationBusyRef,
    patch,
    pendingFocusLastRef,
    pendingNavigationAppendRef,
    pendingNavigationRebaseRef,
    pendingPersonFocusRef,
    pendingRankRef,
    pendingScrollDirectionRef,
    pendingScrollToTopRef,
    preserveListDuringLoadRef,
    queuePersonFocus,
    reload,
    scrollStateRef,
    cancelSearchMotion,
    searchQuery,
    preserveSearchOnNextRequest,
    resetSearch,
    setSearchOpen,
    startRankRef,
    total,
    virtualizer,
  ]);

  const focus = useRankingFocus({
    filters: {
      subject,
      eventId,
      rankingType,
      regionSelection,
    },
    controllers: { locateRanking, patch, resetToRank },
    url,
    pendingFocusNoticeRef,
  });

  const jumpToEnd = useCallback(() => {
    const requestEpoch = navigationEpochRef.current + 1;
    navigationEpochRef.current = requestEpoch;
    cancelSearchMotion();
    pendingNavigationAppendRef.current = false;
    clearPersonFocus();
    patch({ loading: false });
    void getPage(1)
      .then((boundaryPage) => {
        if (requestEpoch !== navigationEpochRef.current) return;
        const plan = planEndNavigation({
          boundaryTotal: boundaryPage.total,
          boundaryLastRank: boundaryPage.lastRank,
          fallbackLastRank: lastRank,
          visibleRank: visibleSubRank,
          currentRank: getCurrentRank(),
          currentPageStart: startRankRef.current,
          entryCount: entriesRef.current.length,
        });
        navigationTargetRankRef.current = plan.targetRank;
        pendingRankRef.current = plan.targetRank;
        pendingScrollToTopRef.current = false;
        pendingFocusLastRef.current = true;
        pendingScrollDirectionRef.current = plan.direction;
        if (plan.usesLoadedWindow) {
          animateToLoadedEnd({
            scrollStateRef,
            containerRef,
            entryCount: entriesRef.current.length,
            distance: Math.abs(plan.targetRank - plan.currentRank),
          });
          pendingScrollDirectionRef.current = null;
          pendingFocusLastRef.current = false;
          return;
        }
        preserveListDuringLoadRef.current = true;
        patch({ preserveListDuringLoad: true, startRank: plan.pageStart });
      })
      .catch((error: unknown) => {
        if (requestEpoch !== navigationEpochRef.current) return;
        patch({
          error: error instanceof Error
            ? error.message
            : "Rankings are unavailable.",
        });
      });
  }, [
    clearPersonFocus,
    containerRef,
    entriesRef,
    getCurrentRank,
    getPage,
    lastRank,
    navigationEpochRef,
    navigationTargetRankRef,
    patch,
    pendingFocusLastRef,
    pendingNavigationAppendRef,
    pendingRankRef,
    pendingScrollDirectionRef,
    pendingScrollToTopRef,
    preserveListDuringLoadRef,
    scrollStateRef,
    cancelSearchMotion,
    startRankRef,
    visibleSubRank,
  ]);

  const jumpUp = useCallback(() => {
    if (pagerNavigationBusyRef.current) return;
    pagerNavigationBusyRef.current = true;
    patch({ pagerNavigationBusy: true });
    resetToRank(pagerJumpTarget(getCurrentRank(), -1, total));
  }, [getCurrentRank, pagerNavigationBusyRef, patch, resetToRank, total]);

  const jumpDown = useCallback(() => {
    if (pagerNavigationBusyRef.current) return;
    pagerNavigationBusyRef.current = true;
    patch({ pagerNavigationBusy: true });
    resetToRank(pagerJumpTarget(getCurrentRank(), 1, total));
  }, [getCurrentRank, pagerNavigationBusyRef, patch, resetToRank, total]);

  return useMemo(() => ({
    getCurrentRank,
    resetToRank,
    jumpToEnd,
    jumpUp,
    jumpDown,
    ...focus,
  }), [
    focus,
    getCurrentRank,
    jumpDown,
    jumpToEnd,
    jumpUp,
    resetToRank,
  ]);
}
