"use client";

import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { createContext, use, type ReactNode } from "react";
import {
  MOCK_RANKING_COUNT,
  MOCK_RANKING_ROW_HEIGHT,
} from "@/components/VirtualizationPlayground/mockRankings";

export const LIST_OFFSET = 64;
export const OVERSCAN = 12;

type WindowVirtualizer = ReturnType<typeof useWindowVirtualizer>;
type VirtualizerContextValue = {
  items: ReturnType<WindowVirtualizer["getVirtualItems"]>;
  totalHeight: number;
  scrollOffset: number;
};

const VirtualizerContext = createContext<VirtualizerContextValue | null>(null);

export function VirtualRankingsProvider({ children }: { children: ReactNode }) {
  const virtualizer = useWindowVirtualizer({
    count: MOCK_RANKING_COUNT,
    estimateSize: () => MOCK_RANKING_ROW_HEIGHT,
    overscan: OVERSCAN,
    scrollMargin: LIST_OFFSET,
  });

  return (
    <VirtualizerContext.Provider
      value={{
        items: virtualizer.getVirtualItems(),
        totalHeight: Math.round(virtualizer.getTotalSize()),
        scrollOffset: Math.round(virtualizer.scrollOffset ?? 0),
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
