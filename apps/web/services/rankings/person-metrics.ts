import { query } from "@/db";
import { RESULTS_PAGE_SIZE } from "@/lib/rankings-config";
import { searchPersonIds } from "@/services/people/service";
import { genderCondition } from "@/services/rankings/helpers";
import {
  filteredPersonMetricQuery,
  personMetricEndQuery,
  personMetricQuery,
} from "@/services/rankings/queries/person-metrics";
import { toPersonMetricEntry } from "@/services/rankings/row-mappers";
import type {
  FilteredPersonMetricRow,
  PersonMetricRow,
  QueryInput,
} from "@/services/rankings/types";

type GenderCondition = ReturnType<typeof genderCondition>;

export async function queryPersonMetric(input: QueryInput) {
  const kinch = input.eventId === "sor-kinch";
  const continentKinch =
    kinch && input.scope === "country" && input.kinchOrder === "continent";
  const kinchPrefix = continentKinch ? "kinch_continent" : "kinch";
  const rankColumn = kinch ? `${kinchPrefix}_rank` : "rank";
  const positionColumn = kinch ? `${kinchPrefix}_position` : "position";
  const scoreColumn = continentKinch ? "kinch_continent_score" : "kinch_score";
  const scoreExpression = kinch ? `score.${scoreColumn} / 17.0` : "score.score";
  const metricResultType = kinch ? "single" : input.type;
  const values: unknown[] = [metricResultType, input.scope, input.regionId];
  const conditions = [
    "score.metric_version = 1",
    "score.event_set_version = 1",
    "score.result_type = ?",
    "score.scope = ?",
    "score.region_id = ?",
    `score.${positionColumn} IS NOT NULL`,
  ];
  const gender = genderCondition("score", input.gender);
  if (input.gender.length) {
    return queryFilteredPersonMetric(input, kinch, gender);
  }
  let peopleTimings = { queueMs: 0, statementMs: 0 };
  let peopleReturnedRows = 0;

  if (input.locate) {
    conditions.push("score.person_id = ?");
    values.push(input.locate);
  } else if (input.search) {
    const people = await searchPersonIds(
      input.search,
      input.regexSearch,
      input.searchLimit,
    );
    peopleTimings = people.timings;
    peopleReturnedRows = people.returnedRows;
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
        returnedRows: people.returnedRows,
      };
    }
    conditions.push(
      `score.person_id IN (${people.personIds.map(() => "?").join(", ")})`,
    );
    values.push(...people.personIds);
  } else if (input.cursorRank) {
    conditions.push(
      `(score.${positionColumn} > ? OR (score.${positionColumn} = ? AND score.person_id > ?))`,
    );
    values.push(input.cursorRank, input.cursorRank, input.cursorId);
  } else {
    conditions.push(`score.${positionColumn} >= ?`);
    values.push(input.startRank);
  }

  let limit = input.limit + 1;
  if (input.locate) limit = 1;
  else if (input.search) limit = input.searchLimit;
  const result = await query<PersonMetricRow>(
    personMetricQuery({
      rankColumn,
      positionColumn,
      scoreExpression,
      conditions,
    }),
    [
      input.scope,
      input.regionId,
      input.scope,
      input.regionId,
      ...values,
      limit,
    ],
  );
  const timings = {
    queueMs: peopleTimings.queueMs + result.timings.queueMs,
    statementMs: peopleTimings.statementMs + result.timings.statementMs,
  };
  const entries = result.rows
    .slice(0, input.locate ? 1 : limit - (input.search ? 0 : 1))
    .map(toPersonMetricEntry);
  if (input.locate) {
    return {
      data: { located: entries[0] ?? null },
      timings,
      queryCount: 1 + (input.search ? 1 : 0),
      returnedRows: peopleReturnedRows + result.rows.length,
    };
  }
  if (input.search) {
    return {
      data: {
        entries,
        hasMore: false,
        nextPageStart: null,
        previousPageStart: null,
        total: entries.length,
      },
      timings,
      queryCount: 2,
      returnedRows: peopleReturnedRows + result.rows.length,
    };
  }

  const end = await query<{ position: number }>(
    personMetricEndQuery(positionColumn),
    [metricResultType, input.scope, input.regionId],
  );
  return {
    data: {
      entries,
      hasMore: result.rows.length > input.limit,
      nextPageStart:
        result.rows.length > input.limit
          ? input.startRank + RESULTS_PAGE_SIZE
          : null,
      previousPageStart:
        input.startRank > 1
          ? Math.max(1, input.startRank - RESULTS_PAGE_SIZE)
          : null,
      startPosition: Math.max(0, input.startRank - 1),
      lastRank: entries.at(-1)?.subRank ?? null,
      total: Number(end.rows[0]?.position ?? 0),
      exportDate: null,
    },
    timings: {
      queueMs: timings.queueMs + end.timings.queueMs,
      statementMs: timings.statementMs + end.timings.statementMs,
    },
    queryCount: 2,
    returnedRows: result.rows.length + end.rows.length,
  };
}

async function queryFilteredPersonMetric(
  input: QueryInput,
  kinch: boolean,
  gender: GenderCondition,
) {
  const continentKinch =
    kinch && input.scope === "country" && input.kinchOrder === "continent";
  const metricResultType = kinch ? "single" : input.type;
  const kinchScoreColumn = continentKinch
    ? "kinch_continent_score"
    : "kinch_score";
  const positionColumn = kinch
    ? `${continentKinch ? "kinch_continent" : "kinch"}_position`
    : "position";
  const scoreOrder = kinch
    ? `score.${kinchScoreColumn} / 17.0 DESC`
    : "score.score ASC";
  const scoreValue = kinch ? `score.${kinchScoreColumn} / 17.0` : "score.score";
  const values: unknown[] = [
    metricResultType,
    input.scope,
    input.regionId,
    ...gender.values,
  ];
  const conditions = [
    "score.metric_version = 1",
    "score.event_set_version = 1",
    "score.result_type = ?",
    "score.scope = ?",
    "score.region_id = ?",
    `score.${positionColumn} IS NOT NULL`,
    gender.sql,
  ];
  const pageConditions: string[] = [];
  const pageValues: unknown[] = [];
  let peopleTimings = { queueMs: 0, statementMs: 0 };
  let peopleReturnedRows = 0;
  let search = false;
  if (input.locate) {
    pageConditions.push("filtered.person_id = ?");
    pageValues.push(input.locate);
  } else if (input.search) {
    search = true;
    const people = await searchPersonIds(
      input.search,
      input.regexSearch,
      input.searchLimit,
    );
    peopleTimings = people.timings;
    peopleReturnedRows = people.returnedRows;
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
        timings: people.timings,
        queryCount: 1,
        returnedRows: people.returnedRows,
      };
    }
    pageConditions.push(
      `filtered.person_id IN (${people.personIds.map(() => "?").join(", ")})`,
    );
    pageValues.push(...people.personIds);
  } else if (input.cursorRank) {
    pageConditions.push(
      "(filtered.filtered_position > ? OR (filtered.filtered_position = ? AND filtered.person_id > ?))",
    );
    pageValues.push(input.cursorRank, input.cursorRank, input.cursorId);
  } else {
    pageConditions.push("filtered.filtered_position >= ?");
    pageValues.push(input.startRank);
  }
  let limit = input.limit + 1;
  if (input.locate) limit = 1;
  else if (search) limit = input.searchLimit;
  const result = await query<FilteredPersonMetricRow>(
    filteredPersonMetricQuery({
      scoreValue,
      scoreOrder,
      conditions,
      pageConditions,
    }),
    [
      ...values,
      ...pageValues,
      limit,
      input.scope,
      input.regionId,
      input.scope,
      input.regionId,
    ],
  );
  const timings = {
    queueMs: peopleTimings.queueMs + result.timings.queueMs,
    statementMs: peopleTimings.statementMs + result.timings.statementMs,
  };
  const rows = result.rows;
  let entryLimit = input.limit;
  if (input.locate) entryLimit = 1;
  else if (search) entryLimit = rows.length;
  const entries = rows.slice(0, entryLimit).map(toPersonMetricEntry);
  if (input.locate) {
    return {
      data: { located: entries[0] ?? null },
      timings,
      queryCount: 1,
      returnedRows: peopleReturnedRows + rows.length,
    };
  }
  if (search) {
    return {
      data: {
        entries,
        hasMore: false,
        nextPageStart: null,
        previousPageStart: null,
        total: entries.length,
      },
      timings,
      queryCount: 2,
      returnedRows: peopleReturnedRows + rows.length,
    };
  }
  return {
    data: {
      entries,
      hasMore: rows.length > input.limit,
      nextPageStart:
        rows.length > input.limit ? input.startRank + RESULTS_PAGE_SIZE : null,
      previousPageStart:
        input.startRank > 1
          ? Math.max(1, input.startRank - RESULTS_PAGE_SIZE)
          : null,
      startPosition: Math.max(0, input.startRank - 1),
      lastRank: entries.at(-1)?.subRank ?? null,
      total: Number(rows[0]?.total_count ?? 0),
      exportDate: null,
    },
    timings,
    queryCount: 1,
    returnedRows: rows.length,
  };
}
