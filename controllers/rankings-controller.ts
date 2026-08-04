import { DatabaseOverloadedError } from "@/db";
import { buildApiErrorResponse, buildApiJsonResponse } from "@/lib/api";
import { getAuthUser } from "@/services/auth/auth";
import {
  DynamicListInputError,
  parseDynamicListIds,
  resolveDynamicList,
} from "@/services/lists/dynamic-list";
import { loadDynamicListRankings, loadListRankings } from "@/services/lists/rankings";
import { assertCanViewList, resolveList } from "@/services/lists/lists";
import { loadRankingsWithDiagnostics } from "@/services/rankings/service";
import { ApiInputError } from "@/lib/api/projection";
import {
  isRankingEventId,
  isRankingType,
  parseRegionQuery,
  type RankingType,
  type RegionScope,
} from "@/lib/wca";

type RankingsQuery = {
  searchParams: URLSearchParams;
  listId: string;
  hasDynamicList: boolean;
  eventId: string;
  type: RankingType;
  scope: RegionScope;
};

function parseRankingsQuery(request: Request): RankingsQuery {
  const requestUrl = new URL(request.url);
  const searchParams = requestUrl.searchParams;
  const rawEventId = searchParams.get("eventId") ?? searchParams.get("event");
  const rawType = searchParams.get("result") ?? searchParams.get("type");
  const eventId = isRankingEventId(rawEventId) ? rawEventId : "333";
  let type: RankingType = "single";
  if (eventId !== "333mbf" && eventId !== "sor-kinch" && isRankingType(rawType)) {
    type = rawType;
  }
  return {
    searchParams,
    listId: searchParams.get("list")?.trim() ?? "",
    hasDynamicList: searchParams.has("wca_ids"),
    eventId,
    type,
    scope: parseRegionQuery(searchParams.get("region")).scope,
  };
}

function buildListRankingResponse(
  rankings:
    | Awaited<ReturnType<typeof loadListRankings>>
    | Awaited<ReturnType<typeof loadDynamicListRankings>>,
  searchParams: URLSearchParams,
) {
  const inputStart = Number(searchParams.get("start")) || 0;
  if (searchParams.get("locate")) return { located: rankings.entries[0] ?? null };
  return {
    entries: rankings.entries,
    hasMore: rankings.hasMore,
    nextPageStart: rankings.nextStart === null ? null : rankings.nextStart + 1,
    previousPageStart:
      inputStart > 0 ? Math.max(0, inputStart - Number(searchParams.get("limit") || 50)) + 1 : null,
    startPosition: inputStart,
    lastRank: rankings.entries.at(-1)?.subRank ?? null,
    total: rankings.total,
    exportDate: rankings.exportDate,
  };
}

async function fetchSavedListRankings(request: Request, input: RankingsQuery) {
  const [list, user] = await Promise.all([resolveList(input.listId), getAuthUser(request)]);
  assertCanViewList(list, user);
  const rankings = await loadListRankings(list, input.searchParams);
  return {
    list,
    data: buildListRankingResponse(
      rankings,
      input.searchParams,
    ),
    cacheOutcome: rankings.cacheOutcome,
  };
}

async function fetchDynamicListRankings(input: RankingsQuery) {
  const ids = parseDynamicListIds(input.searchParams.getAll("wca_ids"));
  const dynamicList = await resolveDynamicList(ids.personIds);
  const rankings = await loadDynamicListRankings(dynamicList.personIds, input.searchParams);
  return { data: buildListRankingResponse(rankings, input.searchParams), cacheOutcome: rankings.cacheOutcome };
}

async function fetchGlobalRankings(input: RankingsQuery, startedAt: number) {
  const validationAt = performance.now();
  const result = await loadRankingsWithDiagnostics(input.searchParams);
  const totalMs = performance.now() - startedAt;
  const queueMs = result.timings?.queueMs ?? 0;
  const statementMs = result.timings?.statementMs ?? 0;
  const cacheMs = Math.max(0, totalMs - (validationAt - startedAt) - queueMs - statementMs);
  return { result, validationMs: validationAt - startedAt, cacheMs, totalMs, queueMs, statementMs };
}

function buildGlobalRankingsResponse(
  input: RankingsQuery,
  loaded: Awaited<ReturnType<typeof fetchGlobalRankings>>,
) {
  const { result, validationMs, cacheMs, totalMs, queueMs, statementMs } = loaded;
  const serverTiming = `validation;dur=${validationMs.toFixed(1)}, cache;dur=${cacheMs.toFixed(1)}, db-queue;dur=${queueMs.toFixed(1)}, db;dur=${statementMs.toFixed(1)}, serialization;dur=0.0, total;dur=${totalMs.toFixed(1)}`;
  console.info(
    JSON.stringify({
      operation: "rankings",
      eventId: input.eventId,
      result: input.type,
      region: input.scope,
      status: 200,
      timings: {
        validation_ms: validationMs,
        cache_ms: cacheMs,
        db_queue_ms: queueMs,
        db_ms: statementMs,
        serialization_ms: 0,
        total_ms: totalMs,
      },
      query_count: result.queryCount,
      returned_rows: result.returnedRows,
      cache: result.cacheOutcome,
      data_version: result.dataVersion,
    }),
  );
  return buildApiJsonResponse(result.data, {
    headers: {
      "Cache-Control": "public, max-age=60, s-maxage=3600",
      "Server-Timing": serverTiming,
      "X-Rankings-Cache": result.cacheOutcome,
      "X-Rankings-Memory-Cache": result.cacheOutcome,
      "X-List-Ranking-Cache": "bypass",
      "X-Rankings-Data-Version": result.dataVersion ?? "unknown",
    },
  });
}

function buildRankingsErrorResponse(
  input: RankingsQuery | null,
  startedAt: number,
  error: unknown,
) {
  if (input?.listId) return buildApiErrorResponse(error);
  const inputError = error instanceof ApiInputError || error instanceof DynamicListInputError;
  const status = inputError ? 400 : 503;
  console.error(
    JSON.stringify({
      operation: "rankings",
      eventId: input?.eventId ?? "333",
      result: input?.type ?? "single",
      region: input?.scope ?? "world",
      status,
      timings: { total_ms: performance.now() - startedAt },
      query_count: 0,
      returned_rows: 0,
      cache: "bypass",
      data_version: null,
      error: error instanceof Error ? error.name : "unknown",
    }),
  );
  return buildApiJsonResponse(
    { error: inputError ? error.message : "Rankings are unavailable." },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        ...(error instanceof DatabaseOverloadedError ? { "Retry-After": "1" } : {}),
      },
    },
  );
}

export async function handleRankingsRequest(request: Request) {
  const startedAt = performance.now();
  let input: RankingsQuery | null = null;
  try {
    input = parseRankingsQuery(request);
    if (input.listId && input.hasDynamicList)
      throw new ApiInputError("Choose either a saved list or dynamic WCA IDs.");
    if (input.listId) {
      const loaded = await fetchSavedListRankings(request, input);
      return buildApiJsonResponse(loaded.data, {
        headers: {
          "Cache-Control":
            loaded.list.visibility === "public"
              ? "public, max-age=30, s-maxage=300, stale-while-revalidate=60"
            : "private, no-store",
          "X-Rankings-Memory-Cache": "bypass",
          "X-List-Ranking-Cache": loaded.cacheOutcome ?? "bypass",
        },
      });
    }
    if (input.hasDynamicList) {
      const loaded = await fetchDynamicListRankings(input);
      return buildApiJsonResponse(loaded.data, {
        headers: {
          "Cache-Control": "public, max-age=30, s-maxage=300, stale-while-revalidate=60",
          "X-Rankings-Memory-Cache": "bypass",
          "X-List-Ranking-Cache": loaded.cacheOutcome ?? "bypass",
        },
      });
    }
    return buildGlobalRankingsResponse(input, await fetchGlobalRankings(input, startedAt));
  } catch (error) {
    return buildRankingsErrorResponse(input, startedAt, error);
  }
}
