import { DatabaseOverloadedError } from "@/db";
import { buildApiJsonResponse } from "@/lib/api";
import { ApiInputError, projectionEnvelope, type ApiDiagnostics } from "@/lib/api/projection";

type ProjectionResult = {
  data: Record<string, unknown>;
  diagnostics: ApiDiagnostics;
};

function parseProjectionRequest(request: Request) {
  const requestUrl = new URL(request.url);
  return requestUrl.searchParams;
}

async function buildProjectionResponse(
  operation: string,
  startedAt: number,
  loaded: ProjectionResult,
) {
  const enveloped = await projectionEnvelope(loaded.data, loaded.diagnostics);
  const totalMs = performance.now() - startedAt;
  const { queueMs, statementMs } = loaded.diagnostics.timings;
  const cacheOutcome = loaded.diagnostics.cacheOutcome ?? "bypass";
  const memoryCache = loaded.diagnostics.cacheLayer === "memory" ? cacheOutcome : "bypass";
  const listRankingCache = loaded.diagnostics.cacheLayer === "list-ranking" ? cacheOutcome : "bypass";
  console.info(
    JSON.stringify({
      operation,
      status: 200,
      timings: { db_queue_ms: queueMs, db_ms: statementMs, total_ms: totalMs },
      query_count: loaded.diagnostics.queryCount,
      returned_rows: loaded.diagnostics.returnedRows,
      cache: cacheOutcome,
      data_version: enveloped.dataVersion,
    }),
  );
  return buildApiJsonResponse(
    {
      ...enveloped.data,
      snapshot: { exportDate: enveloped.exportDate, dataVersion: enveloped.dataVersion },
    },
    {
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=3600",
        "Server-Timing": `db-queue;dur=${queueMs.toFixed(1)}, db;dur=${statementMs.toFixed(1)}, total;dur=${totalMs.toFixed(1)}`,
        "X-Rankings-Data-Version": enveloped.dataVersion,
        "X-Rankings-Cache": cacheOutcome,
        "X-Rankings-Memory-Cache": memoryCache,
        "X-List-Ranking-Cache": listRankingCache,
      },
    },
  );
}

function buildProjectionErrorResponse(operation: string, startedAt: number, error: unknown) {
  const inputError = error instanceof ApiInputError;
  const status = inputError ? 400 : 503;
  console.error(
    JSON.stringify({
      operation,
      status,
      timings: { total_ms: performance.now() - startedAt },
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

export async function handleProjectionRequest(
  request: Request,
  operation: string,
  fetchData: (params: URLSearchParams) => Promise<ProjectionResult>,
) {
  const startedAt = performance.now();
  try {
    const params = parseProjectionRequest(request);
    const loaded = await fetchData(params);
    return buildProjectionResponse(operation, startedAt, loaded);
  } catch (error) {
    return buildProjectionErrorResponse(operation, startedAt, error);
  }
}
