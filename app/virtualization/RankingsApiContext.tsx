"use client";

import { createContext, use, useMemo, useState, type ReactNode } from "react";
import { getMockRanking } from "@/components/VirtualizationPlayground/mockRankings";

const DEFAULT_AVERAGE_DELAY_MS = 500;
const DEFAULT_VARIANCE_MS = 250;

export type RankingFilters = {
  eventId: string;
  rankingType: "single" | "average";
  region: string;
};

export type RankingRowData = {
  index: number;
  number: number;
  name: string;
  result: string;
};

export type RankingRangeRequest = {
  start: number;
  count: number;
  filters: RankingFilters;
};

export type RankingRange = {
  total: number;
  dataVersion: string;
  rows: Record<number, RankingRowData>;
};

export type RankingsApi = {
  cacheKey: string;
  fetchRange: (
    request: RankingRangeRequest,
    signal: AbortSignal,
  ) => Promise<RankingRange>;
};

type MockApiControls = {
  averageDelayMs: number;
  varianceMs: number;
  setAverageDelayMs: (delayMs: number) => void;
  setVarianceMs: (varianceMs: number) => void;
};

type RankingsApiContextValue = {
  api: RankingsApi;
  mockControls: MockApiControls | null;
};

const RankingsApiContext = createContext<RankingsApiContextValue | null>(null);

export function RankingsApiProvider({
  api,
  children,
}: {
  api: RankingsApi;
  children: ReactNode;
}) {
  return (
    <RankingsApiContext.Provider value={{ api, mockControls: null }}>
      {children}
    </RankingsApiContext.Provider>
  );
}

export function sampleMockApiDelay(
  averageMs: number,
  varianceMs: number,
  random = Math.random,
) {
  const minimumMs = Math.max(0, averageMs - varianceMs);
  const maximumMs = Math.max(minimumMs, averageMs + varianceMs);
  return Math.round(minimumMs + random() * (maximumMs - minimumMs));
}

function waitForMockApi(delayMs: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }

    const timeout = window.setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, delayMs);
    const abort = () => {
      window.clearTimeout(timeout);
      reject(signal.reason);
    };
    signal.addEventListener("abort", abort, { once: true });
  });
}

export function MockRankingsApiProvider({
  children,
  totalRows,
}: {
  children: ReactNode;
  totalRows: number;
}) {
  const [averageDelayMs, setAverageDelayMs] = useState(
    DEFAULT_AVERAGE_DELAY_MS,
  );
  const [varianceMs, setVarianceMs] = useState(DEFAULT_VARIANCE_MS);
  const api = useMemo<RankingsApi>(
    () => ({
      cacheKey: `mock-rankings-v1:${totalRows}`,
      async fetchRange({ start, count }, signal) {
        await waitForMockApi(
          sampleMockApiDelay(averageDelayMs, varianceMs),
          signal,
        );
        const end = Math.min(start + count, totalRows);
        return {
          total: totalRows,
          dataVersion: "mock-v1",
          rows: Object.fromEntries(
            Array.from({ length: end - start }, (_, offset) => {
              const ranking = getMockRanking(start + offset);
              return [ranking.index, ranking];
            }),
          ),
        };
      },
    }),
    [averageDelayMs, totalRows, varianceMs],
  );
  const mockControls = useMemo(
    () => ({
      averageDelayMs,
      varianceMs,
      setAverageDelayMs,
      setVarianceMs,
    }),
    [averageDelayMs, varianceMs],
  );

  return (
    <RankingsApiContext.Provider value={{ api, mockControls }}>
      {children}
    </RankingsApiContext.Provider>
  );
}

function useRankingsApiContext() {
  const context = use(RankingsApiContext);
  if (!context) {
    throw new Error("useRankingsApi must be used inside RankingsApiProvider.");
  }
  return context;
}

export function useRankingsApi() {
  return useRankingsApiContext().api;
}

export function useMockApiControls() {
  const controls = useRankingsApiContext().mockControls;
  if (!controls) {
    throw new Error(
      "useMockApiControls must be used inside MockRankingsApiProvider.",
    );
  }
  return controls;
}
