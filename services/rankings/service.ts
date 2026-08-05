import { ApiInputError } from "@/lib/api/projection";
import type { RankingEntry } from "@/lib/wca";
import {
  rankingsWindowCache,
  RANKINGS_WINDOW_SIZE,
} from "@/services/rankings/cache";
import { queryGenderRankingPage } from "@/services/rankings/gender-rankings";
import { getCurrentRankingsMetadata } from "@/services/rankings/metadata";
import { queryPersonMetric } from "@/services/rankings/person-metrics";
import {
  queryPersonRanking,
  queryRankingPage,
} from "@/services/rankings/person-rankings";
import { isPersonMetric, parseRankingInput } from "@/services/rankings/request";
import type { QueryInput, RankingsMetadata } from "@/services/rankings/types";

interface RankingTimings {
  queueMs: number;
  statementMs: number;
}

interface RankingWindowData {
  entries: RankingEntry[];
  total: number;
  [key: string]: unknown;
}

interface RankingWindowCacheValue extends Record<string, unknown> {
  data: RankingWindowData;
  timings: RankingTimings;
  queryCount: number;
  returnedRows: number;
}

type RankingWindowResult = Awaited<ReturnType<typeof loadRankingWindow>>;

function personWindowKey(
  input: QueryInput,
  windowStart: number,
  dataVersion: string,
): string {
  return JSON.stringify({
    dataVersion,
    eventId: input.eventId,
    type: input.type,
    gender: input.gender,
    scope: input.scope,
    regionId: input.regionId,
    year: input.year,
    kinchOrder: input.eventId === "sor-kinch" ? input.kinchOrder : null,
    windowStart,
  });
}

function isPrimedPersonMetricWindow(
  input: QueryInput,
  windowStart: number,
): boolean {
  return (
    isPersonMetric(input) &&
    input.scope === "world" &&
    input.gender.length === 0 &&
    windowStart === 1
  );
}

function loadRankingWindow(input: QueryInput, metadata: RankingsMetadata) {
  if (isPersonMetric(input)) return queryPersonMetric(input);
  if (input.gender.length && input.year === null) {
    return queryGenderRankingPage(input);
  }
  return queryRankingPage(input, metadata, RANKINGS_WINDOW_SIZE);
}

function isRankingWindowData(value: object): value is RankingWindowData {
  return (
    "entries" in value &&
    Array.isArray(value.entries) &&
    "total" in value &&
    Number.isFinite(Number(value.total))
  );
}

function rankingWindowCacheValue(
  result: RankingWindowResult,
): RankingWindowCacheValue {
  if (!isRankingWindowData(result.data)) {
    throw new Error(
      "A cached ranking window must contain entries and a total.",
    );
  }
  return {
    data: result.data,
    timings: result.timings,
    queryCount: result.queryCount,
    returnedRows: result.returnedRows,
  };
}

async function loadCachedRankingWindow(
  input: QueryInput,
  metadata: RankingsMetadata,
): Promise<RankingWindowCacheValue> {
  return rankingWindowCacheValue(await loadRankingWindow(input, metadata));
}

function isRankingWindowCacheValue(
  value: Record<string, unknown>,
): value is RankingWindowCacheValue {
  if (!("data" in value) || typeof value.data !== "object" || !value.data) {
    return false;
  }
  return isRankingWindowData(value.data);
}

function sliceRankingWindow(
  data: RankingWindowData,
  input: QueryInput,
  windowStart: number,
) {
  const offset = Math.max(0, input.startRank - windowStart);
  const entries = data.entries.slice(offset, offset + input.limit);
  const total = Number(data.total);
  const startPosition = Math.min(Math.max(0, input.startRank - 1), total);
  const hasMore = startPosition + entries.length < total;
  return {
    ...data,
    entries,
    hasMore,
    nextPageStart: hasMore ? input.startRank + input.limit : null,
    previousPageStart:
      input.startRank > 1 && total > 0
        ? Math.max(1, input.startRank - input.limit)
        : null,
    startPosition,
    lastRank: entries.at(-1)?.subRank ?? null,
    total,
  };
}

async function loadUncachedRanking(
  input: QueryInput,
  metadata: RankingsMetadata,
) {
  if (isPersonMetric(input)) return queryPersonMetric(input);
  if (input.year !== null && input.gender.length) {
    return queryRankingPage(input, metadata);
  }
  if (input.gender.length) return queryGenderRankingPage(input);
  return queryPersonRanking(input);
}

export async function loadRankingsWithDiagnostics(
  searchParams: URLSearchParams,
) {
  const input = parseRankingInput(searchParams);
  if (input.year !== null && isPersonMetric(input)) {
    throw new ApiInputError(
      "year is only available for person event rankings.",
    );
  }
  const metadata = await getCurrentRankingsMetadata();
  if (input.year !== null && !metadata.availableYears.includes(input.year)) {
    throw new ApiInputError(`year ${input.year} is unavailable.`);
  }
  const cacheable =
    input.paged &&
    !input.search &&
    !input.locate &&
    !input.cursorRank &&
    !input.cursorId;
  if (!cacheable) {
    const result = await loadUncachedRanking(input, metadata);
    return {
      ...result,
      data: { ...result.data, availableYears: metadata.availableYears },
      cacheOutcome: "bypass" as const,
      cacheLayer: "memory" as const,
      dataVersion: null,
    };
  }
  const windowStart =
    Math.floor((input.startRank - 1) / RANKINGS_WINDOW_SIZE) *
      RANKINGS_WINDOW_SIZE +
    1;
  const windowInput = {
    ...input,
    startRank: windowStart,
    limit: RANKINGS_WINDOW_SIZE,
  };
  const cached = await rankingsWindowCache.getWithStatus(
    personWindowKey(input, windowStart, metadata.fetchedAt),
    () => loadCachedRankingWindow(windowInput, metadata),
    { pin: isPrimedPersonMetricWindow(input, windowStart) },
  );
  if (!isRankingWindowCacheValue(cached.value)) {
    throw new Error("The ranking window cache returned an invalid value.");
  }
  const windowTotal = Number(cached.value.data.total);
  const nextWindowStart = windowStart + RANKINGS_WINDOW_SIZE;
  if (
    input.startRank - windowStart >= RANKINGS_WINDOW_SIZE / 2 &&
    nextWindowStart <= windowTotal
  ) {
    void rankingsWindowCache
      .getWithStatus(
        personWindowKey(input, nextWindowStart, metadata.fetchedAt),
        () => {
          const nextInput = {
            ...input,
            startRank: nextWindowStart,
            limit: RANKINGS_WINDOW_SIZE,
          };
          return loadCachedRankingWindow(nextInput, metadata);
        },
      )
      .catch((error) => console.warn("Ranking window prefetch failed", error));
  }
  return {
    ...cached.value,
    data: sliceRankingWindow(cached.value.data, input, windowStart),
    timings:
      cached.outcome === "hit"
        ? { queueMs: 0, statementMs: 0 }
        : cached.value.timings,
    cacheOutcome: cached.outcome,
    cacheLayer: "memory" as const,
    dataVersion: metadata.fetchedAt,
  };
}
