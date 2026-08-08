import { query } from "@/db";
import {
  addTimings,
  ApiInputError,
  parseGender,
  parseLimit,
  parseScope,
  parseStart,
  parseYear,
  type QueryTimings,
} from "@/lib/api/projection";
import { isValidRegexPattern } from "@/lib/wca";
import { searchPersonIds } from "@/services/people/service";
import {
  rankingsWindowCache,
  RANKINGS_WINDOW_SIZE,
} from "@/services/rankings/cache";
import { getCurrentRankingsMetadata } from "@/services/rankings/metadata";
import {
  buildLazyPersonPrStreakQueryPlan,
  buildLazyPersonPrStreakSelectionPlan,
  eagerPersonPrStreakSelectionQuery,
  personPrStreakRankingCountQuery,
  personPrStreakRankingRowsQuery,
} from "@/services/rankings/queries/person-pr-streak";
import type {
  PersonPrStreakRankingInput,
  PersonPrStreakRankingRow,
} from "@/services/rankings/types";

const countFormatter = new Intl.NumberFormat("en-US");
const WCA_ID_PATTERN = /^\d{4}[A-Z0-9]{4}\d{2}$/;
const MAX_SEARCH_RESULTS = 500;

export function formatPrStreak(prStreak: number) {
  return countFormatter.format(prStreak);
}

interface PrStreakWindowData {
  entries: ReturnType<typeof toEntry>[];
  total: number;
}

interface PrStreakWindow extends Record<string, unknown> {
  data: PrStreakWindowData;
  timings: QueryTimings;
  queryCount: number;
  returnedRows: number;
}

function isPrStreakWindow(
  value: Record<string, unknown>,
): value is PrStreakWindow {
  if (typeof value.data !== "object" || value.data === null) return false;
  return (
    "entries" in value.data &&
    Array.isArray(value.data.entries) &&
    "total" in value.data &&
    Number.isFinite(Number(value.data.total))
  );
}

export function parsePersonPrStreakInput(
  params: URLSearchParams,
): PersonPrStreakRankingInput {
  const { scope, regionId } = parseScope(params);
  if (scope !== "world" && !regionId) {
    throw new ApiInputError("Choose a region before loading PR Streak.");
  }
  const locate = (params.get("locate") ?? "").trim().toUpperCase();
  if (locate && !WCA_ID_PATTERN.test(locate)) {
    throw new ApiInputError("locate must be a valid WCA ID.");
  }
  const search = (params.get("search") ?? "").trim().slice(0, 80);
  const regexSearch = params.get("mode") === "vim";
  if (regexSearch && search && !isValidRegexPattern(search)) {
    throw new ApiInputError("Invalid regular expression.");
  }
  return {
    scope,
    regionId,
    gender: parseGender(params),
    year: parseYear(params),
    start: parseStart(params),
    limit: parseLimit(params),
    locate,
    search,
    regexSearch,
    searchLimit: Math.min(
      MAX_SEARCH_RESULTS,
      Math.max(1, Number(params.get("searchLimit")) || MAX_SEARCH_RESULTS),
    ),
  };
}

function toEntry(row: PersonPrStreakRankingRow) {
  const prStreak = Number(row.pr_streak);
  return {
    rank: Number(row.rank),
    subRank: Number(row.position),
    personId: row.person_id,
    personName: row.person_name,
    countryId: row.country_id,
    countryName: row.country_name,
    countryIso2: row.country_iso2,
    best: prStreak,
    formattedValue: formatPrStreak(prStreak),
    competitionId: "",
    competitionName: "",
    recordBadges: [],
  };
}

function usesLazyRanking(input: PersonPrStreakRankingInput) {
  return input.year !== null || input.gender.length > 1;
}

async function loadWindow(
  input: PersonPrStreakRankingInput,
  windowStart: number,
): Promise<PrStreakWindow> {
  if (!usesLazyRanking(input)) {
    const gender = input.gender[0] ?? "all";
    const [rows, counts] = await Promise.all([
      query<PersonPrStreakRankingRow>(personPrStreakRankingRowsQuery(), [
        input.scope,
        input.regionId,
        gender,
        windowStart,
        windowStart + RANKINGS_WINDOW_SIZE,
      ]),
      query<{ count: number }>(personPrStreakRankingCountQuery(), [
        input.scope,
        input.regionId,
        gender,
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

  const plan = buildLazyPersonPrStreakQueryPlan(input);
  const [rows, counts] = await Promise.all([
    query<PersonPrStreakRankingRow>(plan.rowsQuery, [
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
  input: PersonPrStreakRankingInput,
  windowStart: number,
  dataVersion: string,
) {
  return JSON.stringify({
    dataVersion,
    ranking: "person-pr-streak",
    scope: input.scope,
    regionId: input.regionId,
    gender: input.gender,
    year: input.year,
    windowStart,
  });
}

async function loadSelectedPeople(
  input: PersonPrStreakRankingInput,
  personIds: readonly string[],
) {
  if (personIds.length === 0) {
    return { rows: [], timings: { queueMs: 0, statementMs: 0 } };
  }
  if (!usesLazyRanking(input)) {
    return query<PersonPrStreakRankingRow>(
      eagerPersonPrStreakSelectionQuery(personIds),
      [input.scope, input.regionId, input.gender[0] ?? "all", ...personIds],
    );
  }
  const plan = buildLazyPersonPrStreakSelectionPlan(input, personIds);
  return query<PersonPrStreakRankingRow>(plan.query, plan.values);
}

async function loadSearchOrLocate(input: PersonPrStreakRankingInput) {
  if (input.locate) {
    const result = await loadSelectedPeople(input, [input.locate]);
    return {
      data: { located: result.rows[0] ? toEntry(result.rows[0]) : null },
      diagnostics: {
        timings: result.timings,
        queryCount: 1,
        returnedRows: result.rows.length,
      },
    };
  }

  const people = await searchPersonIds(
    input.search,
    input.regexSearch,
    input.searchLimit,
  );
  if (people.personIds.length === 0) {
    return {
      data: {
        entries: [],
        hasMore: false,
        nextPageStart: null,
        previousPageStart: null,
        total: 0,
      },
      diagnostics: {
        timings: people.timings,
        queryCount: 1,
        returnedRows: people.returnedRows,
      },
    };
  }
  const result = await loadSelectedPeople(input, people.personIds);
  const entries = result.rows.map(toEntry);
  return {
    data: {
      entries,
      hasMore: false,
      nextPageStart: null,
      previousPageStart: null,
      total: entries.length,
    },
    diagnostics: {
      timings: addTimings(people.timings, result.timings),
      queryCount: 2,
      returnedRows: people.returnedRows + result.rows.length,
    },
  };
}

export async function loadPersonPrStreakRankings(params: URLSearchParams) {
  const input = parsePersonPrStreakInput(params);
  if (input.locate || input.search) return loadSearchOrLocate(input);

  const metadata = await getCurrentRankingsMetadata();
  const windowStart =
    Math.floor((input.start - 1) / RANKINGS_WINDOW_SIZE) *
      RANKINGS_WINDOW_SIZE +
    1;
  const cached = await rankingsWindowCache.getWithStatus(
    windowKey(input, windowStart, metadata.fetchedAt),
    () => loadWindow(input, windowStart),
  );
  if (!isPrStreakWindow(cached.value)) {
    throw new Error(
      "The PR Streak ranking window cache returned invalid data.",
    );
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
      exportDate: metadata.exportDate,
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
