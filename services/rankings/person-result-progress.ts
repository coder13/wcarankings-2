import { query } from "@/db";
import {
  parseEvent,
  parsePersonId,
  parseResultType,
  parseYear,
  type QueryTimings,
} from "@/lib/api/projection";
import type { RankingType } from "@/lib/wca";
import { rankingsWindowCache } from "@/services/rankings/cache";
import { getCurrentRankingsMetadata } from "@/services/rankings/metadata";
import { personEventResultProgressQuery } from "@/services/rankings/queries/person-results";

type PersonResultProgressInput = {
  personId: string;
  eventId: string;
  resultType: RankingType;
  year: number | null;
};

type PersonResultProgressRow = {
  competition_id: string;
  competition_name: string;
  competition_start_date: string;
  result_value: number;
};

export type PersonResultProgressPoint = {
  competitionId: string;
  competitionName: string;
  competitionStartDate: string;
  resultValue: number;
};

type PersonResultProgressCacheValue = {
  data: { points: PersonResultProgressPoint[] };
  timings: QueryTimings;
  queryCount: number;
  returnedRows: number;
};

function isPersonResultProgressCacheValue(
  value: Record<string, unknown>,
): value is PersonResultProgressCacheValue {
  if (!("data" in value) || typeof value.data !== "object" || !value.data) {
    return false;
  }
  return "points" in value.data && Array.isArray(value.data.points);
}

function parseInput(
  personId: string,
  eventId: string,
  params: URLSearchParams,
): PersonResultProgressInput {
  const normalized = new URLSearchParams(params);
  normalized.set("personId", personId);
  normalized.set("eventId", eventId);
  const parsedEventId = parseEvent(normalized)!;

  return {
    personId: parsePersonId(normalized, { required: true }),
    eventId: parsedEventId,
    resultType: parseResultType(normalized, parsedEventId),
    year: parseYear(normalized),
  };
}

function progressCacheKey(
  input: PersonResultProgressInput,
  dataVersion: string,
) {
  return JSON.stringify({
    dataVersion,
    ranking: "person-event-result-progress",
    personId: input.personId,
    eventId: input.eventId,
    resultType: input.resultType,
    year: input.year,
  });
}

async function loadProgress(
  input: PersonResultProgressInput,
): Promise<PersonResultProgressCacheValue> {
  const rows = await query<PersonResultProgressRow>(
    personEventResultProgressQuery({
      source:
        input.resultType === "single"
          ? "result_rankings_single"
          : "result_rankings_average",
      hasStoredDate: input.resultType === "single",
      year: input.year,
    }),
    [
      input.personId,
      input.eventId,
      ...(input.year === null ? [] : [input.year]),
    ],
  );

  return {
    data: {
      points: rows.rows.map((row) => ({
        competitionId: row.competition_id,
        competitionName: row.competition_name,
        competitionStartDate: row.competition_start_date,
        resultValue: Number(row.result_value),
      })),
    },
    timings: rows.timings,
    queryCount: 1,
    returnedRows: rows.rowCount,
  };
}

export async function loadPersonEventResultProgress(
  personId: string,
  eventId: string,
  params: URLSearchParams,
) {
  const input = parseInput(personId, eventId, params);
  const metadata = await getCurrentRankingsMetadata();
  const cached = await rankingsWindowCache.getWithStatus(
    progressCacheKey(input, metadata.fetchedAt),
    () => loadProgress(input),
  );
  if (!isPersonResultProgressCacheValue(cached.value)) {
    throw new Error("The result progress cache returned invalid data.");
  }

  return {
    data: {
      ...cached.value.data,
      availableYears: metadata.availableYears,
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
