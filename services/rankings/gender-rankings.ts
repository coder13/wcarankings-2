import { query } from "@/db";
import { addTimings } from "@/lib/api/projection";
import { searchPersonIds } from "@/services/people/service";
import {
  genderCondition,
  rankingColumns,
  rankingShape,
  rankingTable,
} from "@/services/rankings/helpers";
import {
  genderPersonRankingCountQuery,
  genderPersonRankingPrefixCountQuery,
  genderPersonRankingRowsQuery,
  genderRankingPageQuery,
} from "@/services/rankings/queries/gender-rankings";
import { toRankingEntry } from "@/services/rankings/row-mappers";
import type {
  GenderPersonRankingRow,
  QueryInput,
  RankingRow,
} from "@/services/rankings/types";

interface CountRow {
  count: number;
  [key: string]: unknown;
}

interface GenderPersonColumns {
  positionColumn: "world_position" | "continent_position" | "country_position";
  regionColumn: "continent_id" | "country_id" | null;
}

function genderPersonColumns(scope: QueryInput["scope"]): GenderPersonColumns {
  if (scope === "continent") {
    return {
      positionColumn: "continent_position",
      regionColumn: "continent_id",
    };
  }
  if (scope === "country") {
    return {
      positionColumn: "country_position",
      regionColumn: "country_id",
    };
  }
  return { positionColumn: "world_position", regionColumn: null };
}

export async function queryGenderRankingPage(input: QueryInput) {
  if (input.year === null && !input.search && !input.locate) {
    return queryMaterializedGenderPage(input);
  }
  const source = rankingTable(input.type);
  const { region } = rankingShape(input.scope);
  const baseConditions = ["ranking.event_id = ?", "ranking.world_rank > 0"];
  const baseValues: unknown[] = [input.eventId];
  if (region) {
    baseConditions.push(`ranking.${region} = ?`);
    baseValues.push(input.regionId);
  }
  const gender = genderCondition("ranking", input.gender);
  if (gender.sql) {
    baseConditions.push(gender.sql);
    baseValues.push(...gender.values);
  }
  const conditions: string[] = [];
  const values: unknown[] = [...baseValues];
  if (input.locate) {
    conditions.push("person_id = ?");
    values.push(input.locate);
  } else if (input.search) {
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
    conditions.push(
      `person_id IN (${people.personIds.map(() => "?").join(", ")})`,
    );
    values.push(...people.personIds);
  } else {
    conditions.push("filtered_position >= ? AND filtered_position < ?");
    values.push(input.startRank, input.startRank + input.limit + 1);
  }
  let resultLimit = input.limit + 1;
  if (input.locate) resultLimit = 1;
  else if (input.search) resultLimit = input.searchLimit;

  const result = await query<RankingRow>(
    genderRankingPageQuery({
      source,
      baseConditions,
      conditions,
      selectColumns: rankingColumns(
        "filtered_rank",
        "filtered_position",
        input.type === "average"
          ? "result_rankings_average"
          : "result_rankings_single",
      ),
    }),
    [...values, resultLimit],
  );
  const entries = result.rows
    .slice(0, input.locate ? 1 : input.limit)
    .map(toRankingEntry);
  if (input.locate) {
    return {
      data: { located: entries[0] ?? null },
      timings: result.timings,
      queryCount: 1,
      returnedRows: result.rows.length,
    };
  }
  const total = Number(result.rows[0]?.total_count ?? 0);
  return {
    data: {
      entries,
      hasMore: result.rows.length > input.limit,
      nextPageStart:
        result.rows.length > input.limit ? input.startRank + input.limit : null,
      previousPageStart:
        input.startRank > 1 ? Math.max(1, input.startRank - input.limit) : null,
      total,
      exportDate: null,
      startPosition: input.startRank - 1,
      lastRank: entries.at(-1)?.subRank ?? null,
    },
    timings: result.timings,
    queryCount: 1,
    returnedRows: result.rows.length,
  };
}

async function queryMaterializedGenderPage(input: QueryInput) {
  const { positionColumn, regionColumn } = genderPersonColumns(input.scope);
  const recordColumn =
    input.type === "average"
      ? "facts.regional_average_record"
      : "facts.regional_single_record";
  const filterValues: unknown[] = [input.eventId, input.type, ...input.gender];
  if (regionColumn) filterValues.push(input.regionId);
  const totalPromise = query<CountRow>(
    genderPersonRankingCountQuery(input.gender.length, regionColumn),
    filterValues,
  );
  const pageValues = [...filterValues, input.limit + 1, input.startRank - 1];
  const result = await query<GenderPersonRankingRow>(
    genderPersonRankingRowsQuery({
      genderCount: input.gender.length,
      recordColumn,
      positionColumn,
      regionColumn,
    }),
    pageValues,
  );
  const firstValue = result.rows[0]?.result_value;
  const prefix =
    firstValue === undefined
      ? { rows: [{ count: 0 }], timings: { queueMs: 0, statementMs: 0 } }
      : await query<CountRow>(
          genderPersonRankingPrefixCountQuery(
            input.gender.length,
            regionColumn,
          ),
          [
            input.eventId,
            input.type,
            ...input.gender,
            firstValue,
            ...(regionColumn ? [input.regionId] : []),
          ],
        );
  const totalResult = await totalPromise;
  const total = Number(totalResult.rows[0]?.count ?? 0);
  const prefixCount = Number(prefix.rows[0]?.count ?? 0);
  let previousWorldRank: number | null = null;
  let filteredRank = prefixCount + 1;
  const rankedRows = result.rows.map((row, index) => {
    const worldRank = Number(row.world_rank);
    if (previousWorldRank !== null && worldRank !== previousWorldRank) {
      filteredRank = prefixCount + index + 1;
    }
    previousWorldRank = worldRank;
    return {
      ...row,
      rank: filteredRank,
      sub_rank: input.startRank + index,
      best: Number(row.result_value),
    };
  });
  const entries = rankedRows.slice(0, input.limit).map(toRankingEntry);
  return {
    data: {
      entries,
      hasMore: rankedRows.length > input.limit,
      nextPageStart:
        rankedRows.length > input.limit ? input.startRank + input.limit : null,
      previousPageStart:
        input.startRank > 1 ? Math.max(1, input.startRank - input.limit) : null,
      total,
      exportDate: null,
      startPosition: input.startRank - 1,
      lastRank: entries.at(-1)?.subRank ?? null,
    },
    timings: addTimings(
      addTimings(result.timings, prefix.timings),
      totalResult.timings,
    ),
    queryCount: firstValue === undefined ? 2 : 3,
    returnedRows: result.rows.length + (firstValue === undefined ? 0 : 1) + 1,
  };
}
