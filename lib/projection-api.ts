import { DatabaseOverloadedError } from "@/db";
import { getCurrentRankingsMetadata } from "@/lib/rankings-metadata";
import {
  isEventId,
  isGenderFilter,
  normalizeGenderFilters,
  isRankingType,
  parseRegionQuery,
  type RankingType,
  type RegionScope,
  type GenderFilter,
} from "@/lib/wca";

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

export class ApiInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiInputError";
  }
}

export type QueryTimings = { queueMs: number; statementMs: number };
export type ApiDiagnostics = {
  timings: QueryTimings;
  queryCount: number;
  returnedRows: number;
};

export function addTimings(...timings: QueryTimings[]): QueryTimings {
  return timings.reduce(
    (total, timing) => ({
      queueMs: total.queueMs + timing.queueMs,
      statementMs: total.statementMs + timing.statementMs,
    }),
    { queueMs: 0, statementMs: 0 },
  );
}

export function parseLimit(params: URLSearchParams) {
  const value = params.get("limit");
  if (!value) return DEFAULT_PAGE_SIZE;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_PAGE_SIZE) {
    throw new ApiInputError(`limit must be between 1 and ${MAX_PAGE_SIZE}.`);
  }
  return parsed;
}

export function parseGender(params: URLSearchParams) {
  const values = params.getAll("gender").flatMap((value) => value.split(",")).filter(Boolean);
  const unique = [...new Set(values)];
  if (unique.some((value) => !isGenderFilter(value))) {
    throw new ApiInputError("gender must contain only m, f, or o.");
  }
  return normalizeGenderFilters(unique.filter(isGenderFilter));
}

export function parseStart(params: URLSearchParams) {
  const value = params.get("start");
  if (!value) return 1;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new ApiInputError("start must be a positive integer.");
  }
  return parsed;
}

export function parseYear(params: URLSearchParams) {
  const value = params.get("year");
  if (value === null || value === "") return null;
  if (!/^\d{4}$/.test(value)) throw new ApiInputError("year must be a four-digit year.");
  return Number(value);
}

export function parseEvent(params: URLSearchParams, { required = true } = {}) {
  const value = params.get("eventId") ?? params.get("event");
  if (!value && !required) return null;
  if (!isEventId(value)) throw new ApiInputError("eventId is invalid.");
  return value;
}

export function parseResultType(params: URLSearchParams, eventId?: string | null): RankingType {
  const value = params.get("result") ?? params.get("type");
  if (!isRankingType(value)) throw new ApiInputError("result must be single or average.");
  if (eventId === "333mbf" && value === "average") {
    throw new ApiInputError("Multi-Blind does not have Average rankings.");
  }
  return value;
}

export function parseScope(params: URLSearchParams): {
  scope: RegionScope;
  regionId: string;
} {
  return parseRegionQuery(params.get("region"));
}

export function parsePersonId(params: URLSearchParams, { required = false } = {}) {
  const personId = (params.get("personId") ?? "").trim().toUpperCase();
  if (!personId && !required) return "";
  if (!/^\d{4}[A-Z]{4}\d{2}$/.test(personId)) {
    throw new ApiInputError("personId must be a valid WCA ID.");
  }
  return personId;
}

export function optionalInteger(params: URLSearchParams, name: string) {
  const value = params.get(name);
  if (value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new ApiInputError(`${name} must be an integer.`);
  return parsed;
}

export function optionalText(params: URLSearchParams, name: string, maxLength = 100) {
  const value = params.get(name);
  if (value === null || value === "") return null;
  if (value.length > maxLength) throw new ApiInputError(`${name} is too long.`);
  return value;
}

export async function projectionEnvelope<T extends Record<string, unknown>>(
  data: T,
  diagnostics: ApiDiagnostics,
) {
  const metadata = await getCurrentRankingsMetadata();
  return {
    data,
    diagnostics,
    dataVersion: metadata.fetchedAt,
    exportDate: metadata.exportDate,
  };
}

export async function handleProjectionApi(
  request: Request,
  operation: string,
  load: (params: URLSearchParams) => Promise<{
    data: Record<string, unknown>;
    diagnostics: ApiDiagnostics;
  }>,
) {
  const startedAt = performance.now();
  try {
    const loaded = await load(new URL(request.url).searchParams);
    const enveloped = await projectionEnvelope(loaded.data, loaded.diagnostics);
    const totalMs = performance.now() - startedAt;
    const { queueMs, statementMs } = loaded.diagnostics.timings;
    console.info(JSON.stringify({
      operation,
      status: 200,
      timings: { db_queue_ms: queueMs, db_ms: statementMs, total_ms: totalMs },
      query_count: loaded.diagnostics.queryCount,
      returned_rows: loaded.diagnostics.returnedRows,
      data_version: enveloped.dataVersion,
    }));
    return Response.json({
      ...enveloped.data,
      snapshot: {
        exportDate: enveloped.exportDate,
        dataVersion: enveloped.dataVersion,
      },
    }, {
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=3600",
        "Server-Timing": `db-queue;dur=${queueMs.toFixed(1)}, db;dur=${statementMs.toFixed(1)}, total;dur=${totalMs.toFixed(1)}`,
        "X-Rankings-Data-Version": enveloped.dataVersion,
      },
    });
  } catch (error) {
    const inputError = error instanceof ApiInputError;
    const status = inputError ? 400 : 503;
    console.error(JSON.stringify({
      operation,
      status,
      timings: { total_ms: performance.now() - startedAt },
      error: error instanceof Error ? error.name : "unknown",
    }));
    return Response.json(
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
}
