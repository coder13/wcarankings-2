import { query } from "@/db";
import { addTimings } from "@/lib/api/projection";
import { getRecordBadges } from "@/lib/wca";
import { searchPersonIds } from "@/services/people/service";
import {
  filteredResultRankingsQuery,
  lazySingleResultRankingsQuery,
  resultRankingCountsQuery,
  resultRankingsQuery,
} from "@/services/rankings/queries/results";
import type {
  ResultRankingLoadResult,
  ResultRankingRequest,
} from "@/services/rankings/result-types";
import type { ResultRankingRow } from "@/services/rankings/types";

type ResultRankingQueryRow = ResultRankingRow & {
  total_count?: number;
};

export async function loadResultRankingData(
  input: ResultRankingRequest,
): Promise<ResultRankingLoadResult> {
  const {
    eventId,
    resultType,
    scope,
    regionId,
    start,
    limit,
    search,
    regexSearch,
    baseTable,
    gender,
    year,
  } = input;
  const yearSingle = resultType === "single" && year !== null;
  const lazySingle =
    resultType === "single" && year === null && gender.length > 0;
  const dynamicSingle = yearSingle || lazySingle;
  const lazyAverage =
    resultType === "average" && (year !== null || gender.length > 0);
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
      input.searchLimit ?? 500,
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
    rowLimit = input.searchLimit ?? 500;
  } else if (!dynamicSingle && !lazyAverage) {
    conditions.push(`ranking.${positionColumn} > ?`);
    values.push(start);
  }

  let rankingsSql = resultRankingsQuery({
    source: baseTable,
    rankColumn,
    positionColumn,
    conditions,
  });
  let rankingValues = [...values, rowLimit];
  if (yearSingle) {
    rankingsSql = filteredResultRankingsQuery({
      source:
        "result_facts facts STRAIGHT_JOIN result_attempts attempt ON attempt.result_id = facts.result_id",
      joins: "",
      candidateColumns: `facts.result_id, attempt.attempt_number, facts.person_id,
            attempt.value AS result_value, facts.person_country_id AS country_id,
            facts.person_continent_id AS continent_id, facts.competition_id,
            facts.competition_start_date,
            CASE
              WHEN EXISTS (
                SELECT 1 FROM result_rankings_single current_record
                WHERE current_record.result_id = facts.result_id
                  AND current_record.attempt_number = attempt.attempt_number
                  AND current_record.country_rank = 1
              ) THEN 'NR'
              WHEN EXISTS (
                SELECT 1 FROM result_rankings_single current_record
                WHERE current_record.result_id = facts.result_id
                  AND current_record.attempt_number = attempt.attempt_number
                  AND current_record.continent_rank = 1
              ) THEN 'CR'
              WHEN EXISTS (
                SELECT 1 FROM result_rankings_single current_record
                WHERE current_record.result_id = facts.result_id
                  AND current_record.attempt_number = attempt.attempt_number
                  AND current_record.world_rank = 1
              ) THEN 'WR'
              ELSE ''
            END AS record_code`,
      conditions: yearSingleConditions,
    });
    rankingValues = [...yearSingleValues, start, rowLimit];
  } else if (lazySingle) {
    rankingsSql = lazySingleResultRankingsQuery(lazyConditions);
    rankingValues = [...lazyValues, start, rowLimit];
  } else if (lazyAverage) {
    rankingsSql = filteredResultRankingsQuery({
      source: "result_rankings_average result",
      joins: averageJoins.join(" "),
      candidateColumns: `result.result_id, NULL AS attempt_number, result.person_id,
              result.result_value, result.country_id, result.continent_id, result.competition_id,
              average_facts.competition_start_date,
              CASE
                WHEN result.country_rank = 1 THEN 'NR'
                WHEN result.continent_rank = 1 THEN 'CR'
                WHEN result.world_rank = 1 THEN 'WR'
                ELSE ''
              END AS record_code`,
      conditions: averageConditions,
    });
    rankingValues = [...averageValues, start, rowLimit];
  }

  const rows = await query<ResultRankingQueryRow>(rankingsSql, rankingValues);
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
  let total = Number(counts?.rows[0]?.count ?? 0);
  if (dynamicSingle || lazyAverage) {
    total = Number(rows.rows[0]?.total_count ?? 0);
  }
  if (search) total = entries.length;

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
