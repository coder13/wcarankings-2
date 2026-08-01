"use client";

import { useEffect, useEffectEvent, useMemo } from "react";
import type { useRankingWindow } from "./useRankingWindow";
import { rankingPageStart } from "./rankingsQueries";
import type { RankingDataSource } from "./useRankingDataSource";
import type { useRankingNavigationSession } from "./useRankingNavigationSession";
import {
  applyLoadedPage,
  type PageLoaderViewport,
} from "./helpers/pageLoadMotion";
import type { RankingPage } from "./types";

export type { PendingPersonFocus } from "./helpers/pageLoadMotion";

type PageLoaderWindow = {
  state: Pick<
    ReturnType<typeof useRankingWindow>["state"],
    | "nextPageStart"
    | "previousPageStart"
    | "reloadNonce"
    | "startRank"
  >;
  actions: Pick<
    ReturnType<typeof useRankingWindow>["actions"],
    "patch" | "reload" | "replacePage"
  >;
};

export function shouldFallbackToFirstPage(
  startRank: number,
  entryCount: number,
) {
  return startRank > 1 && entryCount === 0;
}

export function useRankingPageLoader({
  pageKey,
  dataSource,
  window: windowController,
  viewport,
  session: navigationSession,
}: {
  pageKey: string;
  dataSource: Pick<
    RankingDataSource,
    "queryFilters" | "requests"
  >;
  window: PageLoaderWindow;
  viewport: PageLoaderViewport;
  session: ReturnType<typeof useRankingNavigationSession>;
}) {
  const { rankingType } = dataSource.queryFilters;
  const { refs } = navigationSession;
  const { finishPagerNavigation } = navigationSession.actions;
  const {
    getEndWindow,
    getNavigationWindow,
    getPage,
    getPersonWindow,
    locateRanking,
  } = dataSource.requests;
  const {
    state: { nextPageStart, previousPageStart, reloadNonce, startRank },
    actions: { patch, reload, replacePage },
  } = windowController;
  const readPageBoundaries = useEffectEvent(() => ({
    nextPageStart,
    previousPageStart,
  }));
  const {
    containerRef,
    entriesRef,
    startPositionRef,
    startRankRef,
    scrollStateRef,
    virtualizerRef,
  } = viewport;
  const loaderViewport = useMemo(() => ({
    containerRef,
    entriesRef,
    startPositionRef,
    startRankRef,
    scrollStateRef,
    virtualizerRef,
  }), [
    containerRef,
    entriesRef,
    scrollStateRef,
    startPositionRef,
    startRankRef,
    virtualizerRef,
  ]);
  const {
    forcePageLoadRef,
    initialPageKeyRef,
    navigationEpochRef,
    pendingFirstPageFallbackRef,
    pendingFocusLastRef,
    pendingFocusNoticeRef,
    pendingNavigationAppendRef,
    pendingPersonFocusRef,
    pendingRankRef,
    pendingScrollDirectionRef,
    pendingScrollToTopRef,
    preserveListDuringLoadRef,
    skipPageLoadStartRef,
  } = refs;

  useEffect(() => {
    const requestKey = `${pageKey}:${startRank}`;
    if (initialPageKeyRef.current === requestKey && !forcePageLoadRef.current) {
      return;
    }
    forcePageLoadRef.current = false;
    initialPageKeyRef.current = "";
    if (skipPageLoadStartRef.current === startRank) {
      skipPageLoadStartRef.current = null;
      return;
    }
    skipPageLoadStartRef.current = null;

    let active = true;
    let redirectedToFirstPage = false;
    const requestNavigationEpoch = navigationEpochRef.current;
    const shouldFallbackToTop = pendingFirstPageFallbackRef.current;
    patch({
      loading: true,
      error: "",
      ...(!pendingFocusNoticeRef.current ? { focusNotice: "" } : {}),
    });

    const focusLast = pendingFocusLastRef.current;
    pendingFocusLastRef.current = false;
    const personFocus = pendingPersonFocusRef.current;
    const focusMatch = personFocus
      ? { personId: personFocus.personId, subRank: pendingRankRef.current }
      : null;
    let pageRequest: Promise<RankingPage>;
    if (focusLast) pageRequest = getEndWindow(startRank);
    else if (focusMatch) pageRequest = getPersonWindow(focusMatch);
    else if (pendingNavigationAppendRef.current) {
      pageRequest = getNavigationWindow(pendingRankRef.current);
    } else pageRequest = getPage(startRank);

    pageRequest
      .then((page) => {
        if (!active || requestNavigationEpoch !== navigationEpochRef.current) {
          return;
        }
        if (
          shouldFallbackToTop &&
          shouldFallbackToFirstPage(startRank, page.entries.length)
        ) {
          redirectedToFirstPage = true;
          pendingFirstPageFallbackRef.current = false;
          pendingRankRef.current = 1;
          pendingScrollToTopRef.current = true;
          pendingScrollDirectionRef.current = null;
          pendingNavigationAppendRef.current = false;
          preserveListDuringLoadRef.current = true;
          patch({ preserveListDuringLoad: true, startRank: 1 });
          return;
        }
        if (shouldFallbackToTop) pendingFirstPageFallbackRef.current = false;

        const pageBoundaries = readPageBoundaries();
        applyLoadedPage({
          page,
          intent: { focusLast, focusMatch, personFocus },
          window: {
            nextPageStart: pageBoundaries.nextPageStart,
            previousPageStart: pageBoundaries.previousPageStart,
            rankingType,
            replacePage,
          },
          viewport: loaderViewport,
          session: {
            refs,
            finishPagerNavigation,
            isActive: () => active,
          },
        });
      })
      .catch((error: unknown) => {
        if (!active || requestNavigationEpoch !== navigationEpochRef.current) {
          return;
        }
        if (focusMatch) {
          void locateRanking(focusMatch.personId)
            .then(({ located }) => {
              if (
                !active ||
                requestNavigationEpoch !== navigationEpochRef.current
              ) return;
              if (located) {
                pendingFocusNoticeRef.current = "";
                navigationEpochRef.current += 1;
                pendingRankRef.current = located.subRank;
                pendingPersonFocusRef.current = {
                  personId: located.personId,
                  animate: false,
                };
                pendingScrollToTopRef.current = false;
                pendingScrollDirectionRef.current = null;
                pendingNavigationAppendRef.current = false;
                preserveListDuringLoadRef.current = true;
                forcePageLoadRef.current = true;
                patch({
                  focusNotice: "",
                  focusedExpandedPersonId: located.personId,
                  preserveListDuringLoad: true,
                  startRank: rankingPageStart(located.subRank) + 1,
                });
                reload();
                return;
              }
              const notice =
                "That person is not ranked for the selected event or filters.";
              patch({ focusedExpandedPersonId: "" });
              pendingPersonFocusRef.current = null;
              pendingFocusNoticeRef.current = notice;
              pendingRankRef.current = 1;
              pendingScrollToTopRef.current = true;
              pendingScrollDirectionRef.current = null;
              pendingNavigationAppendRef.current = false;
              preserveListDuringLoadRef.current = true;
              patch({
                preserveListDuringLoad: true,
                focusNotice: notice,
                startRank: 1,
              });
              reload();
              finishPagerNavigation();
            })
            .catch((locateError: unknown) => {
              if (
                !active ||
                requestNavigationEpoch !== navigationEpochRef.current
              ) return;
              patch({
                error: locateError instanceof Error
                  ? locateError.message
                  : "Rankings are unavailable.",
              });
              finishPagerNavigation();
            });
          return;
        }
        if (shouldFallbackToTop) pendingFirstPageFallbackRef.current = false;
        patch({
          error: error instanceof Error
            ? error.message
            : "Rankings are unavailable.",
        });
        finishPagerNavigation();
      })
      .finally(() => {
        if (!active || requestNavigationEpoch !== navigationEpochRef.current) {
          return;
        }
        if (redirectedToFirstPage) return;
        patch({ loading: false, preserveListDuringLoad: false });
        preserveListDuringLoadRef.current = false;
      });

    return () => {
      active = false;
    };
  }, [
    containerRef,
    entriesRef,
    finishPagerNavigation,
    forcePageLoadRef,
    getEndWindow,
    getNavigationWindow,
    getPage,
    getPersonWindow,
    initialPageKeyRef,
    loaderViewport,
    locateRanking,
    navigationEpochRef,
    pageKey,
    patch,
    pendingFirstPageFallbackRef,
    pendingFocusLastRef,
    pendingFocusNoticeRef,
    pendingNavigationAppendRef,
    pendingPersonFocusRef,
    pendingRankRef,
    pendingScrollDirectionRef,
    pendingScrollToTopRef,
    preserveListDuringLoadRef,
    rankingType,
    reload,
    reloadNonce,
    replacePage,
    refs,
    scrollStateRef,
    skipPageLoadStartRef,
    startPositionRef,
    startRank,
    startRankRef,
    virtualizerRef,
  ]);
}
