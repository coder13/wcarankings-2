"use client";

import { useWindowVirtualizer } from "@tanstack/react-virtual";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type Key,
  type RefCallback,
} from "react";
import {
  cancelScrollAnimation,
  type ScrollAnimationState,
} from "./scrollEngine";
import {
  EXPANDED_RANKING_ROW_HEIGHT,
  RANKING_ROW_HEIGHT,
} from "./rankingLayout";
import type { RankingEntry } from "./types";

type RankingViewportOptions = {
  entries: RankingEntry[];
  startRank: number;
  startPosition: number;
  listOffset: number;
  focusedExpandedPersonId: string;
  expandableRows: boolean;
  hasMore: boolean;
  loading: boolean;
  loadingPrevious: boolean;
  measurementKey: string;
  onListOffsetChange: (offset: number) => void;
};

export type RankingViewportRendering = {
  containerRef: RefCallback<HTMLDivElement>;
  listRef: RefCallback<HTMLOListElement>;
  renderedRows: Array<{
    index: number;
    key: Key;
    start: number;
    size?: number;
  }>;
  renderedListHeight: number;
  measureElement: (element: Element | null) => void;
  resizeRow: (index: number, size: number) => void;
};

const subscribeHydration = () => () => {};

export function useRankingViewport({
  entries,
  startRank,
  startPosition,
  listOffset,
  focusedExpandedPersonId,
  expandableRows,
  hasMore,
  loading,
  loadingPrevious,
  measurementKey,
  onListOffsetChange,
}: RankingViewportOptions) {
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const entriesRef = useRef(entries);
  const startRankRef = useRef(startRank);
  const startPositionRef = useRef(startPosition);
  const scrollStateRef = useRef<ScrollAnimationState>({
    frame: null,
    active: false,
    programmatic: false,
    clearProgrammaticTimer: null,
    settleTimer: null,
  });

  const focusedExpandedIndex =
    expandableRows && focusedExpandedPersonId
      ? entries.findIndex((entry) => entry.personId === focusedExpandedPersonId)
      : -1;
  const estimatedRowHeight = useCallback(
    (index: number) =>
      index === focusedExpandedIndex
        ? EXPANDED_RANKING_ROW_HEIGHT
        : RANKING_ROW_HEIGHT,
    [focusedExpandedIndex],
  );

  const virtualizer = useWindowVirtualizer({
    count: entries.length + 1,
    estimateSize: estimatedRowHeight,
    measureElement: (element, entry, instance) => {
      const index = Number(element.getAttribute("data-index"));
      if (element.getAttribute("data-accordion-measure-lock") === "true") {
        const key = instance.options.getItemKey(index);
        const cache = (
          instance as unknown as { itemSizeCache?: Map<unknown, number> }
        ).itemSizeCache;
        return cache?.get(key) ?? estimatedRowHeight(index);
      }
      if (entry?.borderBoxSize) {
        const box = entry.borderBoxSize[0];
        if (box) return Math.round(box.blockSize);
      }
      return (element as HTMLElement).offsetHeight;
    },
    overscan: 12,
    scrollMargin: listOffset,
  });
  const virtualizerRef = useRef(virtualizer);
  const virtualRows = virtualizer.getVirtualItems();
  useLayoutEffect(() => {
    virtualizerRef.current = virtualizer;
    entriesRef.current = entries;
    startRankRef.current = startRank;
    startPositionRef.current = startPosition;
  }, [entries, startPosition, startRank, virtualizer]);

  const resizeRow = useCallback((index: number, size: number) => {
    virtualizerRef.current.resizeItem(index, size);
  }, []);
  const setContainerElement = useCallback<RefCallback<HTMLDivElement>>(
    (element) => {
      containerRef.current = element;
    },
    [],
  );
  const setListElement = useCallback<RefCallback<HTMLOListElement>>(
    (element) => {
      listRef.current = element;
    },
    [],
  );
  const measureElement = useCallback((element: Element | null) => {
    virtualizerRef.current.measureElement(element);
  }, []);

  useLayoutEffect(() => {
    const measure = () => {
      const wrapperTop = containerRef.current
        ? containerRef.current.getBoundingClientRect().top + window.scrollY
        : 0;
      const listTop = listRef.current?.offsetTop ?? 0;
      onListOffsetChange(wrapperTop + listTop);
      virtualizerRef.current.measure();
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [entries.length, loading, loadingPrevious, measurementKey, onListOffsetChange]);

  useEffect(() => {
    const animationState = scrollStateRef.current;
    return () => cancelScrollAnimation(animationState);
  }, []);

  const renderedRows = hydrated
    ? virtualizer.getVirtualItems()
    : entries.map((_, index) => ({
        index,
        start: entries
          .slice(0, index)
          .reduce(
            (height, _entry, rowIndex) =>
              height + estimatedRowHeight(rowIndex),
            0,
          ),
        key: index,
      }));
  const renderedListHeight = hydrated
    ? virtualizer.getTotalSize()
    : entries.reduce(
        (height, _entry, index) => height + estimatedRowHeight(index),
        hasMore ? RANKING_ROW_HEIGHT : 0,
      );
  return {
    containerRef,
    listRef,
    entriesRef,
    startRankRef,
    startPositionRef,
    scrollStateRef,
    virtualizer,
    virtualizerRef,
    virtualRows,
    visibleSubRank:
      entries[virtualRows[0]?.index ?? 0]?.subRank ?? startRank,
    rendering: {
      containerRef: setContainerElement,
      listRef: setListElement,
      renderedRows,
      renderedListHeight,
      measureElement,
      resizeRow,
    } satisfies RankingViewportRendering,
  };
}
