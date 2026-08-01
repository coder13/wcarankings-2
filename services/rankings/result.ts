import { query } from "@/db";
import {
  addTimings,
  ApiInputError,
  parseEvent,
  parseLimit,
  parseResultType,
  parseGender,
  parseScope,
} from "@/lib/api/projection";
import { searchPersonIds } from "@/services/people/service";
import { getRecordBadges } from "@/lib/wca";
import type { ResultRankingRow } from "@/services/rankings/types";
import { resultRankingCountsQuery, resultRankingsQuery } from "@/services/rankings/queries";

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
  const table = gender.length ? `worktree_gender_result_rankings_${resultType}` : baseTable;
  const rankColumn = gender.length ? "filtered_rank" : `${scope}_rank`;
  const positionColumn = gender.length ? "filtered_position" : `${scope}_position`;
  const conditions = ["ranking.event_id = ?"];
  const values: unknown[] = [eventId];
  if (gender.length) {
    const genderParts = gender.map((value) =>
      value === "o"
        ? "(ranking.person_gender = 'o' OR ranking.person_gender IS NULL)"
        : "ranking.person_gender = ?",
    );
    conditions.push(`(${genderParts.join(" OR ")})`);
    values.push(...gender.filter((value) => value !== "o"));
  }
  if (scope !== "world") {
    conditions.push(`ranking.${scope}_id = ?`);
    values.push(regionId);
  }
  const sourceConditions = [...conditions];
  const sourceValues = [...values];
  const pageConditions: string[] = [];
  const pageValues: unknown[] = [];

  let peopleTimings = { queueMs: 0, statementMs: 0 };
  let peopleReturnedRows = 0;
  let queryCount = 2;
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
    pageConditions.push(`ranking.person_id IN (${people.personIds.map(() => "?").join(", ")})`);
    pageValues.push(...people.personIds);
    rowLimit = parseSearchLimit(params);
  } else {
    pageConditions.push(`ranking.${positionColumn} > ?`);
    pageValues.push(start);
  }

  const rows = await query<ResultRankingRow>(
    resultRankingsQuery({
      source: table,
      rankColumn,
      positionColumn,
      conditions: gender.length ? pageConditions : conditions,
      sourceConditions,
      gender,
      scope,
    }),
    [...(gender.length ? [...sourceValues, ...pageValues] : [...values]), rowLimit],
  );

  const counts = gender.length
    ? { rows: [] as Array<{ count: number }>, timings: { queueMs: 0, statementMs: 0 } }
    : await query<{ count: number }>(resultRankingCountsQuery(), [
        eventId,
        resultType,
        scope,
        regionId,
      ]);
  const pageRows = search ? rows.rows : rows.rows.slice(0, limit);
  const total = gender.length
    ? Number(rows.rows[0]?.total_count ?? 0)
    : Number(counts.rows[0]?.count ?? 0);
  const last = pageRows.at(-1);
  const entries = pageRows.map((row) => ({
    entryKey: `result:${resultType}:${row.result_id}`,
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
      timings: addTimings(peopleTimings, rows.timings, counts.timings),
      queryCount,
      returnedRows: peopleReturnedRows + rows.rows.length + counts.rows.length,
    },
  };
}
