import { query } from "@/db";
import {
  addTimings,
  ApiInputError,
  parseEvent,
  parseGender,
  parseLimit,
  parseScope,
  parseStart,
  parseYear,
} from "@/lib/api/projection";
import { getCurrentRankingsMetadata } from "@/services/rankings/metadata";
import {
  rankingsWindowCache,
  RANKINGS_WINDOW_SIZE,
} from "@/services/rankings/cache";
import { isMedalRankingType } from "@/lib/medal-rankings";
import type { QueryTimings } from "@/lib/api/projection";
import {
  buildLazyMedalQueryPlan,
  eagerMedalCountQuery,
  eagerMedalRowsQuery,
} from "@/services/rankings/queries/medals";
import type { MedalRankingInput } from "@/services/rankings/types";

const medalCountFormatter = new Intl.NumberFormat("en-US");

type MedalRow = {
  rank: number;
  position: number;
  total_count?: number;
  person_id: string;
  person_name: string;
  country_id: string;
  country_name: string;
  country_iso2: string;
  medal_count: number;
};

type MedalEntry = ReturnType<typeof toEntry>;

interface MedalWindowData {
  entries: MedalEntry[];
  total: number;
}

interface MedalWindow extends Record<string, unknown> {
  data: MedalWindowData;
  timings: QueryTimings;
  queryCount: number;
  returnedRows: number;
}

function isMedalWindow(value: Record<string, unknown>): value is MedalWindow {
  if (typeof value.data !== "object" || value.data === null) return false;
  return (
    "entries" in value.data &&
    Array.isArray(value.data.entries) &&
    "total" in value.data &&
    Number.isFinite(Number(value.data.total))
  );
}

function isMedalType(
  value: string | null,
): value is MedalRankingInput["medalType"] {
  return value !== null && isMedalRankingType(value);
}

function parseMedalType(
  params: URLSearchParams,
): MedalRankingInput["medalType"] {
  const value = params.get("medal") ?? params.get("stat") ?? "overall";
  if (!isMedalType(value)) {
    throw new ApiInputError("medal must be overall, gold, silver, or bronze.");
  }
  return value;
}

function parseInput(params: URLSearchParams): MedalRankingInput {
  const { scope, regionId } = parseScope(params);
  if (scope !== "world" && !regionId) {
    throw new ApiInputError("Choose a region before loading medal rankings.");
  }
  return {
    eventId: parseEvent(params, { required: false }),
    medalType: parseMedalType(params),
    scope,
    regionId,
    gender: parseGender(params),
    year: parseYear(params),
    start: parseStart(params),
    limit: parseLimit(params),
  };
}

function toEntry(row: MedalRow) {
  const medalCount = Number(row.medal_count);
  return {
    rank: Number(row.rank),
    subRank: Number(row.position),
    personId: row.person_id,
    personName: row.person_name,
    countryId: row.country_id,
    countryName: row.country_name,
    countryIso2: row.country_iso2,
    best: medalCount,
    formattedValue: `${medalCountFormatter.format(medalCount)} medals`,
    competitionId: "",
    competitionName: "",
    recordBadges: [],
  };
}

async function loadMedalWindow(input: MedalRankingInput, windowStart: number) {
  const windowEnd = windowStart + RANKINGS_WINDOW_SIZE;
  if (input.year === null && input.gender.length === 0) {
    const eventId = input.eventId ?? "";
    const [rows, counts] = await Promise.all([
      query<MedalRow>(eagerMedalRowsQuery(), [
        eventId,
        input.medalType,
        input.scope,
        input.regionId,
        windowStart,
        windowEnd,
      ]),
      query<{ count: number }>(eagerMedalCountQuery(), [
        eventId,
        input.medalType,
        input.scope,
        input.regionId,
      ]),
    ]);
    return {
      data: {
        entries: rows.rows.map(toEntry),
        total: Number(counts.rows[0]?.count ?? 0),
      },
      timings: addTimings(rows.timings, counts.timings),
      queryCount: 2,
      returnedRows: rows.rows.length + counts.rows.length,
    };
  }
  const plan = buildLazyMedalQueryPlan(input);
  const [rows, counts] = await Promise.all([
    query<MedalRow>(plan.rowsQuery, [...plan.values, windowStart, windowEnd]),
    query<{ count: number }>(plan.countQuery, plan.values),
  ]);
  return {
    data: {
      entries: rows.rows.map(toEntry),
      total: Number(counts.rows[0]?.count ?? 0),
    },
    timings: addTimings(rows.timings, counts.timings),
    queryCount: 2,
    returnedRows: rows.rows.length + counts.rows.length,
  };
}

function windowKey(
  input: MedalRankingInput,
  windowStart: number,
  dataVersion: string,
) {
  return JSON.stringify({
    dataVersion,
    eventId: input.eventId,
    medalType: input.medalType,
    scope: input.scope,
    regionId: input.regionId,
    gender: input.gender,
    year: input.year,
    windowStart,
  });
}

export async function loadPersonMedalRankings(params: URLSearchParams) {
  const input = parseInput(params);
  const metadata = await getCurrentRankingsMetadata();
  const windowStart =
    Math.floor((input.start - 1) / RANKINGS_WINDOW_SIZE) *
      RANKINGS_WINDOW_SIZE +
    1;
  const cached = await rankingsWindowCache.getWithStatus(
    windowKey(input, windowStart, metadata.fetchedAt),
    () => loadMedalWindow(input, windowStart),
  );
  if (!isMedalWindow(cached.value)) {
    throw new Error("The medal ranking window cache returned invalid data.");
  }
  const offset = input.start - windowStart;
  const allEntries = cached.value.data.entries;
  const entries = allEntries.slice(offset, offset + input.limit);
  const total = cached.value.data.total;
  const startPosition = Math.min(Math.max(0, input.start - 1), total);
  const hasMore = startPosition + entries.length < total;
  return {
    data: {
      entries,
      hasMore,
      nextPageStart: hasMore ? input.start + input.limit : null,
      previousPageStart:
        input.start > 1 && total > 0
          ? Math.max(1, input.start - input.limit)
          : null,
      startPosition,
      lastRank: entries.at(-1)?.subRank ?? null,
      total,
    },
    diagnostics: {
      timings:
        cached.outcome === "hit"
          ? { queueMs: 0, statementMs: 0 }
          : cached.value.timings,
      queryCount: cached.value.queryCount,
      returnedRows: cached.value.returnedRows,
      cacheOutcome: cached.outcome,
      cacheLayer: "memory" as const,
    },
  };
}
