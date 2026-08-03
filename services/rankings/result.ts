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

export async function loadResultRankings(params: URLSearchParams) {
  const eventId = parseEvent(params);
  const resultType = parseResultType(params, eventId);
  const { scope, regionId } = parseScope(params);
  const start = parsePageStart(params);
  const limit = parseLimit(params);
  const search = (params.get("search") ?? "").trim().slice(0, 80);
  const regexSearch = params.get("mode") === "vim";
  const baseTable = resultType === "average" ? "result_rankings_average" : "result_rankings_single";
  const gender = parseGender(params);
  const year = parseYear(params);
  const genderSet = gender.join(",");
  const lazySingle = resultType === "single" && (year !== null || gender.length > 0);
  const lazyAverage = resultType === "average" && (year !== null || gender.length > 0);
  const table = gender.length ? `result_gender_rankings_${resultType}` : baseTable;
  const rankColumn = `${scope}_rank`;
  const positionColumn = `${scope}_position`;
  const conditions = ["ranking.event_id = ?"];
  const values: unknown[] = [eventId];
  const lazyConditions = ["solve.event_id = ?"];
  const lazyValues: unknown[] = [eventId];
  const averageConditions = ["result.event_id = ?"];
  const averageValues: unknown[] = [eventId];
  const averageJoins: string[] = [];
  if (gender.length) {
    conditions.push(resultType === "single" ? "ranking.gender = ?" : "ranking.gender_set = ?");
    values.push(genderSet);
    lazyConditions.push(`solve.gender IN (${gender.map(() => "?").join(", ")})`);
    lazyValues.push(...gender);
    if (resultType === "average") {
      averageJoins.push("JOIN persons filter_person ON filter_person.wca_id = result.person_id AND filter_person.sub_id = 1");
      averageConditions.push(`(CASE WHEN filter_person.gender IN ('m', 'f') THEN filter_person.gender ELSE 'o' END) IN (${gender.map(() => "?").join(", ")})`);
      averageValues.push(...gender);
    }
  }
  if (scope !== "world") {
    conditions.push(`ranking.${scope}_id = ?`);
    values.push(regionId);
    lazyConditions.push(`solve.${scope}_id = ?`);
    lazyValues.push(regionId);
    averageConditions.push(`result.person_${scope}_id = ?`);
    averageValues.push(regionId);
  }
  if (year !== null) {
    lazyConditions.push("solve.competition_start_date >= ?", "solve.competition_start_date < ?");
    lazyValues.push(`${year}-01-01`, `${year + 1}-01-01`);
    averageConditions.push("result.competition_start_date >= ?", "result.competition_start_date < ?");
    averageValues.push(`${year}-01-01`, `${year + 1}-01-01`);
  }
  let peopleTimings = { queueMs: 0, statementMs: 0 };
  let peopleReturnedRows = 0;
  let queryCount = lazySingle || lazyAverage ? 1 : 2;
  let rowLimit = limit + 1;
  if (search) {
    const people = await searchPersonIds(search, regexSearch, parseSearchLimit(params));
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
    conditions.push(`ranking.person_id IN (${people.personIds.map(() => "?").join(", ")})`);
    values.push(...people.personIds);
    lazyConditions.push(`solve.person_id IN (${people.personIds.map(() => "?").join(", ")})`);
    lazyValues.push(...people.personIds);
    averageConditions.push(`result.person_id IN (${people.personIds.map(() => "?").join(", ")})`);
    averageValues.push(...people.personIds);
    rowLimit = parseSearchLimit(params);
  } else if (!lazySingle && !lazyAverage) {
    conditions.push(`ranking.${positionColumn} > ?`);
    values.push(start);
  }

  const rows = await query<ResultRankingRow & { total_count?: number }>(
    lazySingle
      ? lazySingleResultRankingsQuery(lazyConditions)
      : lazyAverage
        ? filteredResultRankingsQuery({
            source: "result_facts result",
            joins: averageJoins.join(" "),
            candidateColumns: `result.result_id, NULL AS attempt_number, result.person_id,
              result.average AS result_value, result.person_country_id AS country_id,
              result.person_continent_id AS continent_id, result.competition_id,
              result.competition_start_date, result.regional_average_record AS record_code`,
            conditions: averageConditions,
          })
        : resultRankingsQuery({
            source: table,
            rankColumn,
            positionColumn,
            conditions,
          }),
    lazySingle
      ? [...lazyValues, start, rowLimit]
      : lazyAverage
        ? [...averageValues, start, rowLimit]
        : [...values, rowLimit],
  );

  const counts = lazySingle || lazyAverage ? null : gender.length
    ? await query<{ count: number }>(resultRankingCountsQuery(true), [
        eventId,
        resultType,
        genderSet,
        scope,
        regionId,
      ])
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
    : lazySingle || lazyAverage
      ? Number(rows.rows[0]?.total_count ?? 0)
      : Number(counts?.rows[0]?.count ?? 0);

  return {
    data: {
      entries,
      hasMore: !search && rows.rows.length > limit,
      nextPageStart: !search && rows.rows.length > limit && last ? Number(last.position) + 1 : null,
      previousPageStart: !search && start > 0 ? Math.max(0, start - limit) : null,
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
      returnedRows: peopleReturnedRows + rows.rows.length + (counts?.rows.length ?? 0),
    },
  };
}
