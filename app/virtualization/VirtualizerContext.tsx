"use client";

import {
  useWindowVirtualizer,
  type VirtualItem,
} from "@tanstack/react-virtual";
import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import {
  useRankingsApi,
  type RankingRowData,
  type RankingsApi,
} from "./RankingsApiContext";
import { useInterruptibleWindowScroll } from "./useInterruptibleWindowScroll";
import { useSingleExpandedVirtualRow } from "./useSingleExpandedVirtualRow";

export const TOTAL_ROWS = 500_000;
export const ROW_HEIGHT = 65;
export const EXPANDED_ROW_HEIGHT = 248;
export const WINDOW_ROWS = 500;
export const RECENTER_EDGE_ROWS = 100;
export const RECENTER_TARGET_ROW = 250;
export const OVERSCAN_ROWS = 12;
export const LIST_OFFSET = 64;
export const RANGE_CACHE_BUCKET_ROWS = 50;
export const MAX_JUMP_ANIMATION_ROWS = 250;
export const JUMP_ANIMATION_DURATION_SECONDS = 0.6;
export const JUMP_ANIMATION_EASE = [0.32, 0.72, 0, 1] as const;
export const JUMP_VIEWPORT_ANCHOR = 1 / 3;
export const ROW_EXPANSION_DURATION_SECONDS = 0.2;
export const ROW_EXPANSION_EASE = [0.2, 0.7, 0.2, 1] as const;

const RANGE_CACHE_TIME_MS = 5 * 60 * 1000;
const PLAYGROUND_FILTERS = {
  eventId: "333",
  rankingType: "single",
  region: "world",
} as const;

const windowCount = Math.min(WINDOW_ROWS, TOTAL_ROWS);
const maximumBaseIndex = Math.max(0, TOTAL_ROWS - windowCount);
const edgeRows = Math.min(
  RECENTER_EDGE_ROWS,
  Math.floor(windowCount / 2),
);
const targetLocalIndex = Math.min(
  RECENTER_TARGET_ROW,
  windowCount - edgeRows,
);

type VirtualRankingItem = VirtualItem & {
  globalIndex: number;
  ranking: RankingRowData;
  expanded: boolean;
  detailsHeight: number;
  expansionProgress: number;
};

type VirtualizerContextValue = {
  items: VirtualRankingItem[];
  totalHeight: number;
  scrollOffset: number;
  baseIndex: number;
  expandedIndex: number | null;
  jumpToIndex: (index: number) => void;
  toggleExpanded: (index: number) => void;
};

const VirtualizerContext = createContext<VirtualizerContextValue | null>(null);

function rankingRangeQueryOptions(
  api: RankingsApi,
  start: number,
  count: number,
) {
  return queryOptions({
    queryKey: [
      "virtualization",
      "ranking-range",
      api.cacheKey,
      PLAYGROUND_FILTERS,
      start,
      count,
    ] as const,
    queryFn: ({ signal }) =>
      api.fetchRange(
        { start, count, filters: PLAYGROUND_FILTERS },
        signal,
      ),
    placeholderData: keepPreviousData,
    staleTime: Infinity,
    gcTime: RANGE_CACHE_TIME_MS,
  });
}

function useVirtualRankingItems(
  virtualItems: VirtualItem[],
  baseIndex: number,
  expandedIndex: number | null,
) {
  const api = useRankingsApi();
  const rangeStart =
    Math.floor(baseIndex / RANGE_CACHE_BUCKET_ROWS) * RANGE_CACHE_BUCKET_ROWS;
  const rangeCount = Math.min(
    TOTAL_ROWS - rangeStart,
    windowCount + RANGE_CACHE_BUCKET_ROWS - 1,
  );
  const rankingsQuery = useQuery(
    rankingRangeQueryOptions(api, rangeStart, rangeCount),
  );

  return virtualItems.map((item) => {
    const globalIndex = baseIndex + item.index;
    const detailsHeight = Math.max(0, item.size - ROW_HEIGHT);

    return {
      ...item,
      globalIndex,
      expanded: globalIndex === expandedIndex,
      detailsHeight,
      expansionProgress: Math.min(
        1,
        detailsHeight / (EXPANDED_ROW_HEIGHT - ROW_HEIGHT),
      ),
      ranking: rankingsQuery.data?.rows[globalIndex] ?? {
        index: globalIndex,
        number: globalIndex + 1,
        name: "Loading…",
        result: "…",
      },
    };
  });
}

export function VirtualRankingsProvider({ children }: { children: ReactNode }) {
  const [baseIndex, setBaseIndex] = useState(0);
  const scrollAnimation = useInterruptibleWindowScroll({
    duration: JUMP_ANIMATION_DURATION_SECONDS,
    ease: JUMP_ANIMATION_EASE,
  });
  const expansion = useSingleExpandedVirtualRow({
    totalRows: TOTAL_ROWS,
    rowHeight: ROW_HEIGHT,
    expandedRowHeight: EXPANDED_ROW_HEIGHT,
    duration: ROW_EXPANSION_DURATION_SECONDS,
    ease: ROW_EXPANSION_EASE,
  });
  const virtualizer = useWindowVirtualizer({
    count: windowCount,
    estimateSize: (localIndex) =>
      expansion.rowSize(baseIndex + localIndex),
    getItemKey: (localIndex) => baseIndex + localIndex,
    overscan: OVERSCAN_ROWS,
    scrollMargin: LIST_OFFSET,
  });

  useEffect(() => {
    const recenterWindow = () => {
      if (scrollAnimation.isActive()) return;

      const globalOffset =
        expansion.offsetForIndex(baseIndex) +
        Math.max(0, window.scrollY - LIST_OFFSET);
      const globalIndex = expansion.indexAtOffset(globalOffset);
      const localIndex = globalIndex - baseIndex;
      const nearTop = localIndex <= edgeRows && baseIndex > 0;
      const nearBottom =
        localIndex >= windowCount - edgeRows &&
        baseIndex < maximumBaseIndex;
      if (!nearTop && !nearBottom) return;

      expansion.finish();
      const settledGlobalOffset =
        expansion.offsetForIndex(baseIndex) +
        Math.max(0, window.scrollY - LIST_OFFSET);
      const settledGlobalIndex =
        expansion.indexAtOffset(settledGlobalOffset);
      const nextBaseIndex = Math.min(
        maximumBaseIndex,
        Math.max(
          0,
          Math.floor(settledGlobalIndex - targetLocalIndex),
        ),
      );
      if (nextBaseIndex === baseIndex) return;

      const recenteredOffset =
        LIST_OFFSET +
        settledGlobalOffset -
        expansion.offsetForIndex(nextBaseIndex);
      flushSync(() => setBaseIndex(nextBaseIndex));
      window.scrollTo({ top: recenteredOffset, behavior: "auto" });
    };

    window.addEventListener("scroll", recenterWindow, { passive: true });
    return () => window.removeEventListener("scroll", recenterWindow);
  }, [baseIndex, expansion, scrollAnimation]);

  const resizeGlobalRow = useCallback(
    (globalIndex: number, size: number) => {
      const localIndex = globalIndex - baseIndex;
      if (localIndex < 0 || localIndex >= windowCount) return;
      virtualizer.resizeItem(localIndex, size);
    },
    [baseIndex, virtualizer],
  );
  const toggleExpanded = useCallback(
    (globalIndex: number) => {
      expansion.toggle(globalIndex, {
        resizeRow: resizeGlobalRow,
        onStart: scrollAnimation.cancel,
      });
    },
    [expansion, resizeGlobalRow, scrollAnimation.cancel],
  );

  const jumpToIndex = useCallback(
    (requestedIndex: number) => {
      expansion.finish();
      const targetIndex = Math.min(
        TOTAL_ROWS - 1,
        Math.max(0, Math.trunc(requestedIndex)),
      );
      const currentGlobalOffset =
        expansion.offsetForIndex(baseIndex) +
        Math.max(
          0,
          window.scrollY +
            window.innerHeight * JUMP_VIEWPORT_ANCHOR -
            LIST_OFFSET,
        );
      const currentGlobalIndex = expansion.indexAtOffset(currentGlobalOffset);
      const direction = Math.sign(targetIndex - currentGlobalIndex);

      if (direction === 0) {
        scrollAnimation.cancel();
        return;
      }

      const nextBaseIndex = Math.min(
        maximumBaseIndex,
        Math.max(0, targetIndex - targetLocalIndex),
      );
      const nextWindowHeight =
        expansion.offsetForIndex(nextBaseIndex + windowCount) -
        expansion.offsetForIndex(nextBaseIndex);
      const maximumScrollOffset = Math.max(
        0,
        LIST_OFFSET + nextWindowHeight - window.innerHeight,
      );
      const targetCenter =
        expansion.offsetForIndex(targetIndex) +
        expansion.rowSize(targetIndex) / 2;
      const finalOffset = Math.min(
        maximumScrollOffset,
        Math.max(
          0,
          LIST_OFFSET +
            targetCenter -
            expansion.offsetForIndex(nextBaseIndex) -
            window.innerHeight * JUMP_VIEWPORT_ANCHOR,
        ),
      );
      const availableAnimationRows =
        direction > 0
          ? finalOffset / ROW_HEIGHT
          : (maximumScrollOffset - finalOffset) / ROW_HEIGHT;
      const animatedRows = Math.max(
        0,
        Math.min(
          Math.abs(targetIndex - currentGlobalIndex),
          MAX_JUMP_ANIMATION_ROWS,
          availableAnimationRows,
        ),
      );
      const startingOffset =
        finalOffset - direction * animatedRows * ROW_HEIGHT;

      scrollAnimation.start({
        from: startingOffset,
        to: finalOffset,
        prepare: () => {
          flushSync(() => setBaseIndex(nextBaseIndex));
        },
      });
    },
    [baseIndex, expansion, scrollAnimation],
  );

  useEffect(() => {
    const jumpToBoundary = (event: KeyboardEvent) => {
      if (!event.metaKey) return;
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;

      event.preventDefault();
      jumpToIndex(event.key === "ArrowUp" ? 0 : TOTAL_ROWS - 1);
    };

    window.addEventListener("keydown", jumpToBoundary);
    return () => window.removeEventListener("keydown", jumpToBoundary);
  }, [jumpToIndex]);

  const items = useVirtualRankingItems(
    virtualizer.getVirtualItems(),
    baseIndex,
    expansion.expandedIndex,
  );

  return (
    <VirtualizerContext.Provider
      value={{
        items,
        totalHeight: virtualizer.getTotalSize(),
        scrollOffset: virtualizer.scrollOffset ?? 0,
        baseIndex,
        expandedIndex: expansion.expandedIndex,
        jumpToIndex,
        toggleExpanded,
      }}
    >
      {children}
    </VirtualizerContext.Provider>
  );
}

export function useVirtualizerContext() {
  const context = use(VirtualizerContext);
  if (!context) {
    throw new Error(
      "useVirtualizerContext must be used inside VirtualRankingsProvider.",
    );
  }
  return context;
}
