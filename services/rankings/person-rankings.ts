import { query } from "@/db";
import { RESULTS_PAGE_SIZE } from "@/lib/rankings-config";
import { searchPersonIds } from "@/services/people/service";
import {
  getRankingCount,
  getYearRankingCount,
} from "@/services/rankings/metadata";
import {
  genderCondition,
  rankingColumns,
  rankingShape,
  rankingTable,
  yearlyRankingTable,
} from "@/services/rankings/helpers";
import {
  filteredYearlyRankingPageQuery,
  rankingCursorQuery,
  rankingLocateQuery,
  rankingPageQuery,
  rankingSearchQuery,
  yearlyRankingPageQuery,
} from "@/services/rankings/queries/person-rankings";
import { toRankingEntry } from "@/services/rankings/row-mappers";
import type {
  QueryInput,
  RankingRow,
  RankingsMetadata,
} from "@/services/rankings/types";
import type { RankingType } from "@/lib/wca";

interface FilteredRankingRow extends RankingRow {
  total_count?: number;
  [key: string]: unknown;
}

function rankingFilters(input: QueryInput) {
  const { rank, subRank, region } = rankingShape(input.scope);
  const values: unknown[] = [input.eventId];
  const conditions = ["event_id = ?"];
  if (region) {
    conditions.push(`${region} = ?`);
    values.push(input.regionId);
  }
  conditions.push(`${rank} > 0`);
  return { rank, subRank, conditions, values };
}

function rankingTotal(
  input: QueryInput,
  metadata: RankingsMetadata,
  filteredTotal?: number,
): number {
  if (filteredTotal !== undefined) return filteredTotal;
  if (input.year === null) {
    return getRankingCount(
      metadata,
      input.eventId,
      input.type,
      input.scope,
      input.regionId,
    );
  }
  return getYearRankingCount(
    metadata,
    input.year,
    input.eventId,
    input.type,
    input.scope,
    input.regionId,
  );
}

function rankingPageResponse(
  rows: RankingRow[],
  input: QueryInput,
  metadata: RankingsMetadata,
  filteredTotal?: number,
  pageSize = RESULTS_PAGE_SIZE,
) {
  const total = rankingTotal(input, metadata, filteredTotal);
  const entries = rows.map(toRankingEntry);
  const startPosition = Math.min(Math.max(0, input.startRank - 1), total);
  const hasMore = input.startRank + entries.length <= total;
  return {
    entries,
    hasMore,
    nextPageStart: hasMore ? input.startRank + pageSize : null,
    previousPageStart:
      input.startRank > 1 && total > 0
        ? Math.max(1, input.startRank - pageSize)
        : null,
    startPosition,
    lastRank: entries.at(-1)?.subRank ?? null,
    total,
    exportDate: metadata.exportDate,
    availableYears: metadata.availableYears,
  };
}

function yearlyColumns(type: RankingType): string {
  const currentResultTable =
    type === "average" ? "result_rankings_average" : "result_rankings_single";
  return `ranking.public_rank AS rank, ranking.position AS sub_rank, ranking.person_id,
    COALESCE(person.name, ranking.person_id) AS person_name,
    COALESCE(country.id, '') AS country_id, COALESCE(country.name, country.id, '') AS country_name,
    COALESCE(country.iso2, '') AS country_iso2, COALESCE(country.continent_id, '') AS continent_id,
    ranking.result_value AS best, COALESCE(facts.competition_id, '') AS competition_id,
    COALESCE(competition.name, '') AS competition_name,
    EXISTS (
      SELECT 1 FROM ${currentResultTable} current_record
      WHERE current_record.result_id = ranking.result_id
        AND current_record.world_rank = 1
    ) AS is_world_record,
    EXISTS (
      SELECT 1 FROM ${currentResultTable} current_record
      WHERE current_record.result_id = ranking.result_id
        AND current_record.continent_rank = 1
    ) AS is_continent_record,
    EXISTS (
      SELECT 1 FROM ${currentResultTable} current_record
      WHERE current_record.result_id = ranking.result_id
        AND current_record.country_rank = 1
    ) AS is_country_record`;
}

function yearlyFilters(input: QueryInput) {
  const values: unknown[] = [
    input.year,
    input.eventId,
    input.scope,
    input.regionId,
  ];
  const gender = genderCondition("person", input.gender);
  values.push(...gender.values);
  return {
    conditions: [
      "ranking.year = ?",
      "ranking.event_id = ?",
      "ranking.cohort_id = (SELECT cohort_id FROM person_year_ranking_cohorts WHERE scope = ? AND region_id = ?)",
      ...(gender.sql ? [gender.sql] : []),
    ],
    values,
  };
}

export async function queryRankingPage(
  input: QueryInput,
  metadata: RankingsMetadata,
  pageSize = RESULTS_PAGE_SIZE,
) {
  if (input.year !== null) {
    const { conditions, values } = yearlyFilters(input);
    if (input.gender.length) {
      const result = await query<FilteredRankingRow>(
        filteredYearlyRankingPageQuery(
          yearlyRankingTable(input.type),
          conditions,
        ),
        [...values, input.startRank, input.startRank + pageSize],
      );
      return {
        data: rankingPageResponse(
          result.rows,
          input,
          metadata,
          Number(result.rows[0]?.total_count ?? 0),
          pageSize,
        ),
        timings: result.timings,
        queryCount: 1,
        returnedRows: result.rows.length,
      };
    }
    const result = await query<RankingRow>(
      yearlyRankingPageQuery(
        yearlyRankingTable(input.type),
        yearlyColumns(input.type),
        conditions,
      ),
      [...values, input.startRank, input.startRank + pageSize],
    );
    return {
      data: rankingPageResponse(
        result.rows,
        input,
        metadata,
        undefined,
        pageSize,
      ),
      timings: result.timings,
      queryCount: 1,
      returnedRows: result.rows.length,
    };
  }
  const { rank, subRank, conditions, values } = rankingFilters(input);
  const pageValues = [...values, input.startRank, input.startRank + pageSize];
  const result = await query<RankingRow>(
    rankingPageQuery(
      rankingTable(input.type),
      rankingColumns(
        rank,
        subRank,
        input.type === "average"
          ? "result_rankings_average"
          : "result_rankings_single",
      ),
      conditions,
      subRank,
    ),
    pageValues,
  );
  return {
    data: rankingPageResponse(
      result.rows,
      input,
      metadata,
      undefined,
      pageSize,
    ),
    timings: result.timings,
    queryCount: 1,
    returnedRows: result.rows.length,
  };
}

export async function queryPersonRanking(input: QueryInput) {
  const yearly = input.year !== null;
  const queryParts = yearly
    ? { rank: "public_rank", subRank: "position", ...yearlyFilters(input) }
    : rankingFilters(input);
  const { rank, subRank, conditions, values } = queryParts;
  const source = yearly
    ? yearlyRankingTable(input.type)
    : rankingTable(input.type);
  const selectColumns = yearly
    ? yearlyColumns(input.type)
    : rankingColumns(
        rank,
        subRank,
        input.type === "average"
          ? "result_rankings_average"
          : "result_rankings_single",
      );
  let from = `FROM ${source} ranking`;
  if (yearly) {
    from = `FROM ${source} ranking LEFT JOIN persons person ON person.wca_id = ranking.person_id AND person.sub_id = 1 LEFT JOIN result_facts facts ON facts.result_id = ranking.result_id LEFT JOIN countries country ON country.id = facts.person_country_id LEFT JOIN competitions competition ON competition.id = facts.competition_id`;
  }
  const predicate = conditions.join(" AND ");
  const qualifiedSubRank = yearly ? `ranking.${subRank}` : subRank;
  const personColumn = "ranking.person_id";
  if (input.locate) {
    const result = await query<RankingRow>(
      rankingLocateQuery({
        selectColumns,
        from,
        predicate,
        qualifiedSubRank,
        personColumn,
      }),
      [...values, input.locate],
    );
    return {
      data: {
        located: result.rows[0] ? toRankingEntry(result.rows[0]) : null,
      },
      timings: result.timings,
      queryCount: 1,
      returnedRows: result.rows.length,
    };
  }
  if (input.search) {
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
        timings: people.timings,
        queryCount: 1,
        returnedRows: 0,
      };
    }
    const result = await query<RankingRow>(
      rankingSearchQuery({
        selectColumns,
        from,
        predicate,
        qualifiedSubRank,
        personColumn,
        personIds: people.personIds,
      }),
      [...values, ...people.personIds, input.searchLimit],
    );
    const entries = result.rows.map(toRankingEntry);
    return {
      data: {
        entries,
        hasMore: false,
        nextPageStart: null,
        previousPageStart: null,
        total: entries.length,
      },
      timings: {
        queueMs: people.timings.queueMs + result.timings.queueMs,
        statementMs: people.timings.statementMs + result.timings.statementMs,
      },
      queryCount: 2,
      returnedRows: people.returnedRows + result.rows.length,
    };
  }
  const cursor = input.cursorRank
    ? ` AND (${qualifiedSubRank} > ? OR (${qualifiedSubRank} = ? AND ${personColumn} > ?))`
    : ` AND ${qualifiedSubRank} >= ?`;
  const pageValues = input.cursorRank
    ? [
        ...values,
        input.cursorRank,
        input.cursorRank,
        input.cursorId,
        input.limit + 1,
      ]
    : [...values, input.startRank, input.limit + 1];
  const result = await query<RankingRow>(
    rankingCursorQuery({
      selectColumns,
      from,
      predicate,
      qualifiedSubRank,
      personColumn,
      cursor,
    }),
    pageValues,
  );
  const entries = result.rows.slice(0, input.limit).map(toRankingEntry);
  return {
    data: {
      entries,
      hasMore: result.rows.length > input.limit,
      nextPageStart: null,
      previousPageStart: null,
      total: entries.length,
    },
    timings: result.timings,
    queryCount: 1,
    returnedRows: result.rows.length,
  };
}
