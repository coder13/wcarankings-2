import {
  rankingsWindowCache,
  RANKINGS_WINDOW_SIZE,
} from "@/services/rankings/cache";
import { getCurrentRankingsMetadata } from "@/services/rankings/metadata";
import { loadResultRankingData } from "@/services/rankings/result-data";
import {
  parseResultRankingRequest,
  withResultRankingWindow,
} from "@/services/rankings/result-request";
import type {
  ResultRankingData,
  ResultRankingLoadResult,
} from "@/services/rankings/result-types";

function resultWindowKey(
  params: URLSearchParams,
  windowStart: number,
  dataVersion: string,
): string {
  return JSON.stringify({
    dataVersion,
    eventId: params.get("eventId") ?? params.get("event"),
    result: params.get("result") ?? params.get("type"),
    region: params.get("region") ?? "world",
    gender: params.getAll("gender").sort(),
    year: params.get("year"),
    windowStart,
  });
}

function sliceResultWindow(
  data: ResultRankingData,
  start: number,
  limit: number,
  windowStart: number,
): ResultRankingData {
  const entries = data.entries.slice(
    start - windowStart,
    start - windowStart + limit,
  );
  const total = Number(data.total);
  const hasMore = start + entries.length < total;
  return {
    ...data,
    entries,
    hasMore,
    nextPageStart: hasMore ? start + limit : null,
    previousPageStart: start > 0 ? Math.max(0, start - limit) : null,
    startPosition: start,
    lastRank: entries.at(-1)?.rank ?? null,
    total,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isResultRankingData(value: unknown): value is ResultRankingData {
  return (
    isRecord(value) &&
    Array.isArray(value.entries) &&
    Number.isFinite(Number(value.total))
  );
}

function isResultRankingLoadResult(
  value: Record<string, unknown>,
): value is ResultRankingLoadResult {
  return isResultRankingData(value.data) && isRecord(value.diagnostics);
}

export async function loadResultRankings(params: URLSearchParams) {
  const input = parseResultRankingRequest(params);
  if (input.search) return loadResultRankingData(input);

  const metadata = await getCurrentRankingsMetadata();
  const windowStart =
    Math.floor(input.requestedStart / RANKINGS_WINDOW_SIZE) *
    RANKINGS_WINDOW_SIZE;
  const windowInput = withResultRankingWindow(
    input,
    windowStart,
    RANKINGS_WINDOW_SIZE,
  );
  const cached = await rankingsWindowCache.getWithStatus(
    resultWindowKey(params, windowStart, metadata.fetchedAt),
    () => loadResultRankingData(windowInput),
  );
  if (!isResultRankingLoadResult(cached.value)) {
    throw new Error("The result ranking window cache returned invalid data.");
  }

  const data = sliceResultWindow(
    cached.value.data,
    input.requestedStart,
    input.requestedLimit,
    windowStart,
  );
  const nextWindowStart = windowStart + RANKINGS_WINDOW_SIZE;
  if (
    input.requestedStart - windowStart >= RANKINGS_WINDOW_SIZE / 2 &&
    nextWindowStart < data.total
  ) {
    const nextWindowInput = withResultRankingWindow(
      input,
      nextWindowStart,
      RANKINGS_WINDOW_SIZE,
    );
    void rankingsWindowCache
      .getWithStatus(
        resultWindowKey(params, nextWindowStart, metadata.fetchedAt),
        () => loadResultRankingData(nextWindowInput),
      )
      .catch((error) =>
        console.warn("Result ranking window prefetch failed", error),
      );
  }

  return {
    data,
    diagnostics: {
      ...cached.value.diagnostics,
      ...(cached.outcome === "hit"
        ? {
            timings: { queueMs: 0, statementMs: 0 },
            queryCount: 0,
            returnedRows: 0,
          }
        : {}),
      cacheOutcome: cached.outcome,
      cacheLayer: "memory" as const,
    },
  };
}
