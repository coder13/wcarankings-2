import { getCurrentRankingsMetadata } from "@/services/rankings/metadata";
import {
  isEventId,
  isGenderFilter,
  normalizeGenderFilters,
  isRankingType,
  parseRegionQuery,
  type GenderFilter,
  type RankingType,
  type RegionScope,
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
  cacheOutcome?: "hit" | "miss" | "coalesced" | "bypass";
  cacheLayer?: "memory" | "list-ranking";
};

type QueryParamGuard<T> = (value: string) => value is T;
type NumericQueryParamGuard = (value: number) => boolean;

function getQueryParam(params: URLSearchParams, name: string) {
  return params.get(name);
}

function getQueryParamWithAliases(
  params: URLSearchParams,
  names: readonly string[],
) {
  for (const name of names) {
    const value = getQueryParam(params, name);
    if (value !== null) return value;
  }
  return null;
}

function validateQueryParam<T>(
  value: string | null,
  guard: QueryParamGuard<T>,
  errorMessage: string,
) {
  if (value === null || !guard(value)) throw new ApiInputError(errorMessage);
  return value;
}

function parseOptionalQueryParam<T>(
  params: URLSearchParams,
  name: string,
  guard: QueryParamGuard<T>,
  errorMessage: string,
) {
  const value = getQueryParam(params, name);
  if (value === null || value === "") return null;
  return validateQueryParam(value, guard, errorMessage);
}

function parseIntegerQueryParam(
  params: URLSearchParams,
  name: string,
  defaultValue: number | null,
  guard: NumericQueryParamGuard,
  errorMessage: string,
) {
  const value = getQueryParam(params, name);
  if (value === null || value === "") return defaultValue;
  const parsed = Number(value);
  if (!guard(parsed)) throw new ApiInputError(errorMessage);
  return parsed;
}

function isPageLimit(value: number) {
  return Number.isInteger(value) && value >= 1 && value <= MAX_PAGE_SIZE;
}

function isPositiveInteger(value: number) {
  return Number.isInteger(value) && value >= 1;
}

function isInteger(value: number) {
  return Number.isInteger(value);
}

function isWcaPersonId(value: string): value is string {
  return /^\d{4}[A-Z]{4}\d{2}$/.test(value);
}

function isFourDigitYear(value: string): value is string {
  return /^\d{4}$/.test(value);
}

function createTextLengthGuard(maxLength: number): QueryParamGuard<string> {
  return (value): value is string => value.length <= maxLength;
}

function isGenderFilterValue(value: string): value is GenderFilter {
  return isGenderFilter(value);
}

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
  return parseIntegerQueryParam(
    params,
    "limit",
    DEFAULT_PAGE_SIZE,
    isPageLimit,
    `limit must be between 1 and ${MAX_PAGE_SIZE}.`,
  )!;
}

export function parseGender(params: URLSearchParams) {
  const values = params
    .getAll("gender")
    .flatMap((value) => value.split(","))
    .filter(Boolean);
  const unique = [...new Set(values)];
  return normalizeGenderFilters(
    unique.map((value) =>
      validateQueryParam(
        value,
        isGenderFilterValue,
        "gender must contain only m, f, or o.",
      ),
    ),
  );
}

export function parseStart(params: URLSearchParams) {
  return parseIntegerQueryParam(
    params,
    "start",
    1,
    isPositiveInteger,
    "start must be a positive integer.",
  )!;
}

export function parseYear(params: URLSearchParams) {
  const value = parseOptionalQueryParam(
    params,
    "year",
    isFourDigitYear,
    "year must be a four-digit year.",
  );
  return value === null ? null : Number(value);
}

export function parseEvent(params: URLSearchParams, { required = true } = {}) {
  const value = getQueryParamWithAliases(params, ["eventId", "event"]);
  if ((value === null || value === "") && !required) return null;
  return validateQueryParam(value, isEventId, "eventId is invalid.");
}

export function parseResultType(
  params: URLSearchParams,
  eventId?: string | null,
): RankingType {
  const value = validateQueryParam(
    getQueryParamWithAliases(params, ["result", "type"]),
    isRankingType,
    "result must be single or average.",
  );
  if (eventId === "333mbf" && value === "average") {
    throw new ApiInputError("Multi-Blind does not have Average rankings.");
  }
  return value;
}

export function parseScope(params: URLSearchParams): {
  scope: RegionScope;
  regionId: string;
} {
  return parseRegionQuery(getQueryParam(params, "region"));
}

export function parsePersonId(
  params: URLSearchParams,
  { required = false } = {},
) {
  const personId = (getQueryParam(params, "personId") ?? "")
    .trim()
    .toUpperCase();
  if (!personId && !required) return "";
  return validateQueryParam(
    personId,
    isWcaPersonId,
    "personId must be a valid WCA ID.",
  );
}

export function optionalInteger(params: URLSearchParams, name: string) {
  return parseIntegerQueryParam(
    params,
    name,
    null,
    isInteger,
    `${name} must be an integer.`,
  );
}

export function optionalText(
  params: URLSearchParams,
  name: string,
  maxLength = 100,
) {
  return parseOptionalQueryParam(
    params,
    name,
    createTextLengthGuard(maxLength),
    `${name} is too long.`,
  );
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
