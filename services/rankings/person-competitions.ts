import { query } from "@/db";
import {
  addTimings,
  ApiInputError,
  parseGender,
  parseLimit,
  parseScope,
  parseStart,
  parseYear,
} from "@/lib/api/projection";
import type { QueryTimings } from "@/lib/api/projection";
import {
  rankingsWindowCache,
  RANKINGS_WINDOW_SIZE,
} from "@/services/rankings/cache";
import { getCurrentRankingsMetadata } from "@/services/rankings/metadata";
import {
  buildLazyPersonCompetitionQueryPlan,
  personCompetitionRankingCountQuery,
  personCompetitionRankingRowsQuery,
} from "@/services/rankings/queries/person-competitions";
import type {
  PersonCompetitionRankingInput,
  PersonCompetitionRankingRow,
} from "@/services/rankings/types";

const countFormatter = new Intl.NumberFormat("en-US");

interface CompetitionWindowData {
  entries: ReturnType<typeof toEntry>[];
  total: number;
}

interface CompetitionWindow extends Record<string, unknown> {
  data: CompetitionWindowData;
  timings: QueryTimings;
  queryCount: number;
  returnedRows: number;
}

function isCompetitionWindow(
  value: Record<string, unknown>,
): value is CompetitionWindow {
  if (typeof value.data !== "object" || value.data === null) return false;
  return (
    "entries" in value.data &&
    Array.isArray(value.data.entries) &&
    "total" in value.data &&
    Number.isFinite(Number(value.data.total))
  );
}

function parseInput(params: URLSearchParams): PersonCompetitionRankingInput {
  const { scope, regionId } = parseScope(params);
  if (scope !== "world" && !regionId) {
    throw new ApiInputError(
      "Choose a region before loading competition rankings.",
    );
  }
  return {
    scope,
    regionId,
    gender: parseGender(params),
    year: parseYear(params),
    start: parseStart(params),
    limit: parseLimit(params),
  };
}

function toEntry(row: PersonCompetitionRankingRow) {
  const competitionCount = Number(row.competition_count);
  return {
    rank: Number(row.rank),
    position: Number(row.position),
    personId: row.person_id,
    personName: row.person_name,
    countryName: row.country_name,
    countryIso2: row.country_iso2,
    best: competitionCount,
    formattedValue: `${countFormatter.format(competitionCount)} competitions`,
    competitionId: "",
    competitionName: "",
    recordBadges: [],
  };
}

async function loadLazyWindow(
  input: PersonCompetitionRankingInput,
  windowStart: number,
): Promise<CompetitionWindow> {
  const plan = buildLazyPersonCompetitionQueryPlan(input);
  const [rows, counts] = await Promise.all([
    query<PersonCompetitionRankingRow>(plan.rowsQuery, [
      ...plan.values,
      windowStart,
      windowStart + RANKINGS_WINDOW_SIZE,
    ]),
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
  input: PersonCompetitionRankingInput,
  windowStart: number,
  dataVersion: string,
) {
  return JSON.stringify({
    dataVersion,
    scope: input.scope,
    regionId: input.regionId,
    gender: input.gender,
    year: input.year,
    windowStart,
  });
}

export async function loadPersonCompetitionRankings(params: URLSearchParams) {
  const input = parseInput(params);
  if (input.year !== null || input.gender.length > 1) {
    const metadata = await getCurrentRankingsMetadata();
    const windowStart =
      Math.floor((input.start - 1) / RANKINGS_WINDOW_SIZE) *
        RANKINGS_WINDOW_SIZE +
      1;
    const cached = await rankingsWindowCache.getWithStatus(
      windowKey(input, windowStart, metadata.fetchedAt),
      () => loadLazyWindow(input, windowStart),
    );
    if (!isCompetitionWindow(cached.value)) {
      throw new Error(
        "The competition ranking window cache returned invalid data.",
      );
    }
    const offset = input.start - windowStart;
    const entries = cached.value.data.entries.slice(
      offset,
      offset + input.limit,
    );
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

  const gender = input.gender[0] ?? "all";
  const [rows, counts] = await Promise.all([
    query<PersonCompetitionRankingRow>(personCompetitionRankingRowsQuery(), [
      input.scope,
      input.regionId,
      gender,
      input.start,
      input.limit + 1,
    ]),
    query<{ count: number }>(personCompetitionRankingCountQuery(), [
      input.scope,
      input.regionId,
      gender,
    ]),
  ]);
  const pageRows = rows.rows.slice(0, input.limit);
  const last = pageRows.at(-1);
  return {
    data: {
      entries: pageRows.map(toEntry),
      hasMore: rows.rows.length > input.limit,
      nextPageStart:
        rows.rows.length > input.limit && last
          ? Number(last.position) + 1
          : null,
      previousPageStart:
        input.start > 1 ? Math.max(1, input.start - input.limit) : null,
      startPosition: Number(pageRows[0]?.position ?? input.start) - 1,
      lastRank: last ? Number(last.rank) : null,
      total: Number(counts.rows[0]?.count ?? 0),
    },
    diagnostics: {
      timings: addTimings(rows.timings, counts.timings),
      queryCount: 2,
      returnedRows: rows.rows.length + counts.rows.length,
    },
  };
}
