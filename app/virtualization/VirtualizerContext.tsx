"use client";

import {
  observeWindowOffset,
  useWindowVirtualizer,
  type VirtualItem,
} from "@tanstack/react-virtual";
import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useRef,
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

export const TOTAL_ROWS = 500_000;
export const ROW_HEIGHT = 65;
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
  jumpToIndex: (index: number) => void;
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
  const scrollAnimation = useInterruptibleWindowScroll({
    duration: JUMP_ANIMATION_DURATION_SECONDS,
    ease: JUMP_ANIMATION_EASE,
  });
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

        if (scrollAnimation.isActive()) {
          callback(physicalOffset, isScrolling);
          return;
        }

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

  const jumpToIndex = useCallback(
    (requestedIndex: number) => {
      const targetIndex = Math.min(
        TOTAL_ROWS - 1,
        Math.max(0, Math.trunc(requestedIndex)),
      );
      const currentLocalIndex = Math.max(
        0,
        (window.scrollY +
          window.innerHeight * JUMP_VIEWPORT_ANCHOR -
          LIST_OFFSET -
          ROW_HEIGHT / 2) /
          ROW_HEIGHT,
      );
      const currentGlobalIndex = baseIndexRef.current + currentLocalIndex;
      const direction = Math.sign(targetIndex - currentGlobalIndex);

      if (direction === 0) {
        scrollAnimation.cancel();
        return;
      }

      const nextBaseIndex = Math.min(
        maximumBaseIndex,
        Math.max(0, targetIndex - targetLocalIndex),
      );
      const finalLocalIndex = targetIndex - nextBaseIndex;
      const maximumScrollOffset = Math.max(
        0,
        LIST_OFFSET + windowCount * ROW_HEIGHT - window.innerHeight,
      );
      const finalOffset = Math.min(
        maximumScrollOffset,
        Math.max(
          0,
          LIST_OFFSET +
            finalLocalIndex * ROW_HEIGHT +
            ROW_HEIGHT / 2 -
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
          baseIndexRef.current = nextBaseIndex;
          flushSync(() => setBaseIndex(nextBaseIndex));
        },
      });
    },
    [scrollAnimation],
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
  );

  return (
    <VirtualizerContext.Provider
      value={{
        items,
        totalHeight: Math.round(virtualizer.getTotalSize()),
        scrollOffset: Math.round(virtualizer.scrollOffset ?? 0),
        baseIndex,
        jumpToIndex,
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
