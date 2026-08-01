"use client";

import {
  useCallback,
  useEffect,
  useRef,
} from "react";
import { RESULTS_PAGE_SIZE } from "@/lib/rankings-config";
import {
  getPrefetchRowCount,
  shouldPrefetchExtraPage,
} from "./scrollEngine";
import {
  rankingPageStart,
} from "./rankingsQueries";
import { RANKING_ROW_HEIGHT } from "./rankingLayout";
import { useScrollVelocity } from "./useScrollVelocity";
import type { useRankingViewport } from "./useRankingViewport";
import type { useRankingWindow } from "./useRankingWindow";
import {
  rankingEntryKey,
  type RankingEntry,
  type RankingPage,
} from "./types";
import type { RankingDataSource } from "./useRankingDataSource";
import type { useRankingNavigationSession } from "./useRankingNavigationSession";

type NetworkInformationLike = {
  saveData?: boolean;
  effectiveType?: string;
};

type PaginationWindow = {
  state: Pick<
    ReturnType<typeof useRankingWindow>["state"],
    | "entries"
    | "nextPageStart"
    | "previousPageStart"
    | "hasMore"
    | "loading"
    | "listOffset"
    | "total"
  >;
  actions: Pick<
    ReturnType<typeof useRankingWindow>["actions"],
    "patch"
  >;
  query: Pick<
    ReturnType<typeof useRankingWindow>["query"],
    "fetchNextPage" | "fetchPreviousPage"
  >;
};

type PaginationViewport = Pick<
  ReturnType<typeof useRankingViewport>,
  "listRef" | "scrollStateRef" | "virtualizer" | "virtualRows"
>;

function mergePageEntries(
  entries: RankingEntry[],
  page: RankingPage,
  direction: -1 | 1,
) {
  const existingKeys = new Set(entries.map(rankingEntryKey));
  const uniquePageEntries = page.entries.filter(
    (entry) => !existingKeys.has(rankingEntryKey(entry)),
  );
  return direction === -1
    ? [...uniquePageEntries, ...entries]
    : [...entries, ...uniquePageEntries];
}

export function useRankingPagination({
  window: windowController,
  dataSource,
  viewport,
  session,
}: {
  window: PaginationWindow;
  dataSource: Pick<RankingDataSource, "requests">;
  viewport: PaginationViewport;
  session: ReturnType<typeof useRankingNavigationSession>;
}) {
  const { state, actions } = windowController;
  const {
    entries,
    nextPageStart,
    previousPageStart,
    hasMore,
    loading,
    listOffset,
    total,
  } = state;
  const { patch } = actions;
  const {
    activeListKeyRef,
    navigationEpochRef,
    navigationTargetRankRef,
    preserveListDuringLoadRef,
  } = session.refs;
  const { listRef, scrollStateRef, virtualizer, virtualRows } = viewport;
  const { requests } = dataSource;
  const { getPage } = requests;
  const { fetchNextPage, fetchPreviousPage } = windowController.query;
  const scrollVelocityRef = useScrollVelocity();
  const loadingMoreRef = useRef(false);
  const loadingPreviousRef = useRef(false);
  const rowFocusFrameRef = useRef<number | null>(null);

  const loadMore = useCallback(async () => {
    if (
      !nextPageStart ||
      !hasMore ||
      loadingMoreRef.current ||
      loading ||
      preserveListDuringLoadRef.current ||
      scrollStateRef.current.programmatic
    ) return;

    const requestEpoch = navigationEpochRef.current;
    const requestListKey = activeListKeyRef.current;
    loadingMoreRef.current = true;
    patch({ loadingMore: true });
    try {
      const connection = (navigator as Navigator & {
        connection?: NetworkInformationLike;
      }).connection;
      const followingPageStart = nextPageStart + RESULTS_PAGE_SIZE;
      if (
        followingPageStart <= total &&
        shouldPrefetchExtraPage({
          downwardPixelsPerMs: scrollVelocityRef.current.downwardPixelsPerMs,
          saveData: connection?.saveData,
          effectiveType: connection?.effectiveType,
        })
      ) {
        void getPage(followingPageStart).catch(() => undefined);
      }

      const infiniteResult = await fetchNextPage();
      const expectedStartPosition = rankingPageStart(nextPageStart);
      const cachedPage = [...(infiniteResult.data?.pages ?? [])]
        .reverse()
        .find((page) => page.startPosition === expectedStartPosition);
      const page = cachedPage ?? await getPage(nextPageStart);
      if (
        requestEpoch !== navigationEpochRef.current ||
        requestListKey !== activeListKeyRef.current ||
        preserveListDuringLoadRef.current ||
        scrollStateRef.current.programmatic
      ) return;
      return page;
    } catch (error) {
      patch({
        error: error instanceof Error
          ? error.message
          : "Could not load more rankings.",
      });
      return null;
    } finally {
      loadingMoreRef.current = false;
      patch({ loadingMore: false });
    }
  }, [
    activeListKeyRef,
    hasMore,
    fetchNextPage,
    getPage,
    loading,
    navigationEpochRef,
    nextPageStart,
    patch,
    preserveListDuringLoadRef,
    scrollStateRef,
    scrollVelocityRef,
    total,
  ]);

  const loadPrevious = useCallback(async () => {
    if (
      previousPageStart === null ||
      loadingPreviousRef.current ||
      loading ||
      preserveListDuringLoadRef.current ||
      scrollStateRef.current.programmatic
    ) return;

    const requestEpoch = navigationEpochRef.current;
    const requestListKey = activeListKeyRef.current;
    loadingPreviousRef.current = true;
    patch({ loadingPrevious: true });
    const previousListHeight = virtualizer.getTotalSize();
    try {
      const infiniteResult = await fetchPreviousPage();
      const expectedStartPosition = rankingPageStart(previousPageStart);
      const cachedPage = infiniteResult.data?.pages.find(
        (page) => page.startPosition === expectedStartPosition,
      );
      const page = cachedPage ?? await getPage(previousPageStart);
      if (
        requestEpoch !== navigationEpochRef.current ||
        requestListKey !== activeListKeyRef.current ||
        preserveListDuringLoadRef.current ||
        scrollStateRef.current.programmatic
      ) return;
      window.requestAnimationFrame(() => {
        const addedHeight = Math.max(
          0,
          virtualizer.getTotalSize() - previousListHeight,
        );
        if (addedHeight > 0) {
          window.scrollBy({ top: addedHeight, behavior: "auto" });
        }
      });
      return page;
    } catch (error) {
      patch({
        error: error instanceof Error
          ? error.message
          : "Could not load earlier rankings.",
      });
      return null;
    } finally {
      loadingPreviousRef.current = false;
      patch({ loadingPrevious: false });
    }
  }, [
    activeListKeyRef,
    fetchPreviousPage,
    getPage,
    loading,
    navigationEpochRef,
    patch,
    preserveListDuringLoadRef,
    previousPageStart,
    scrollStateRef,
    virtualizer,
  ]);

  const focusRowAtIndex = useCallback((index: number) => {
    virtualizer.scrollToIndex(index, { align: "auto" });
    if (rowFocusFrameRef.current !== null) {
      window.cancelAnimationFrame(rowFocusFrameRef.current);
    }
    let attemptsRemaining = 4;
    const focusWhenRendered = () => {
      rowFocusFrameRef.current = window.requestAnimationFrame(() => {
        const row = listRef.current?.querySelector<HTMLElement>(
          `[data-row-index="${index}"]`,
        );
        if (row) {
          row.focus({ preventScroll: true });
          rowFocusFrameRef.current = null;
          return;
        }
        attemptsRemaining -= 1;
        if (attemptsRemaining > 0) focusWhenRendered();
        else rowFocusFrameRef.current = null;
      });
    };
    focusWhenRendered();
  }, [listRef, virtualizer]);

  const navigateRow = useCallback(async (
    rowIndex: number,
    direction: -1 | 1,
  ) => {
    const targetIndex = rowIndex + direction;
    if (targetIndex >= 0 && targetIndex < entries.length) {
      focusRowAtIndex(targetIndex);
      return;
    }
    const anchor = entries[rowIndex];
    if (!anchor) return;
    if (direction === -1 && previousPageStart === null) return;
    if (direction === 1 && !hasMore) return;
    const page = direction === -1
      ? await loadPrevious()
      : await loadMore();
    if (!page) return;
    const mergedEntries = mergePageEntries(entries, page, direction);
    const anchorKey = rankingEntryKey(anchor);
    const anchorIndex = mergedEntries.findIndex(
      (entry) => rankingEntryKey(entry) === anchorKey,
    );
    const nextIndex = anchorIndex + direction;
    if (anchorIndex >= 0 && nextIndex >= 0 && nextIndex < mergedEntries.length) {
      focusRowAtIndex(nextIndex);
    }
  }, [
    entries,
    focusRowAtIndex,
    hasMore,
    loadMore,
    loadPrevious,
    previousPageStart,
  ]);

  useEffect(() => {
    const lastVirtualRow = virtualRows.at(-1);
    const prefetchRows = getPrefetchRowCount(
      scrollVelocityRef.current.downwardPixelsPerMs,
    );
    if (lastVirtualRow && lastVirtualRow.index >= entries.length - prefetchRows) {
      void loadMore();
    }
  }, [entries.length, loadMore, scrollVelocityRef, virtualRows]);

  useEffect(() => {
    let lastScrollY = window.scrollY;
    const onScroll = () => {
      if (
        !scrollStateRef.current.programmatic &&
        window.scrollY < lastScrollY &&
        window.scrollY <= listOffset + RANKING_ROW_HEIGHT * 14
      ) {
        navigationTargetRankRef.current = null;
        void loadPrevious();
      }
      lastScrollY = window.scrollY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [listOffset, loadPrevious, navigationTargetRankRef, scrollStateRef]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (
        !scrollStateRef.current.programmatic &&
        window.scrollY <= listOffset + RANKING_ROW_HEIGHT * 14
      ) void loadPrevious();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [entries.length, listOffset, loadPrevious, scrollStateRef]);

  useEffect(() => () => {
    if (rowFocusFrameRef.current !== null) {
      window.cancelAnimationFrame(rowFocusFrameRef.current);
    }
  }, []);

  return { loadMore, loadPrevious, navigateRow };
}
