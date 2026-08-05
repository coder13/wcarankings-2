import { query } from "@/db";
import { RESULTS_PAGE_SIZE } from "@/lib/rankings-config";
import {
  getCurrentRankingsMetadata,
  getRankingCount,
  getYearRankingCount,
} from "@/services/rankings/metadata";
import {
  rankingsWindowCache,
  RANKINGS_WINDOW_SIZE,
} from "@/services/rankings/cache";
import { searchPersonIds } from "@/services/people/service";
import {
  addTimings,
  ApiInputError,
  parseGender,
  parseYear,
} from "@/lib/api/projection";
import {
  getRecordBadges,
  isRankingEventId,
  isRankingType,
  isValidRegexPattern,
  parseRegionQuery,
  type RankingEntry,
  type RankingType,
} from "@/lib/wca";
import {
  genderCondition,
  rankingColumns,
  rankingShape,
  rankingTable,
  yearlyRankingTable,
} from "@/services/rankings/helpers";
import { getRankingEntryEnhancements } from "@/services/rankings/capabilities";
import {
  filteredPersonMetricQuery,
  filteredYearlyRankingPageQuery,
  genderPersonRankingCountQuery,
  genderPersonRankingPrefixCountQuery,
  genderPersonRankingRowsQuery,
  genderRankingPageQuery,
  personMetricEndQuery,
  personMetricQuery,
  rankingCursorQuery,
  rankingLocateQuery,
  rankingPageQuery,
  rankingSearchQuery,
  yearlyRankingPageQuery,
} from "@/services/rankings/queries";
import type {
  FilteredPersonMetricRow,
  GenderPersonRankingRow,
  PersonMetricRow,
  QueryInput,
  RankingRow,
} from "@/services/rankings/types";
import type { RankingsMetadata } from "@/services/rankings/types";

const PAGE_SIZE = RESULTS_PAGE_SIZE;
const MAX_SEARCH_RESULTS = 500;

function toRankingEntry(
  row: RankingRow,
  scope: QueryInput["scope"],
): RankingEntry {
  const rankDelta =
    scope === "continent"
      ? row.continent_rank_delta
      : scope === "country"
        ? row.country_rank_delta
        : row.world_rank_delta;
  const rankDeltaState =
    scope === "continent"
      ? row.continent_rank_delta_state
      : scope === "country"
        ? row.country_rank_delta_state
        : row.world_rank_delta_state;
  return {
    rank: Number(row.rank),
    subRank: Number(row.sub_rank),
    personId: row.person_id,
    personName: row.person_name,
    countryId: row.country_id,
    countryName: row.country_name,
    countryIso2: row.country_iso2,
    continentId: row.continent_id,
    best: Number(row.best),
    competitionId: row.competition_id,
    competitionName: row.competition_name,
    recordBadges: getRecordBadges({
      isWorldRecord: Number(row.is_world_record) === 1,
      isContinentRecord: Number(row.is_continent_record) === 1,
      isCountryRecord: Number(row.is_country_record) === 1,
      continentId: row.continent_id,
    }),
    rankDelta:
      rankDelta === null || rankDelta === undefined ? null : Number(rankDelta),
    rankDeltaState: rankDeltaState ?? null,
    recordStreakWeeks:
      row.record_streak_weeks === null || row.record_streak_weeks === undefined
        ? null
        : Number(row.record_streak_weeks),
  };
}

function filters(input: QueryInput) {
  const { rank, subRank, region } = rankingShape(input.scope);
  const values: unknown[] = [input.eventId];
  const conditions = ["event_id = ?"];
  if (region) {
    conditions.push(`${region} = ?`);
    values.push(input.regionId);
  }
  conditions.push(`${rank} > 0`);
  const gender = genderCondition("gender_person", input.gender);
  if (gender.sql) {
    conditions.push(gender.sql);
    values.push(...gender.values);
  }
  return { rank, subRank, conditions, values };
}

function normalPageResponse(
  rows: RankingRow[],
  input: QueryInput,
  metadata: RankingsMetadata,
  filteredTotal?: number,
  pageSize = PAGE_SIZE,
) {
  const total =
    filteredTotal ??
    (input.year === null
      ? getRankingCount(
          metadata,
          input.eventId,
          input.type,
          input.scope,
          input.regionId,
        )
      : getYearRankingCount(
          metadata,
          input.year,
          input.eventId,
          input.type,
          input.scope,
          input.regionId,
        ));
  const entries = rows.map((row) => toRankingEntry(row, input.scope));
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

function yearlyColumns(type: RankingType) {
  const recordColumn =
    type === "average"
      ? "facts.regional_average_record"
      : "facts.regional_single_record";
  return `ranking.public_rank AS rank, ranking.position AS sub_rank, ranking.person_id,
    COALESCE(person.name, ranking.person_id) AS person_name,
    COALESCE(country.id, '') AS country_id, COALESCE(country.name, country.id, '') AS country_name,
    COALESCE(country.iso2, '') AS country_iso2, COALESCE(country.continent_id, '') AS continent_id,
    ranking.result_value AS best, COALESCE(facts.competition_id, '') AS competition_id,
    COALESCE(competition.name, '') AS competition_name,
    ${recordColumn} = 'WR' AS is_world_record,
    ${recordColumn} IN ('AfR', 'AsR', 'ER', 'NaR', 'OcR', 'SaR') AS is_continent_record,
    ${recordColumn} = 'NR' AS is_country_record`;
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
    // Resolve the small cohort dimension before scanning rankings so MariaDB
    // can use the year/event/cohort/position browse index directly.
    conditions: [
      "ranking.year = ?",
      "ranking.event_id = ?",
      "ranking.cohort_id = (SELECT cohort_id FROM person_year_ranking_cohorts WHERE scope = ? AND region_id = ?)",
      ...(gender.sql ? [gender.sql] : []),
    ],
    values,
  };
}

async function queryGenderPage(input: QueryInput) {
  if (input.year === null && !input.search && !input.locate) {
    return queryGenderPersonPage(input);
  }
  const enhancements = await getRankingEntryEnhancements();
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
    if (people.personIds.length === 0)
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
    conditions.push(
      `person_id IN (${people.personIds.map(() => "?").join(", ")})`,
    );
    values.push(...people.personIds);
  } else {
    conditions.push("filtered_position >= ? AND filtered_position < ?");
    // Fetch one extra row so the caller can determine whether another page exists.
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
        enhancements,
      ),
    }),
    [...values, resultLimit],
  );
  const entries = result.rows
    .slice(0, input.locate ? 1 : input.limit)
    .map((row) => toRankingEntry(row, input.scope));
  if (input.locate)
    return {
      data: { located: entries[0] ?? null },
      timings: result.timings,
      queryCount: 1,
      returnedRows: result.rows.length,
    };
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

async function queryGenderPersonPage(input: QueryInput) {
  const positionColumn =
    input.scope === "continent"
      ? "continent_position"
      : input.scope === "country"
        ? "country_position"
        : "world_position";
  const regionColumn =
    input.scope === "continent"
      ? "continent_id"
      : input.scope === "country"
        ? "country_id"
        : null;
  const recordColumn =
    input.type === "average"
      ? "facts.regional_average_record"
      : "facts.regional_single_record";
  const filterValues: unknown[] = [input.eventId, input.type, ...input.gender];
  if (regionColumn) filterValues.push(input.regionId);
  const totalPromise = query<{ count: number }>(
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
      : await query<{ count: number }>(
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
    } as unknown as RankingRow;
  });
  const entries = rankedRows
    .slice(0, input.limit)
    .map((row) => toRankingEntry(row, input.scope));
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

async function queryNormalPage(
  input: QueryInput,
  metadata: RankingsMetadata,
  pageSize = PAGE_SIZE,
) {
  if (input.year !== null) {
    const { conditions, values } = yearlyFilters(input);
    if (input.gender.length) {
      const result = await query<RankingRow & { total_count?: number }>(
        filteredYearlyRankingPageQuery(
          yearlyRankingTable(input.type),
          conditions,
        ),
        [...values, input.startRank, input.startRank + pageSize],
      );
      return {
        data: normalPageResponse(
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
      data: normalPageResponse(
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
  const enhancements = await getRankingEntryEnhancements();
  const { rank, subRank, conditions, values } = filters(input);
  const pageValues = [...values, input.startRank, input.startRank + pageSize];
  const result = await query<RankingRow>(
    rankingPageQuery(
      rankingTable(input.type),
      rankingColumns(rank, subRank, enhancements),
      conditions,
      subRank,
    ),
    pageValues,
  );
  return {
    data: normalPageResponse(result.rows, input, metadata, undefined, pageSize),
    timings: result.timings,
    queryCount: 1,
    returnedRows: result.rows.length,
  };
}

async function queryMysql(input: QueryInput) {
  if (input.eventId === "SOR" || input.eventId === "sor-kinch")
    return queryPersonMetric(input);
  if (input.gender.length && input.year === null) return queryGenderPage(input);
  const yearly = input.year !== null;
  const { rank, subRank, conditions, values } = yearly
    ? { rank: "public_rank", subRank: "position", ...yearlyFilters(input) }
    : filters(input);
  const source = yearly
    ? yearlyRankingTable(input.type)
    : rankingTable(input.type);
  const selectColumns = yearly
    ? yearlyColumns(input.type)
    : rankingColumns(rank, subRank, await getRankingEntryEnhancements());
  let from = `FROM ${source} ranking`;
  if (yearly) {
    from = `FROM ${source} ranking LEFT JOIN persons person ON person.wca_id = ranking.person_id AND person.sub_id = 1 LEFT JOIN result_facts facts ON facts.result_id = ranking.result_id LEFT JOIN countries country ON country.id = facts.person_country_id LEFT JOIN competitions competition ON competition.id = facts.competition_id`;
  } else if (input.gender.length) {
    from = `FROM ${source} ranking JOIN persons gender_person ON gender_person.wca_id = ranking.person_id AND gender_person.sub_id = 1`;
  }
  const predicate = yearly
    ? conditions.join(" AND ")
    : conditions.join(" AND ");
  const qualifiedSubRank = yearly ? `ranking.${subRank}` : subRank;
  const personColumn = yearly ? "ranking.person_id" : "ranking.person_id";
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
        located: result.rows[0]
          ? toRankingEntry(result.rows[0], input.scope)
          : null,
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
    const entries = result.rows.map((row) => toRankingEntry(row, input.scope));
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
  const entries = result.rows
    .slice(0, input.limit)
    .map((row) => toRankingEntry(row, input.scope));
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

function personMetricEntry(row: PersonMetricRow): RankingEntry {
  return {
    rank: Number(row.rank),
    subRank: Number(row.sub_rank),
    personId: row.person_id,
    personName: row.person_name,
    countryId: row.country_id,
    countryName: row.country_name,
    countryIso2: row.country_iso2,
    continentId: row.continent_id,
    best: Number(row.best),
    competitionId: "",
    competitionName: "",
    recordBadges: [],
  };
}

async function queryPersonMetric(input: QueryInput) {
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
  if (input.gender.length)
    return queryFilteredPersonMetric(input, kinch, gender);
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
    .map(personMetricEntry);
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
        result.rows.length > input.limit ? input.startRank + PAGE_SIZE : null,
      previousPageStart:
        input.startRank > 1 ? Math.max(1, input.startRank - PAGE_SIZE) : null,
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
  gender: ReturnType<typeof genderCondition>,
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
  const entries = rows.slice(0, entryLimit).map(personMetricEntry);
  if (input.locate)
    return {
      data: { located: entries[0] ?? null },
      timings,
      queryCount: 1,
      returnedRows: peopleReturnedRows + rows.length,
    };
  if (search)
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
  return {
    data: {
      entries,
      hasMore: rows.length > input.limit,
      nextPageStart:
        rows.length > input.limit ? input.startRank + PAGE_SIZE : null,
      previousPageStart:
        input.startRank > 1 ? Math.max(1, input.startRank - PAGE_SIZE) : null,
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

function parseInput(searchParams: URLSearchParams): QueryInput {
  const eventId = isRankingEventId(
    searchParams.get("eventId") ?? searchParams.get("event"),
  )
    ? (searchParams.get("eventId") ?? searchParams.get("event")!)
    : "333";
  const rawType = searchParams.get("result") ?? searchParams.get("type");
  let type: RankingType = "single";
  if (eventId !== "333mbf" && eventId !== "sor-kinch" && isRankingType(rawType))
    type = rawType;
  const { scope, regionId } = parseRegionQuery(searchParams.get("region"));
  const kinchOrder =
    searchParams.get("kinch") === "continent" ? "continent" : "regional";
  if (scope !== "world" && !regionId)
    throw new Error("Choose a region before loading rankings.");
  const paged = searchParams.get("paged") === "1";
  const rawStart = Number(searchParams.get("start"));
  const startRank = paged
    ? Math.floor(
        Math.max(0, Number.isFinite(rawStart) ? rawStart : 0) / PAGE_SIZE,
      ) *
        PAGE_SIZE +
      1
    : Math.max(1, rawStart || 1);
  const search = (searchParams.get("search") ?? "").trim().slice(0, 80);
  const regexSearch = searchParams.get("mode") === "vim";
  if (regexSearch && search && !isValidRegexPattern(search))
    throw new Error("Invalid regular expression.");
  return {
    eventId,
    type,
    gender: parseGender(searchParams),
    scope,
    regionId,
    year: parseYear(searchParams),
    kinchOrder,
    startRank,
    cursorRank: Number(searchParams.get("cursorRank")) || null,
    cursorId: searchParams.get("cursorId") ?? "",
    limit: paged
      ? PAGE_SIZE
      : Math.min(
          PAGE_SIZE,
          Math.max(20, Number(searchParams.get("limit")) || 80),
        ),
    locate: (searchParams.get("locate") ?? "").trim().toUpperCase(),
    search,
    regexSearch,
    searchLimit: Math.min(
      MAX_SEARCH_RESULTS,
      Math.max(
        1,
        Number(searchParams.get("searchLimit")) || MAX_SEARCH_RESULTS,
      ),
    ),
    paged,
  };
}

function personWindowKey(
  input: QueryInput,
  windowStart: number,
  dataVersion: string,
) {
  return JSON.stringify({
    dataVersion,
    eventId: input.eventId,
    type: input.type,
    gender: input.gender,
    scope: input.scope,
    regionId: input.regionId,
    year: input.year,
    kinchOrder: input.eventId === "sor-kinch" ? input.kinchOrder : null,
    windowStart,
  });
}

function isPersonMetric(input: QueryInput) {
  return input.eventId === "SOR" || input.eventId === "sor-kinch";
}

function isPrimedPersonMetricWindow(input: QueryInput, windowStart: number) {
  return (
    isPersonMetric(input) &&
    input.scope === "world" &&
    input.gender.length === 0 &&
    windowStart === 1
  );
}

function loadRankingWindow(input: QueryInput, metadata: RankingsMetadata) {
  if (isPersonMetric(input)) return queryPersonMetric(input);
  return input.gender.length && input.year === null
    ? queryGenderPage(input)
    : queryNormalPage(input, metadata, RANKINGS_WINDOW_SIZE);
}

function slicePersonWindow(
  data: Record<string, unknown>,
  input: QueryInput,
  windowStart: number,
) {
  const windowEntries = Array.isArray(data.entries)
    ? (data.entries as RankingEntry[])
    : [];
  const offset = Math.max(0, input.startRank - windowStart);
  const entries = windowEntries.slice(offset, offset + input.limit);
  const total = Number(data.total ?? 0);
  const startPosition = Math.min(Math.max(0, input.startRank - 1), total);
  const hasMore = startPosition + entries.length < total;
  return {
    ...data,
    entries,
    hasMore,
    nextPageStart: hasMore ? input.startRank + input.limit : null,
    previousPageStart:
      input.startRank > 1 && total > 0
        ? Math.max(1, input.startRank - input.limit)
        : null,
    startPosition,
    lastRank: entries.at(-1)?.subRank ?? null,
    total,
  };
}

export async function loadRankingsWithDiagnostics(
  searchParams: URLSearchParams,
) {
  const input = parseInput(searchParams);
  if (input.year !== null && isPersonMetric(input))
    throw new ApiInputError(
      "year is only available for person event rankings.",
    );
  const metadata = await getCurrentRankingsMetadata();
  if (input.year !== null && !metadata.availableYears.includes(input.year))
    throw new ApiInputError(`year ${input.year} is unavailable.`);
  const cacheable =
    input.paged &&
    !input.search &&
    !input.locate &&
    !input.cursorRank &&
    !input.cursorId;
  if (!cacheable) {
    const result =
      input.year !== null && input.gender.length
        ? await queryNormalPage(input, metadata)
        : await queryMysql(input);
    return {
      ...result,
      data: { ...result.data, availableYears: metadata.availableYears },
      cacheOutcome: "bypass" as const,
      cacheLayer: "memory" as const,
      dataVersion: null,
    };
  }
  const windowStart =
    Math.floor((input.startRank - 1) / RANKINGS_WINDOW_SIZE) *
      RANKINGS_WINDOW_SIZE +
    1;
  const windowInput = {
    ...input,
    startRank: windowStart,
    limit: RANKINGS_WINDOW_SIZE,
  };
  const cached = (await rankingsWindowCache.getWithStatus(
    personWindowKey(input, windowStart, metadata.fetchedAt),
    async () =>
      loadRankingWindow(windowInput, metadata) as unknown as Record<
        string,
        unknown
      >,
    { pin: isPrimedPersonMetricWindow(input, windowStart) },
  )) as {
    value: {
      data: Record<string, unknown>;
      timings: { queueMs: number; statementMs: number };
      queryCount: number;
      returnedRows: number;
    };
    outcome: "hit" | "miss" | "coalesced";
  };
  const windowTotal = Number(cached.value.data.total ?? 0);
  const nextWindowStart = windowStart + RANKINGS_WINDOW_SIZE;
  if (
    input.startRank - windowStart >= RANKINGS_WINDOW_SIZE / 2 &&
    nextWindowStart <= windowTotal
  ) {
    void rankingsWindowCache
      .getWithStatus(
        personWindowKey(input, nextWindowStart, metadata.fetchedAt),
        async () => {
          const nextInput = {
            ...input,
            startRank: nextWindowStart,
            limit: RANKINGS_WINDOW_SIZE,
          };
          return loadRankingWindow(nextInput, metadata) as unknown as Record<
            string,
            unknown
          >;
        },
      )
      .catch((error) => console.warn("Ranking window prefetch failed", error));
  }
  return {
    ...cached.value,
    data: slicePersonWindow(cached.value.data, input, windowStart),
    timings:
      cached.outcome === "hit"
        ? { queueMs: 0, statementMs: 0 }
        : cached.value.timings,
    cacheOutcome: cached.outcome,
    cacheLayer: "memory" as const,
    dataVersion: metadata.fetchedAt,
  };
}
