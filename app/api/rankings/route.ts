import { DatabaseOverloadedError } from "@/db";
import { apiError } from "@/lib/api";
import { getAuthUser } from "@/lib/auth";
import { DynamicListInputError, parseDynamicListIds, resolveDynamicList } from "@/lib/dynamic-list";
import { loadDynamicListRankings, loadListRankings } from "@/lib/list-rankings";
import { assertCanViewList, resolveList } from "@/lib/lists";
import { loadRankingsWithDiagnostics } from "@/lib/rankings";
import { ApiInputError } from "@/lib/projection-api";
import { isRankingEventId, isRankingType, parseRegionQuery } from "@/lib/wca";

export const dynamic = "force-dynamic";

function databaseErrorDetails(error: unknown) {
  if (!(error instanceof Error)) return { name: "unknown" };
  const databaseError = error as Error & {
    code?: string;
    errno?: number;
    sqlState?: string;
  };
  return {
    name: error.name,
    ...(databaseError.code ? { code: databaseError.code } : {}),
    ...(databaseError.errno ? { errno: databaseError.errno } : {}),
    ...(databaseError.sqlState ? { sql_state: databaseError.sqlState } : {}),
    message: error.message.slice(0, 240),
  };
}

export async function GET(request: Request) {
  const startedAt = performance.now();
  const searchParams = new URL(request.url).searchParams;
  const rawEventId = searchParams.get("eventId") ?? searchParams.get("event");
  const rawType = searchParams.get("result") ?? searchParams.get("type");
  const listId = searchParams.get("list")?.trim();
  const hasDynamicList = searchParams.has("wca_ids");
  const eventId = isRankingEventId(rawEventId) ? rawEventId : "333";
  const type = eventId === "333mbf" || eventId === "sor-kinch" ? "single" : isRankingType(rawType) ? rawType : "single";
  const { scope } = parseRegionQuery(searchParams.get("region"));

  try {
    if (listId && hasDynamicList) throw new ApiInputError("Choose either a saved list or dynamic WCA IDs.");
    if (listId) {
      const [list, user] = await Promise.all([
        resolveList(listId),
        getAuthUser(request),
      ]);
      assertCanViewList(list, user);
      const listResult = await loadListRankings(list, searchParams);
      const inputStart = Number(searchParams.get("start")) || 0;
      const data = searchParams.get("locate")
        ? { located: listResult.entries[0] ?? null }
        : {
            entries: listResult.entries,
            hasMore: listResult.hasMore,
            nextPageStart: listResult.nextStart === null ? null : listResult.nextStart + 1,
            previousPageStart: inputStart > 0
              ? Math.max(0, inputStart - Number(searchParams.get("limit") || 50)) + 1
              : null,
            startPosition: inputStart,
            lastRank: listResult.entries.at(-1)?.subRank ?? null,
            total: listResult.total,
            exportDate: listResult.exportDate,
          };
      return Response.json(data, {
        headers: {
          "Cache-Control": list.visibility === "public"
            ? "public, max-age=30, s-maxage=300, stale-while-revalidate=60"
            : "private, no-store",
        },
      });
    }
    if (hasDynamicList) {
      const input = parseDynamicListIds(searchParams.getAll("wca_ids"));
      const dynamicList = await resolveDynamicList(input.personIds);
      const rankings = await loadDynamicListRankings(dynamicList.personIds, searchParams);
      const inputStart = Number(searchParams.get("start")) || 0;
      const data = searchParams.get("locate")
        ? { located: rankings.entries[0] ?? null }
        : {
            entries: rankings.entries,
            hasMore: rankings.hasMore,
            nextPageStart: rankings.nextStart === null ? null : rankings.nextStart + 1,
            previousPageStart: inputStart > 0
              ? Math.max(0, inputStart - Number(searchParams.get("limit") || 50)) + 1
              : null,
            startPosition: inputStart,
            lastRank: rankings.entries.at(-1)?.subRank ?? null,
            total: rankings.total,
            exportDate: rankings.exportDate,
          };
      return Response.json(data, { headers: { "Cache-Control": "public, max-age=30, s-maxage=300, stale-while-revalidate=60" } });
    }
    const validationAt = performance.now();
    const result = await loadRankingsWithDiagnostics(searchParams);
    const totalMs = performance.now() - startedAt;
    const queueMs = result.timings?.queueMs ?? 0;
    const statementMs = result.timings?.statementMs ?? 0;
    const cacheMs = Math.max(0, totalMs - (validationAt - startedAt) - queueMs - statementMs);
    const serverTiming = `validation;dur=${(validationAt - startedAt).toFixed(1)}, cache;dur=${cacheMs.toFixed(1)}, db-queue;dur=${queueMs.toFixed(1)}, db;dur=${statementMs.toFixed(1)}, serialization;dur=0.0, total;dur=${totalMs.toFixed(1)}`;
    console.info(JSON.stringify({ operation: "rankings", eventId, result: type, region: scope, status: 200, timings: { validation_ms: validationAt - startedAt, cache_ms: cacheMs, db_queue_ms: queueMs, db_ms: statementMs, serialization_ms: 0, total_ms: totalMs }, query_count: result.queryCount, returned_rows: result.returnedRows, cache: result.cacheOutcome, data_version: result.dataVersion }));
    return Response.json(result.data, {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=3600", "Server-Timing": serverTiming, "X-Rankings-Cache": result.cacheOutcome, "X-Rankings-Data-Version": result.dataVersion ?? "unknown" },
    });
  } catch (error) {
    if (listId) return apiError(error);
    const inputError = error instanceof ApiInputError || error instanceof DynamicListInputError;
    const status = inputError ? 400 : 503;
    console.error(JSON.stringify({ operation: "rankings", eventId, result: type, region: scope, status, timings: { total_ms: performance.now() - startedAt }, query_count: 0, returned_rows: 0, cache: "bypass", data_version: null, error: databaseErrorDetails(error) }));

    return Response.json(
      { error: inputError ? error.message : "Rankings are unavailable." },
      { status, headers: { "Cache-Control": "no-store", ...(error instanceof DatabaseOverloadedError ? { "Retry-After": "1" } : {}) } },
    );
  }
}
