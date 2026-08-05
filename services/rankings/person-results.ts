import { query } from "@/db";
import {
  parseEvent,
  parseLimit,
  parsePersonId,
  parseResultType,
  parseStart,
  parseYear,
  type QueryTimings,
} from "@/lib/api/projection";
import { formatWcaResult, type RankingType } from "@/lib/wca";
import {
  rankingsWindowCache,
  RANKINGS_WINDOW_SIZE,
} from "@/services/rankings/cache";
import { getCurrentRankingsMetadata } from "@/services/rankings/metadata";
import { personEventResultRankingsQuery } from "@/services/rankings/queries/person-results";

type PersonEventResultInput = {
  personId: string;
  eventId: string;
  resultType: RankingType;
  year: number | null;
  start: number;
  limit: number;
};

type PersonEventResultRow = {
  result_id: number;
  attempt_number: number | null;
  result_value: number;
  rank: number;
  position: number;
  total_count: number;
  person_id: string;
  person_name: string;
  country_id: string;
  country_name: string;
  country_iso2: string;
  continent_id: string;
  competition_id: string;
  competition_name: string;
  competition_start_date: string | null;
  record_code: string;
};

type PersonEventResultEntry = ReturnType<typeof toEntry>;
type PersonEventResultWindow = {
  data: { entries: PersonEventResultEntry[]; total: number };
  timings: QueryTimings;
  queryCount: number;
  returnedRows: number;
};

function isPersonEventResultWindow(
  value: Record<string, unknown>,
): value is PersonEventResultWindow {
  if (!("data" in value) || typeof value.data !== "object" || !value.data) {
    return false;
  }
  return (
    "entries" in value.data &&
    Array.isArray(value.data.entries) &&
    "total" in value.data &&
    Number.isFinite(Number(value.data.total))
  );
}

function parseInput(
  personId: string,
  eventId: string,
  params: URLSearchParams,
): PersonEventResultInput {
  const normalized = new URLSearchParams(params);
  normalized.set("personId", personId);
  normalized.set("eventId", eventId);
  const parsedEventId = parseEvent(normalized);
  return {
    personId: parsePersonId(normalized, { required: true }),
    eventId: parsedEventId!,
    resultType: parseResultType(normalized, parsedEventId),
    year: parseYear(normalized),
    start: parseStart(normalized),
    limit: parseLimit(normalized),
  };
}

function toEntry(row: PersonEventResultRow, input: PersonEventResultInput) {
  return {
    rank: Number(row.rank),
    position: Number(row.position),
    resultId: Number(row.result_id),
    attemptNumber:
      row.attempt_number === null ? null : Number(row.attempt_number),
    resultValue: Number(row.result_value),
    formattedValue: formatWcaResult(
      input.eventId,
      Number(row.result_value),
      input.resultType,
    ),
    personId: row.person_id,
    personName: row.person_name,
    countryId: row.country_id,
    countryName: row.country_name,
    countryIso2: row.country_iso2,
    continentId: row.continent_id,
    competitionId: row.competition_id,
    competitionName: row.competition_name,
    competitionStartDate: row.competition_start_date,
    recordCode: row.record_code,
  };
}

function windowKey(
  input: PersonEventResultInput,
  windowStart: number,
  dataVersion: string,
) {
  return JSON.stringify({
    dataVersion,
    ranking: "person-event-results",
    recordBadges: "current-v1",
    personId: input.personId,
    eventId: input.eventId,
    resultType: input.resultType,
    year: input.year,
    windowStart,
  });
}

async function loadWindow(
  input: PersonEventResultInput,
  windowStart: number,
): Promise<PersonEventResultWindow> {
  const source =
    input.resultType === "single"
      ? "result_rankings_single"
      : "result_rankings_average";
  const rows = await query<PersonEventResultRow>(
    personEventResultRankingsQuery({
      source,
      hasStoredDate: input.resultType === "single",
      year: input.year,
    }),
    [
      input.personId,
      input.eventId,
      ...(input.year === null ? [] : [input.year]),
      windowStart,
      windowStart + RANKINGS_WINDOW_SIZE,
    ],
  );
  return {
    data: {
      entries: rows.rows.map((row) => toEntry(row, input)),
      total: Number(rows.rows[0]?.total_count ?? 0),
    },
    timings: rows.timings,
    queryCount: 1,
    returnedRows: rows.rows.length,
  };
}

export async function loadPersonEventResultRankings(
  personId: string,
  eventId: string,
  params: URLSearchParams,
) {
  const input = parseInput(personId, eventId, params);
  const metadata = await getCurrentRankingsMetadata();
  const windowStart =
    Math.floor((input.start - 1) / RANKINGS_WINDOW_SIZE) *
      RANKINGS_WINDOW_SIZE +
    1;
  const cached = await rankingsWindowCache.getWithStatus(
    windowKey(input, windowStart, metadata.fetchedAt),
    () => loadWindow(input, windowStart),
  );
  if (!isPersonEventResultWindow(cached.value)) {
    throw new Error("The person result cache returned invalid data.");
  }
  const offset = input.start - windowStart;
  const entries = cached.value.data.entries.slice(offset, offset + input.limit);
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
      lastRank: entries.at(-1)?.rank ?? null,
      total,
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
