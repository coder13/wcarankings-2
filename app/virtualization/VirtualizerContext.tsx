"use client";

import {
  observeWindowOffset,
  useWindowVirtualizer,
  type VirtualItem,
} from "@tanstack/react-virtual";
import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query";
import { createContext, use, useRef, useState, type ReactNode } from "react";
import {
  useRankingsApi,
  type RankingRowData,
  type RankingsApi,
} from "./RankingsApiContext";

export const TOTAL_ROWS = 500_000;
export const ROW_HEIGHT = 65;
export const WINDOW_ROWS = 500;
export const RECENTER_EDGE_ROWS = 100;
export const RECENTER_TARGET_ROW = 250;
export const OVERSCAN_ROWS = 12;
export const LIST_OFFSET = 64;
export const RANGE_CACHE_BUCKET_ROWS = 50;

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
};

type VirtualizerContextValue = {
  items: VirtualRankingItem[];
  totalHeight: number;
  scrollOffset: number;
  baseIndex: number;
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

    return {
      ...item,
      globalIndex,
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
  const baseIndexRef = useRef(baseIndex);
  const virtualizer = useWindowVirtualizer({
    count: windowCount,
    estimateSize: () => ROW_HEIGHT,
    getItemKey: (localIndex) => baseIndexRef.current + localIndex,
    overscan: OVERSCAN_ROWS,
    scrollMargin: LIST_OFFSET,
    observeElementOffset: (instance, callback) =>
      observeWindowOffset(instance, (physicalOffset, isScrolling) => {
        const localOffset = Math.max(0, physicalOffset - LIST_OFFSET);
        const localIndex = localOffset / ROW_HEIGHT;
        const currentBaseIndex = baseIndexRef.current;
        const nearTop = localIndex <= edgeRows && currentBaseIndex > 0;
        const nearBottom =
          localIndex >= windowCount - edgeRows &&
          currentBaseIndex < maximumBaseIndex;

        if (!nearTop && !nearBottom) {
          callback(physicalOffset, isScrolling);
          return;
        }

        const globalIndex = currentBaseIndex + localIndex;
        const proposedBaseIndex =
          Math.floor(globalIndex - targetLocalIndex);
        const nextBaseIndex = Math.min(
          maximumBaseIndex,
          Math.max(0, proposedBaseIndex),
        );

        if (nextBaseIndex === currentBaseIndex) {
          callback(physicalOffset, isScrolling);
          return;
        }

        const recenteredOffset =
          LIST_OFFSET + (globalIndex - nextBaseIndex) * ROW_HEIGHT;
        baseIndexRef.current = nextBaseIndex;
        setBaseIndex(nextBaseIndex);
        instance.scrollElement?.scrollTo({
          top: recenteredOffset,
          behavior: "auto",
        });
        callback(recenteredOffset, isScrolling);
      }),
  });
  const items = useVirtualRankingItems(
    virtualizer.getVirtualItems(),
    baseIndex,
  );

  return (
    <VirtualizerContext.Provider
      value={{
        items,
        totalHeight: Math.round(virtualizer.getTotalSize()),
        scrollOffset: Math.round(virtualizer.scrollOffset ?? 0),
        baseIndex,
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
