"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  useWindowVirtualizer,
  type VirtualItem,
} from "@tanstack/react-virtual";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { flushSync } from "react-dom";
import {
  EXPANDED_RANKING_ROW_HEIGHT,
  RANKING_ROW_HEIGHT,
} from "./rankingLayout";
import type { InitialRankingData, RankingEntry } from "./types";
import { useInterruptibleWindowScroll } from "./useInterruptibleWindowScroll";
import { useRankingListOffset } from "./useRankingListOffset";
import { useSingleExpandedVirtualRow } from "./useSingleExpandedVirtualRow";

const WINDOW_ROWS = 500;
const RANGE_CACHE_BUCKET_ROWS = 50;
const RECENTER_EDGE_ROWS = 100;
const RECENTER_TARGET_ROW = 250;
const OVERSCAN_ROWS = 12;
const MAX_JUMP_ANIMATION_ROWS = 250;
const JUMP_VIEWPORT_ANCHOR = 1 / 3;
const RANGE_CACHE_TIME_MS = 5 * 60 * 1000;
const JUMP_ANIMATION_DURATION_SECONDS = 0.6;
const JUMP_ANIMATION_EASE = [0.32, 0.72, 0, 1] as const;
const ROW_EXPANSION_DURATION_SECONDS = 0.2;
const ROW_EXPANSION_EASE = [0.2, 0.7, 0.2, 1] as const;

const subscribeHydration = () => () => {};

type RankingRange = {
  rows: Record<number, RankingEntry>;
  total: number;
  dataVersion: string;
  exportDate: string | null;
  availableYears: number[];
  offlineStale: boolean;
};

export type RankingsRangeApi = {
  cacheKey: string;
  fetchRange: (
    request: { start: number; count: number },
    signal: AbortSignal,
  ) => Promise<RankingRange>;
};

export type VirtualRankingItem = VirtualItem & {
  globalIndex: number;
  entry: RankingEntry | null;
  rankIsDuplicate: boolean;
  expanded: boolean;
  expandedContentHeight: number;
  expansionProgress: number;
};

function initialRows(initialData?: InitialRankingData) {
  if (!initialData) return {} as Record<number, RankingEntry>;
  return Object.fromEntries(
    initialData.entries.map((entry, index) => [
      initialData.startPosition + index,
      entry,
    ]),
  ) as Record<number, RankingEntry>;
}

function staticVirtualItems(
  initialData: InitialRankingData | undefined,
  baseIndex: number,
  listOffset: number,
) {
  if (!initialData) return [];
  return initialData.entries.flatMap((_, index) => {
    const globalIndex = initialData.startPosition + index;
    const localIndex = globalIndex - baseIndex;
    if (localIndex < 0 || localIndex >= WINDOW_ROWS) return [];
    const start = listOffset + localIndex * RANKING_ROW_HEIGHT;
    return [
      {
        index: localIndex,
        key: globalIndex,
        start,
        end: start + RANKING_ROW_HEIGHT,
        size: RANKING_ROW_HEIGHT,
        lane: 0,
      } satisfies VirtualItem,
    ];
  });
}

export function useVirtualRankings({
  datasetKey,
  api,
  initialData,
  expandableRows,
}: {
  datasetKey: string;
  api: RankingsRangeApi;
  initialData?: InitialRankingData;
  expandableRows: boolean;
}) {
  const listOffset = useRankingListOffset();
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false,
  );
  const [windowState, setWindowState] = useState({
    datasetKey,
    baseIndex: 0,
  });
  if (windowState.datasetKey !== datasetKey) {
    setWindowState({ datasetKey, baseIndex: 0 });
  }
  const baseIndex =
    windowState.datasetKey === datasetKey ? windowState.baseIndex : 0;
  const rangeStart =
    Math.floor(Math.max(0, baseIndex - 1) / RANGE_CACHE_BUCKET_ROWS) *
    RANGE_CACHE_BUCKET_ROWS;
  const rangeCount = WINDOW_ROWS + RANGE_CACHE_BUCKET_ROWS;
  const rangeQuery = useQuery({
    queryKey: [
      "rankings",
      "virtual-range",
      api.cacheKey,
      datasetKey,
      rangeStart,
      rangeCount,
    ] as const,
    queryFn: async ({ signal }) => ({
      datasetKey,
      ...(await api.fetchRange(
        { start: rangeStart, count: rangeCount },
        signal,
      )),
    }),
    placeholderData: (previous) =>
      previous?.datasetKey === datasetKey
        ? keepPreviousData(previous)
        : undefined,
    staleTime: Infinity,
    gcTime: RANGE_CACHE_TIME_MS,
  });
  const range =
    rangeQuery.data?.datasetKey === datasetKey ? rangeQuery.data : null;
  const total = range?.total ?? initialData?.total ?? 0;
  const windowCount = Math.min(WINDOW_ROWS, total);
  const maximumBaseIndex = Math.max(0, total - windowCount);
  const edgeRows = Math.min(RECENTER_EDGE_ROWS, Math.floor(windowCount / 2));
  const targetLocalIndex = Math.min(
    RECENTER_TARGET_ROW,
    Math.max(0, windowCount - edgeRows),
  );
  const scrollAnimation = useInterruptibleWindowScroll({
    duration: JUMP_ANIMATION_DURATION_SECONDS,
    ease: JUMP_ANIMATION_EASE,
  });
  const expansion = useSingleExpandedVirtualRow({
    totalRows: total,
    rowHeight: RANKING_ROW_HEIGHT,
    expandedRowHeight: EXPANDED_RANKING_ROW_HEIGHT,
    duration: ROW_EXPANSION_DURATION_SECONDS,
    ease: ROW_EXPANSION_EASE,
  });
  const virtualizer = useWindowVirtualizer({
    count: windowCount,
    estimateSize: (localIndex) => expansion.rowSize(baseIndex + localIndex),
    getItemKey: (localIndex) => `${datasetKey}:${baseIndex + localIndex}`,
    overscan: OVERSCAN_ROWS,
    scrollMargin: listOffset,
  });

  const resizeGlobalRow = useCallback(
    (globalIndex: number, size: number) => {
      const localIndex = globalIndex - baseIndex;
      if (localIndex < 0 || localIndex >= windowCount) return;
      virtualizer.resizeItem(localIndex, size);
    },
    [baseIndex, virtualizer, windowCount],
  );

  const previousDatasetKeyRef = useRef(datasetKey);
  useLayoutEffect(() => {
    if (previousDatasetKeyRef.current === datasetKey) return;
    previousDatasetKeyRef.current = datasetKey;
    scrollAnimation.cancel();
    expansion.reset({ resizeRow: resizeGlobalRow });
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [datasetKey, expansion, listOffset, resizeGlobalRow, scrollAnimation]);

  const previousListOffsetRef = useRef(listOffset);
  useLayoutEffect(() => {
    const previousOffset = previousListOffsetRef.current;
    previousListOffsetRef.current = listOffset;
    if (previousOffset <= 0 || previousOffset === listOffset) return;
    if (window.scrollY >= Math.min(previousOffset, listOffset)) {
      window.scrollBy({ top: listOffset - previousOffset, behavior: "auto" });
    }
  }, [listOffset]);

  useEffect(() => {
    const recenterWindow = () => {
      if (scrollAnimation.isActive() || windowCount === 0) return;
      const globalOffset =
        expansion.offsetForIndex(baseIndex) +
        Math.max(0, window.scrollY - listOffset);
      const globalIndex = expansion.indexAtOffset(globalOffset);
      const localIndex = globalIndex - baseIndex;
      const nearTop = localIndex <= edgeRows && baseIndex > 0;
      const nearBottom =
        localIndex >= windowCount - edgeRows && baseIndex < maximumBaseIndex;
      if (!nearTop && !nearBottom) return;

      expansion.finish();
      const settledGlobalOffset =
        expansion.offsetForIndex(baseIndex) +
        Math.max(0, window.scrollY - listOffset);
      const settledGlobalIndex = expansion.indexAtOffset(settledGlobalOffset);
      const nextBaseIndex = Math.min(
        maximumBaseIndex,
        Math.max(0, Math.floor(settledGlobalIndex - targetLocalIndex)),
      );
      if (nextBaseIndex === baseIndex) return;

      const recenteredOffset =
        listOffset +
        settledGlobalOffset -
        expansion.offsetForIndex(nextBaseIndex);
      flushSync(() => setWindowState({ datasetKey, baseIndex: nextBaseIndex }));
      window.scrollTo({ top: recenteredOffset, behavior: "auto" });
    };

    window.addEventListener("scroll", recenterWindow, { passive: true });
    return () => window.removeEventListener("scroll", recenterWindow);
  }, [
    baseIndex,
    datasetKey,
    edgeRows,
    expansion,
    listOffset,
    maximumBaseIndex,
    scrollAnimation,
    targetLocalIndex,
    windowCount,
  ]);

  const toggleExpanded = useCallback(
    (globalIndex: number) => {
      if (!expandableRows) return;
      expansion.toggle(globalIndex, {
        resizeRow: resizeGlobalRow,
        onStart: scrollAnimation.cancel,
      });
    },
    [expandableRows, expansion, resizeGlobalRow, scrollAnimation.cancel],
  );
  const expandIndex = useCallback(
    (globalIndex: number) => {
      if (!expandableRows || expansion.expandedIndex === globalIndex) return;
      expansion.toggle(globalIndex, {
        resizeRow: resizeGlobalRow,
        onStart: scrollAnimation.cancel,
      });
    },
    [expandableRows, expansion, resizeGlobalRow, scrollAnimation.cancel],
  );

  const jumpToIndex = useCallback(
    (requestedIndex: number, animate = true) => {
      if (total <= 0) return;
      expansion.finish();
      const targetIndex = Math.min(
        total - 1,
        Math.max(0, Math.trunc(requestedIndex)),
      );
      const currentGlobalOffset =
        expansion.offsetForIndex(baseIndex) +
        Math.max(
          0,
          window.scrollY +
            window.innerHeight * JUMP_VIEWPORT_ANCHOR -
            listOffset,
        );
      const currentGlobalIndex = expansion.indexAtOffset(currentGlobalOffset);
      const direction = Math.sign(targetIndex - currentGlobalIndex);
      const nextBaseIndex = Math.min(
        maximumBaseIndex,
        Math.max(0, targetIndex - targetLocalIndex),
      );
      const nextWindowHeight =
        expansion.offsetForIndex(nextBaseIndex + windowCount) -
        expansion.offsetForIndex(nextBaseIndex);
      const maximumScrollOffset = Math.max(
        listOffset,
        listOffset + nextWindowHeight - window.innerHeight,
      );
      const targetCenter =
        expansion.offsetForIndex(targetIndex) +
        expansion.rowSize(targetIndex) / 2;
      let finalOffset =
        targetIndex === 0 && nextBaseIndex === 0
          ? 0
          : Math.min(
              maximumScrollOffset,
              Math.max(
                listOffset,
                listOffset +
                  targetCenter -
                  expansion.offsetForIndex(nextBaseIndex) -
                  window.innerHeight * JUMP_VIEWPORT_ANCHOR,
              ),
            );
      if (targetIndex === total - 1) {
        finalOffset = Math.max(
          finalOffset,
          document.documentElement.scrollHeight - window.innerHeight,
        );
      }

      if (!animate || direction === 0) {
        scrollAnimation.cancel();
        flushSync(() =>
          setWindowState({ datasetKey, baseIndex: nextBaseIndex }),
        );
        window.scrollTo({ top: finalOffset, behavior: "auto" });
        return;
      }

      const availableAnimationRows =
        direction > 0
          ? (finalOffset - listOffset) / RANKING_ROW_HEIGHT
          : (maximumScrollOffset - finalOffset) / RANKING_ROW_HEIGHT;
      const animatedRows = Math.max(
        0,
        Math.min(
          Math.abs(targetIndex - currentGlobalIndex),
          MAX_JUMP_ANIMATION_ROWS,
          availableAnimationRows,
        ),
      );
      const startingOffset =
        finalOffset - direction * animatedRows * RANKING_ROW_HEIGHT;

      scrollAnimation.start({
        from: startingOffset,
        to: finalOffset,
        prepare: () => {
          flushSync(() =>
            setWindowState({ datasetKey, baseIndex: nextBaseIndex }),
          );
        },
      });
    },
    [
      baseIndex,
      datasetKey,
      expansion,
      listOffset,
      maximumBaseIndex,
      scrollAnimation,
      targetLocalIndex,
      total,
      windowCount,
    ],
  );

  const rawItems = hydrated
    ? virtualizer.getVirtualItems()
    : staticVirtualItems(initialData, baseIndex, listOffset);
  const rows = useMemo(
    () => ({ ...initialRows(initialData), ...(range?.rows ?? {}) }),
    [initialData, range?.rows],
  );
  const items = rawItems.map((item) => {
    const globalIndex = baseIndex + item.index;
    const expandedContentHeight = Math.max(0, item.size - RANKING_ROW_HEIGHT);
    const entry = rows[globalIndex] ?? null;
    return {
      ...item,
      globalIndex,
      entry,
      rankIsDuplicate: Boolean(
        entry && rows[globalIndex - 1]?.rank === entry.rank,
      ),
      expanded: globalIndex === expansion.expandedIndex,
      expandedContentHeight,
      expansionProgress: Math.min(
        1,
        expandedContentHeight /
          (EXPANDED_RANKING_ROW_HEIGHT - RANKING_ROW_HEIGHT),
      ),
    } satisfies VirtualRankingItem;
  });
  const scrollOffset = virtualizer.scrollOffset ?? 0;
  const currentGlobalOffset =
    expansion.offsetForIndex(baseIndex) +
    Math.max(0, scrollOffset - listOffset);
  const currentIndex =
    total > 0
      ? Math.min(
          total - 1,
          Math.floor(expansion.indexAtOffset(currentGlobalOffset)),
        )
      : 0;
  const totalHeight = hydrated
    ? virtualizer.getTotalSize()
    : windowCount * RANKING_ROW_HEIGHT;
  let error = "";
  if (rangeQuery.error instanceof Error) error = rangeQuery.error.message;
  else if (rangeQuery.isError) error = "Rankings are unavailable.";

  return useMemo(
    () => ({
      items,
      total,
      totalHeight,
      currentIndex,
      expandedIndex: expansion.expandedIndex,
      listOffset,
      loading: rangeQuery.isPending,
      error,
      exportDate: range?.exportDate ?? initialData?.exportDate ?? null,
      availableYears:
        range?.availableYears ?? initialData?.availableYears ?? [],
      offlineStale: range?.offlineStale ?? false,
      jumpAnimating: scrollAnimation.active,
      jumpToIndex,
      toggleExpanded,
      expandIndex,
      reload: rangeQuery.refetch,
    }),
    [
      currentIndex,
      error,
      expansion.expandedIndex,
      initialData?.availableYears,
      initialData?.exportDate,
      items,
      jumpToIndex,
      listOffset,
      range?.availableYears,
      range?.exportDate,
      range?.offlineStale,
      rangeQuery.isPending,
      rangeQuery.refetch,
      scrollAnimation.active,
      toggleExpanded,
      total,
      totalHeight,
      expandIndex,
    ],
  );
}
