import {
  ApiInputError,
  parseEvent,
  parseGender,
  parseLimit,
  parseResultType,
  parseScope,
  parseYear,
} from "@/lib/api/projection";
import type { ResultRankingRequest } from "@/services/rankings/result-types";

function parsePageStart(params: URLSearchParams): number {
  const raw = params.get("start") ?? "0";
  const start = Number(raw);
  if (!Number.isInteger(start) || start < 0) {
    throw new ApiInputError("start must be a non-negative integer.");
  }
  return start;
}

function parseSearchLimit(params: URLSearchParams): number {
  const raw = params.get("searchLimit") ?? "500";
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new ApiInputError("searchLimit must be between 1 and 500.");
  }
  return limit;
}

export function parseResultRankingRequest(
  params: URLSearchParams,
): ResultRankingRequest {
  const eventId = parseEvent(params);
  if (eventId === null) throw new ApiInputError("eventId is invalid.");
  const resultType = parseResultType(params, eventId);
  const { scope, regionId } = parseScope(params);
  const requestedStart = parsePageStart(params);
  const requestedLimit = parseLimit(params);
  const search = (params.get("search") ?? "").trim().slice(0, 80);

  return {
    eventId,
    resultType,
    scope,
    regionId,
    requestedStart,
    requestedLimit,
    start: requestedStart,
    limit: requestedLimit,
    search,
    searchLimit: search ? parseSearchLimit(params) : null,
    regexSearch: params.get("mode") === "vim",
    baseTable:
      resultType === "average"
        ? "result_rankings_average"
        : "result_rankings_single",
    gender: parseGender(params),
    year: parseYear(params),
  };
}

export function withResultRankingWindow(
  input: ResultRankingRequest,
  start: number,
  limit: number,
): ResultRankingRequest {
  return { ...input, start, limit };
}
