import { query } from "@/db";
import {
  addTimings,
  ApiInputError,
  parseEvent,
  parseLimit,
  parseResultType,
  parseGender,
  parseScope,
  parseYear,
} from "@/lib/api/projection";
import { searchPersonIds } from "@/services/people/service";
import { getRecordBadges } from "@/lib/wca";
import { getCurrentRankingsMetadata } from "@/services/rankings/metadata";
import {
  rankingsWindowCache,
  RANKINGS_WINDOW_SIZE,
} from "@/services/rankings/cache";
import type { ResultRankingRow } from "@/services/rankings/types";
import {
  filteredResultRankingsQuery,
  lazySingleResultRankingsQuery,
  resultRankingCountsQuery,
  resultRankingsQuery,
} from "@/services/rankings/queries";

function parsePageStart(params: URLSearchParams) {
  const raw = params.get("start") ?? "0";
  const start = Number(raw);
  if (!Number.isInteger(start) || start < 0) {
    throw new ApiInputError("start must be a non-negative integer.");
  }
  return start;
}

function parseSearchLimit(params: URLSearchParams) {
  const raw = params.get("searchLimit") ?? "500";
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new ApiInputError("searchLimit must be between 1 and 500.");
  }
  return limit;
}

function resultWindowKey(
  params: URLSearchParams,
  windowStart: number,
  dataVersion: string,
) {
  return JSON.stringify({
    dataVersion,
    eventId: params.get("eventId") ?? params.get("event"),
    result: params.get("result") ?? params.get("type"),
    region: params.get("region") ?? "world",
    gender: params.getAll("gender").sort(),
    year: params.get("year"),
    windowStart,
  });
}

function sliceResultWindow(
  data: Record<string, unknown>,
  start: number,
  limit: number,
  windowStart: number,
) {
  const windowEntries = Array.isArray(data.entries)
    ? (data.entries as Array<Record<string, unknown>>)
    : [];
  const entries = windowEntries.slice(
    start - windowStart,
    start - windowStart + limit,
  );
  const total = Number(data.total ?? 0);
  const hasMore = start + entries.length < total;
  return {
    ...data,
    entries,
    hasMore,
    nextPageStart: hasMore ? start + limit : null,
    previousPageStart: start > 0 ? Math.max(0, start - limit) : null,
    startPosition: start,
    lastRank: entries.at(-1)?.rank ?? null,
    total,
  };
}

type ResultWindowOverride = { start: number; limit: number };

export async function loadResultRankings(
  params: URLSearchParams,
  windowOverride?: ResultWindowOverride,
) {
  const eventId = parseEvent(params);
  const resultType = parseResultType(params, eventId);
  const { scope, regionId } = parseScope(params);
  const requestedStart = parsePageStart(params);
  const requestedLimit = parseLimit(params);
  const start = windowOverride?.start ?? requestedStart;
  const limit = windowOverride?.limit ?? requestedLimit;
  const search = (params.get("search") ?? "").trim().slice(0, 80);
  const regexSearch = params.get("mode") === "vim";
  const baseTable =
    resultType === "average"
      ? "result_rankings_average"
      : "result_rankings_single";
  const gender = parseGender(params);
  const year = parseYear(params);
  if (!windowOverride && !search) {
    const metadata = await getCurrentRankingsMetadata();
    const windowStart =
      Math.floor(requestedStart / RANKINGS_WINDOW_SIZE) * RANKINGS_WINDOW_SIZE;
    const cached = await rankingsWindowCache.getWithStatus(
      resultWindowKey(params, windowStart, metadata.fetchedAt),
      async () =>
        loadResultRankings(params, {
          start: windowStart,
          limit: RANKINGS_WINDOW_SIZE,
        }).then((result) => result as unknown as Record<string, unknown>),
    );
    const value = cached.value as unknown as {
      data: Record<string, unknown>;
      diagnostics: {
        timings: { queueMs: number; statementMs: number };
        queryCount: number;
        returnedRows: number;
      };
    };
    const data = sliceResultWindow(
      value.data,
      requestedStart,
      requestedLimit,
      windowStart,
    );
    const nextWindowStart = windowStart + RANKINGS_WINDOW_SIZE;
    if (
      requestedStart - windowStart >= RANKINGS_WINDOW_SIZE / 2 &&
      nextWindowStart < Number(data.total ?? 0)
    ) {
      void rankingsWindowCache
        .getWithStatus(
          resultWindowKey(params, nextWindowStart, metadata.fetchedAt),
          async () =>
            loadResultRankings(params, {
              start: nextWindowStart,
              limit: RANKINGS_WINDOW_SIZE,
            }).then((result) => result as unknown as Record<string, unknown>),
        )
        .catch((error) =>
          console.warn("Result ranking window prefetch failed", error),
        );
    }
    return {
      data,
      diagnostics: {
        ...value.diagnostics,
        ...(cached.outcome === "hit"
          ? {
              timings: { queueMs: 0, statementMs: 0 },
              queryCount: 0,
              returnedRows: 0,
            }
          : {}),
        cacheOutcome: cached.outcome,
        cacheLayer: "memory" as const,
      },
    };
  }
  const yearSingle = resultType === "single" && year !== null;
  const lazySingle =
    resultType === "single" && year === null && gender.length > 0;
  const dynamicSingle = yearSingle || lazySingle;
  const lazyAverage =
    resultType === "average" && (year !== null || gender.length > 0);
  const table = baseTable;
  const rankColumn = `${scope}_rank`;
  const positionColumn = `${scope}_position`;
  const conditions = ["ranking.event_id = ?"];
  const values: unknown[] = [eventId];
  const lazyConditions = ["solve.event_id = ?"];
  const lazyValues: unknown[] = [eventId];
  const yearSingleConditions = [
    "facts.competition_year = ?",
    "facts.event_id = ?",
    "attempt.value > 0",
  ];
  const yearSingleValues: unknown[] = [year, eventId];
  const averageConditions = ["result.event_id = ?"];
  const averageValues: unknown[] = [eventId];
  const averageJoins = [
    "JOIN result_facts average_facts ON average_facts.result_id = result.result_id",
  ];
  if (gender.length) {
    lazyConditions.push(
      `solve.gender IN (${gender.map(() => "?").join(", ")})`,
    );
    lazyValues.push(...gender);
    if (yearSingle) {
      yearSingleConditions.push(
        `facts.gender IN (${gender.map(() => "?").join(", ")})`,
      );
      yearSingleValues.push(...gender);
    }
    if (resultType === "average") {
      averageConditions.push(
        `result.gender IN (${gender.map(() => "?").join(", ")})`,
      );
      averageValues.push(...gender);
    }
  }
  if (scope !== "world") {
    conditions.push(`ranking.${scope}_id = ?`);
    values.push(regionId);
    lazyConditions.push(`solve.${scope}_id = ?`);
    lazyValues.push(regionId);
    yearSingleConditions.push(`facts.person_${scope}_id = ?`);
    yearSingleValues.push(regionId);
    averageConditions.push(`result.${scope}_id = ?`);
    averageValues.push(regionId);
  }
  if (year !== null) {
    averageConditions.push(
      "average_facts.competition_start_date >= ?",
      "average_facts.competition_start_date < ?",
    );
    averageValues.push(`${year}-01-01`, `${year + 1}-01-01`);
  }
  let peopleTimings = { queueMs: 0, statementMs: 0 };
  let peopleReturnedRows = 0;
  let queryCount = dynamicSingle || lazyAverage ? 1 : 2;
  let rowLimit = limit + 1;
  if (search) {
    const people = await searchPersonIds(
      search,
      regexSearch,
      parseSearchLimit(params),
    );
    peopleTimings = people.timings;
    peopleReturnedRows = people.returnedRows;
    queryCount += 1;
    if (people.personIds.length === 0) {
      return {
        data: {
          entries: [],
          hasMore: false,
          nextPageStart: null,
          previousPageStart: null,
          startPosition: 0,
          lastRank: null,
          total: 0,
        },
        diagnostics: {
          timings: people.timings,
          queryCount: 1,
          returnedRows: people.returnedRows,
        },
      };
    }
    conditions.push(
      `ranking.person_id IN (${people.personIds.map(() => "?").join(", ")})`,
    );
    values.push(...people.personIds);
    lazyConditions.push(
      `solve.person_id IN (${people.personIds.map(() => "?").join(", ")})`,
    );
    lazyValues.push(...people.personIds);
    yearSingleConditions.push(
      `facts.person_id IN (${people.personIds.map(() => "?").join(", ")})`,
    );
    yearSingleValues.push(...people.personIds);
    averageConditions.push(
      `result.person_id IN (${people.personIds.map(() => "?").join(", ")})`,
    );
    averageValues.push(...people.personIds);
    rowLimit = parseSearchLimit(params);
  } else if (!dynamicSingle && !lazyAverage) {
    conditions.push(`ranking.${positionColumn} > ?`);
    values.push(start);
  }

  const rows = await query<ResultRankingRow & { total_count?: number }>(
    yearSingle
      ? filteredResultRankingsQuery({
          source:
            "result_facts facts STRAIGHT_JOIN result_attempts attempt ON attempt.result_id = facts.result_id",
          joins: "",
          candidateColumns: `facts.result_id, attempt.attempt_number, facts.person_id,
            attempt.value AS result_value, facts.person_country_id AS country_id,
            facts.person_continent_id AS continent_id, facts.competition_id,
            facts.competition_start_date,
            CASE WHEN attempt.value = facts.best THEN facts.regional_single_record ELSE '' END AS record_code`,
          conditions: yearSingleConditions,
        })
      : lazySingle
        ? lazySingleResultRankingsQuery(lazyConditions)
        : lazyAverage
          ? filteredResultRankingsQuery({
              source: "result_rankings_average result",
              joins: averageJoins.join(" "),
              candidateColumns: `result.result_id, NULL AS attempt_number, result.person_id,
              result.result_value, result.country_id, result.continent_id, result.competition_id,
              average_facts.competition_start_date, result.record_code`,
              conditions: averageConditions,
            })
          : resultRankingsQuery({
              source: table,
              rankColumn,
              positionColumn,
              conditions,
            }),
    yearSingle
      ? [...yearSingleValues, start, rowLimit]
      : lazySingle
        ? [...lazyValues, start, rowLimit]
        : lazyAverage
          ? [...averageValues, start, rowLimit]
          : [...values, rowLimit],
  );

  const counts =
    dynamicSingle || lazyAverage
      ? null
      : await query<{ count: number }>(resultRankingCountsQuery(), [
          eventId,
          resultType,
          scope,
          regionId,
        ]);
  const pageRows = search ? rows.rows : rows.rows.slice(0, limit);
  const last = pageRows.at(-1);
  const entries = pageRows.map((row) => ({
    entryKey: `result:${resultType}:${row.result_id}:${row.attempt_number ?? 0}`,
    resultId: Number(row.result_id),
    rank: Number(row.rank),
    subRank: Number(row.position),
    personId: row.person_id,
    personName: row.person_name,
    countryId: row.country_id,
    countryName: row.country_name,
    countryIso2: row.country_iso2,
    continentId: row.continent_id,
    best: Number(row.result_value),
    competitionId: row.competition_id,
    competitionName: row.competition_name,
    recordBadges: getRecordBadges({
      isWorldRecord: row.record_code === "WR",
      isContinentRecord: row.record_code === "CR",
      isCountryRecord: row.record_code === "NR",
      continentId: row.continent_id,
    }),
  }));
  const total = search
    ? entries.length
    : dynamicSingle || lazyAverage
      ? Number(rows.rows[0]?.total_count ?? 0)
      : Number(counts?.rows[0]?.count ?? 0);

  return {
    data: {
      entries,
      hasMore: !search && rows.rows.length > limit,
      nextPageStart:
        !search && rows.rows.length > limit && last
          ? Number(last.position) + 1
          : null,
      previousPageStart:
        !search && start > 0 ? Math.max(0, start - limit) : null,
      startPosition: Number(pageRows[0]?.position ?? start + 1) - 1,
      lastRank: pageRows.length ? Number(last?.rank) : null,
      total: search ? entries.length : total,
    },
    diagnostics: {
      timings: addTimings(
        peopleTimings,
        rows.timings,
        counts?.timings ?? { queueMs: 0, statementMs: 0 },
      ),
      queryCount,
      returnedRows:
        peopleReturnedRows + rows.rows.length + (counts?.rows.length ?? 0),
      cacheOutcome: "bypass" as const,
      cacheLayer: "memory" as const,
    },
  };
}
