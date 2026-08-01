import { query } from "@/db";
import { RESULTS_PAGE_SIZE } from "@/lib/rankings-config";
import { getCurrentRankingsMetadata, getRankingCount, getYearRankingCount, type RankingsMetadata } from "@/lib/rankings-metadata";
import { normalPageKey, rankingsPageCache } from "@/lib/rankings-cache";
import { searchPersonIds } from "@/lib/person-search";
import { ApiInputError, parseGender, parseYear } from "@/lib/projection-api";
import { getRecordBadges, isRankingEventId, isRankingType, isValidRegexPattern, parseRegionQuery, type GenderFilter, type RankingEntry, type RankingType, type RegionScope } from "@/lib/wca";

const PAGE_SIZE = RESULTS_PAGE_SIZE;
const MAX_SEARCH_RESULTS = 500;

type RankingRow = { rank: number; sub_rank: number; total_count?: number; person_id: string; person_name: string; country_id: string; country_name: string; country_iso2: string; continent_id: string; best: number; competition_id: string; competition_name: string; is_world_record: number; is_continent_record: number; is_country_record: number };
type KinchOrder = "regional" | "continent";
type QueryInput = { eventId: string; type: RankingType; gender: GenderFilter[]; scope: RegionScope; regionId: string; year: number | null; kinchOrder: KinchOrder; startRank: number; cursorRank: number | null; cursorId: string; limit: number; locate: string; search: string; regexSearch: boolean; searchLimit: number; paged: boolean };
type PersonMetricRow = {
  rank: number;
  sub_rank: number;
  person_id: string;
  person_name: string;
  country_id: string;
  country_name: string;
  country_iso2: string;
  continent_id: string;
  best: number;
};
type FilteredPersonMetricRow = PersonMetricRow & { total_count?: number };

function toRankingEntry(row: RankingRow): RankingEntry {
  return { rank: Number(row.rank), subRank: Number(row.sub_rank), personId: row.person_id, personName: row.person_name, countryId: row.country_id, countryName: row.country_name, countryIso2: row.country_iso2, continentId: row.continent_id, best: Number(row.best), competitionId: row.competition_id, competitionName: row.competition_name, recordBadges: getRecordBadges({ isWorldRecord: Number(row.is_world_record) === 1, isContinentRecord: Number(row.is_continent_record) === 1, isCountryRecord: Number(row.is_country_record) === 1, continentId: row.continent_id }) };
}

function shape(scope: RegionScope) {
  if (scope === "continent") return { rank: "continent_rank", subRank: "continent_sub_rank", region: "continent_id" } as const;
  if (scope === "country") return { rank: "country_rank", subRank: "country_sub_rank", region: "country_id" } as const;
  return { rank: "world_rank", subRank: "world_sub_rank", region: null } as const;
}

function table(type: RankingType) { return type === "average" ? "ranking_entries_average" : "ranking_entries_single"; }
function yearlyTable(type: RankingType) { return type === "average" ? "person_year_rankings_average" : "person_year_rankings_single"; }
function columns(rank: string, subRank: string) {
  return `${rank} AS rank, ${subRank} AS sub_rank, person_id, person_name, country_id, country_name, country_iso2, continent_id, best, competition_id, competition_name, is_world_record, is_continent_record, is_country_record`;
}
function genderCondition(alias: string, genders: readonly GenderFilter[]) {
  if (!genders.length) return { sql: "", values: [] as unknown[] };
  const parts = genders.map((gender) => gender === "o" ? `(${alias}.gender = 'o' OR ${alias}.gender IS NULL)` : `${alias}.gender = ?`);
  return { sql: `(${parts.join(" OR ")})`, values: genders.filter((gender) => gender !== "o") };
}
function filters(input: QueryInput) {
  const { rank, subRank, region } = shape(input.scope);
  const values: unknown[] = [input.eventId];
  const conditions = ["event_id = ?"];
  if (region) { conditions.push(`${region} = ?`); values.push(input.regionId); }
  conditions.push(`${rank} > 0`);
  const gender = genderCondition("gender_person", input.gender);
  if (gender.sql) { conditions.push(gender.sql); values.push(...gender.values); }
  return { rank, subRank, conditions, values };
}

function normalPageResponse(rows: RankingRow[], input: QueryInput, metadata: RankingsMetadata) {
  const total = input.year === null
    ? getRankingCount(metadata, input.eventId, input.type, input.scope, input.regionId)
    : getYearRankingCount(metadata, input.year, input.eventId, input.type, input.scope, input.regionId);
  const entries = rows.map(toRankingEntry);
  const startPosition = Math.min(Math.max(0, input.startRank - 1), total);
  const hasMore = input.startRank + entries.length <= total;
  return { entries, hasMore, nextPageStart: hasMore ? input.startRank + PAGE_SIZE : null, previousPageStart: input.startRank > 1 && total > 0 ? Math.max(1, input.startRank - PAGE_SIZE) : null, startPosition, lastRank: entries.at(-1)?.subRank ?? null, total, exportDate: metadata.exportDate, availableYears: metadata.availableYears };
}

function yearlyColumns(type: RankingType) {
  const recordColumn = type === "average" ? "facts.regional_average_record" : "facts.regional_single_record";
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
  const values: unknown[] = [input.year, input.eventId, input.scope, input.regionId];
  const gender = genderCondition("person", input.gender);
  values.push(...gender.values);
  return {
    // Resolve the small cohort dimension before scanning rankings so MariaDB
    // can use the year/event/cohort/position browse index directly.
    conditions: ["ranking.year = ?", "ranking.event_id = ?", "ranking.cohort_id = (SELECT cohort_id FROM person_year_ranking_cohorts WHERE scope = ? AND region_id = ?)", ...(gender.sql ? [gender.sql] : [])],
    values,
  };
}

async function queryGenderPage(input: QueryInput) {
  const source = table(input.type);
  const { region } = shape(input.scope);
  const baseConditions = ["ranking.event_id = ?", "ranking.world_rank > 0"];
  const baseValues: unknown[] = [input.eventId];
  if (region) {
    baseConditions.push(`ranking.${region} = ?`);
    baseValues.push(input.regionId);
  }
  const gender = genderCondition("gender_person", input.gender);
  if (gender.sql) { baseConditions.push(gender.sql); baseValues.push(...gender.values); }
  const cte = `WITH filtered AS (
    SELECT ranking.*,
      RANK() OVER (ORDER BY ranking.best) AS filtered_rank,
      ROW_NUMBER() OVER (ORDER BY ranking.best, ranking.person_name, ranking.person_id) AS filtered_position,
      COUNT(*) OVER () AS total_count
    FROM ${source} ranking
    JOIN persons gender_person ON gender_person.wca_id = ranking.person_id AND gender_person.sub_id = 1
    WHERE ${baseConditions.join(" AND ")}
  )`;
  const columns = `filtered_rank AS rank, filtered_position AS sub_rank, total_count,
    person_id, person_name, country_id, country_name, country_iso2, continent_id, best,
    competition_id, competition_name, is_world_record, is_continent_record, is_country_record`;
  const conditions: string[] = [];
  const values: unknown[] = [...baseValues];
  if (input.locate) {
    conditions.push("person_id = ?");
    values.push(input.locate);
  } else if (input.search) {
    const people = await searchPersonIds(input.search, input.regexSearch, input.searchLimit);
    if (people.personIds.length === 0) return { data: { entries: [], hasMore: false, nextPageStart: null, previousPageStart: null, total: 0 }, timings: people.timings, queryCount: 1, returnedRows: 0 };
    conditions.push(`person_id IN (${people.personIds.map(() => "?").join(", ")})`);
    values.push(...people.personIds);
  } else {
    conditions.push("filtered_position >= ? AND filtered_position < ?");
    // Fetch one extra row so the caller can determine whether another page exists.
    values.push(input.startRank, input.startRank + input.limit + 1);
  }
  const result = await query<RankingRow>(`${cte} SELECT ${columns} FROM filtered ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""} ORDER BY filtered_position LIMIT ?`, [...values, input.locate ? 1 : input.search ? input.searchLimit : input.limit + 1]);
  const entries = result.rows.slice(0, input.locate ? 1 : input.limit).map(toRankingEntry);
  if (input.locate) return { data: { located: entries[0] ?? null }, timings: result.timings, queryCount: 1, returnedRows: result.rows.length };
  const total = Number(result.rows[0]?.total_count ?? 0);
  return { data: { entries, hasMore: result.rows.length > input.limit, nextPageStart: result.rows.length > input.limit ? input.startRank + PAGE_SIZE : null, previousPageStart: input.startRank > 1 ? Math.max(1, input.startRank - PAGE_SIZE) : null, total, exportDate: null, startPosition: input.startRank - 1, lastRank: entries.at(-1)?.subRank ?? null }, timings: result.timings, queryCount: 1, returnedRows: result.rows.length };
}

async function queryNormalPage(input: QueryInput, metadata: RankingsMetadata) {
  if (input.year !== null) {
    const { conditions, values } = yearlyFilters(input);
    const result = await query<RankingRow>(`SELECT ${yearlyColumns(input.type)}
      FROM ${yearlyTable(input.type)} ranking
      LEFT JOIN persons person ON person.wca_id = ranking.person_id AND person.sub_id = 1
      LEFT JOIN result_facts facts ON facts.result_id = ranking.result_id
      LEFT JOIN countries country ON country.id = facts.person_country_id
      LEFT JOIN competitions competition ON competition.id = facts.competition_id
      WHERE ${conditions.join(" AND ")} AND ranking.position >= ? AND ranking.position < ?
      ORDER BY ranking.position`, [...values, input.startRank, input.startRank + PAGE_SIZE]);
    return { data: normalPageResponse(result.rows, input, metadata), timings: result.timings, queryCount: 1, returnedRows: result.rows.length };
  }
  const { rank, subRank, conditions, values } = filters(input);
  const pageValues = [...values, input.startRank, input.startRank + PAGE_SIZE];
  const result = await query<RankingRow>(`SELECT ${columns(rank, subRank)} FROM ${table(input.type)} WHERE ${conditions.join(" AND ")} AND ${subRank} >= ? AND ${subRank} < ? ORDER BY ${subRank}`, pageValues);
  return { data: normalPageResponse(result.rows, input, metadata), timings: result.timings, queryCount: 1, returnedRows: result.rows.length };
}

export async function queryMysql(input: QueryInput) {
  if (input.eventId === "SOR" || input.eventId === "sor-kinch")
    return queryPersonMetric(input);
  if (input.gender.length && input.year === null) return queryGenderPage(input);
  const yearly = input.year !== null;
  const { rank, subRank, conditions, values } = yearly ? { rank: "public_rank", subRank: "position", ...yearlyFilters(input) } : filters(input);
  const source = yearly ? yearlyTable(input.type) : table(input.type);
  const selectColumns = yearly ? yearlyColumns(input.type) : columns(rank, subRank);
  const from = yearly
    ? `FROM ${source} ranking LEFT JOIN persons person ON person.wca_id = ranking.person_id AND person.sub_id = 1 LEFT JOIN result_facts facts ON facts.result_id = ranking.result_id LEFT JOIN countries country ON country.id = facts.person_country_id LEFT JOIN competitions competition ON competition.id = facts.competition_id`
    : input.gender.length
      ? `FROM ${source} ranking JOIN persons gender_person ON gender_person.wca_id = ranking.person_id AND gender_person.sub_id = 1`
      : `FROM ${source} ranking`;
  const predicate = yearly ? conditions.join(" AND ") : conditions.join(" AND ");
  const qualifiedSubRank = yearly ? `ranking.${subRank}` : subRank;
  const personColumn = yearly ? "ranking.person_id" : "ranking.person_id";
  if (input.locate) {
    const result = await query<RankingRow>(`SELECT ${selectColumns} ${from} WHERE ${predicate} AND ${personColumn} = ? LIMIT 1`, [...values, input.locate]);
    return { data: { located: result.rows[0] ? toRankingEntry(result.rows[0]) : null }, timings: result.timings, queryCount: 1, returnedRows: result.rows.length };
  }
  if (input.search) {
    const people = await searchPersonIds(input.search, input.regexSearch, input.searchLimit);
    if (people.personIds.length === 0) {
      return { data: { entries: [], hasMore: false, nextPageStart: null, previousPageStart: null, total: 0 }, timings: people.timings, queryCount: 1, returnedRows: 0 };
    }
    const placeholders = people.personIds.map(() => "?").join(", ");
    const result = await query<RankingRow>(
      `SELECT ${selectColumns} ${from} WHERE ${predicate} AND ${personColumn} IN (${placeholders}) ORDER BY ${qualifiedSubRank} LIMIT ?`,
      [...values, ...people.personIds, input.searchLimit],
    );
    const entries = result.rows.map(toRankingEntry);
    return {
      data: { entries, hasMore: false, nextPageStart: null, previousPageStart: null, total: entries.length },
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
  const pageValues = input.cursorRank ? [...values, input.cursorRank, input.cursorRank, input.cursorId, input.limit + 1] : [...values, input.startRank, input.limit + 1];
  const result = await query<RankingRow>(`SELECT ${selectColumns} ${from} WHERE ${predicate}${cursor} ORDER BY ${qualifiedSubRank} LIMIT ?`, pageValues);
  const entries = result.rows.slice(0, input.limit).map(toRankingEntry);
  return { data: { entries, hasMore: result.rows.length > input.limit, nextPageStart: null, previousPageStart: null, total: entries.length }, timings: result.timings, queryCount: 1, returnedRows: result.rows.length };
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
  const continentKinch = kinch && input.scope === "country" && input.kinchOrder === "continent";
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
  const gender = genderCondition("person", input.gender);
  if (input.gender.length) return queryFilteredPersonMetric(input, kinch, gender);
  if (gender.sql) { conditions.push(gender.sql); values.push(...gender.values); }
  let peopleTimings = { queueMs: 0, statementMs: 0 };
  let peopleReturnedRows = 0;

  if (input.locate) {
    conditions.push("score.person_id = ?");
    values.push(input.locate);
  } else if (input.search) {
    const people = await searchPersonIds(input.search, input.regexSearch, input.searchLimit);
    peopleTimings = people.timings;
    peopleReturnedRows = people.returnedRows;
    if (people.personIds.length === 0) {
      return {
        data: { entries: [], hasMore: false, nextPageStart: null, previousPageStart: null, total: 0 },
        timings: people.timings,
        queryCount: 1,
        returnedRows: people.returnedRows,
      };
    }
    conditions.push(`score.person_id IN (${people.personIds.map(() => "?").join(", ")})`);
    values.push(...people.personIds);
  } else if (input.cursorRank) {
    conditions.push(`(score.${positionColumn} > ? OR (score.${positionColumn} = ? AND score.person_id > ?))`);
    values.push(input.cursorRank, input.cursorRank, input.cursorId);
  } else {
    conditions.push(`score.${positionColumn} >= ?`);
    values.push(input.startRank);
  }

  const limit = input.locate ? 1 : input.search ? input.searchLimit : input.limit + 1;
  const result = await query<PersonMetricRow>(
    `SELECT score.${rankColumn} AS rank, score.${positionColumn} AS sub_rank, score.person_id,
       COALESCE(person.name, score.person_id) AS person_name,
       COALESCE(display_country.id, '') AS country_id,
       COALESCE(display_country.name, display_country.id, '') AS country_name,
       COALESCE(display_country.iso2, '') AS country_iso2,
       COALESCE(display_country.continent_id, '') AS continent_id,
       ${scoreExpression} AS best
     FROM person_sum_of_ranks_scores score
     LEFT JOIN persons person ON person.wca_id = score.person_id AND person.sub_id = 1
     LEFT JOIN countries current_country ON current_country.id = person.country_id
     LEFT JOIN countries display_country ON display_country.id = CASE
       WHEN ? = 'country' THEN ?
       WHEN ? = 'continent' AND current_country.continent_id <> ? THEN NULL
       ELSE person.country_id
     END
     WHERE ${conditions.join(" AND ")}
     ORDER BY score.${positionColumn}, score.person_id
     LIMIT ?`,
    [input.scope, input.regionId, input.scope, input.regionId, ...values, limit],
  );
  const timings = {
    queueMs: peopleTimings.queueMs + result.timings.queueMs,
    statementMs: peopleTimings.statementMs + result.timings.statementMs,
  };
  const entries = result.rows.slice(0, input.locate ? 1 : limit - (input.search ? 0 : 1)).map(personMetricEntry);
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
      data: { entries, hasMore: false, nextPageStart: null, previousPageStart: null, total: entries.length },
      timings,
      queryCount: 2,
      returnedRows: peopleReturnedRows + result.rows.length,
    };
  }

  const end = await query<{ position: number }>(
    `SELECT ${positionColumn} AS position
     FROM person_sum_of_ranks_scores
     WHERE metric_version = 1 AND event_set_version = 1
       AND result_type = ? AND scope = ? AND region_id = ?
       AND ${positionColumn} IS NOT NULL
     ORDER BY ${positionColumn} DESC
     LIMIT 1`,
    [metricResultType, input.scope, input.regionId],
  );
  return {
    data: {
      entries,
      hasMore: result.rows.length > input.limit,
      nextPageStart: result.rows.length > input.limit ? input.startRank + PAGE_SIZE : null,
      previousPageStart: input.startRank > 1 ? Math.max(1, input.startRank - PAGE_SIZE) : null,
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

async function queryFilteredPersonMetric(input: QueryInput, kinch: boolean, gender: ReturnType<typeof genderCondition>) {
  const continentKinch = kinch && input.scope === "country" && input.kinchOrder === "continent";
  const metricResultType = kinch ? "single" : input.type;
  const kinchScoreColumn = continentKinch ? "kinch_continent_score" : "kinch_score";
  const positionColumn = kinch ? `${continentKinch ? "kinch_continent" : "kinch"}_position` : "position";
  const scoreOrder = kinch ? `score.${kinchScoreColumn} / 17.0 DESC` : "score.score ASC";
  const scoreValue = kinch ? `score.${kinchScoreColumn} / 17.0` : "score.score";
  const values: unknown[] = [metricResultType, input.scope, input.regionId, ...gender.values];
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
    const people = await searchPersonIds(input.search, input.regexSearch, input.searchLimit);
    peopleTimings = people.timings;
    peopleReturnedRows = people.returnedRows;
    if (people.personIds.length === 0) {
      return {
        data: { entries: [], hasMore: false, nextPageStart: null, previousPageStart: null, startPosition: 0, lastRank: null, total: 0 },
        timings: people.timings,
        queryCount: 1,
        returnedRows: people.returnedRows,
      };
    }
    pageConditions.push(`filtered.person_id IN (${people.personIds.map(() => "?").join(", ")})`);
    pageValues.push(...people.personIds);
  } else if (input.cursorRank) {
    pageConditions.push("(filtered.filtered_position > ? OR (filtered.filtered_position = ? AND filtered.person_id > ?))");
    pageValues.push(input.cursorRank, input.cursorRank, input.cursorId);
  } else {
    pageConditions.push("filtered.filtered_position >= ?");
    pageValues.push(input.startRank);
  }
  const limit = input.locate ? 1 : search ? input.searchLimit : input.limit + 1;
  const result = await query<FilteredPersonMetricRow>(
    `WITH filtered AS (
       SELECT score.person_id, ${scoreValue} AS best,
         person.name AS person_name, person.country_id AS current_country_id,
         DENSE_RANK() OVER (ORDER BY ${scoreOrder}) AS filtered_rank,
         ROW_NUMBER() OVER (ORDER BY ${scoreOrder}, score.person_id) AS filtered_position,
         COUNT(*) OVER () AS total_count
       FROM person_sum_of_ranks_scores score
       LEFT JOIN persons person ON person.wca_id = score.person_id AND person.sub_id = 1
       WHERE ${conditions.join(" AND ")}
     )
     SELECT filtered.filtered_rank AS rank, filtered.filtered_position AS sub_rank, filtered.total_count,
       filtered.person_id, COALESCE(filtered.person_name, filtered.person_id) AS person_name,
       COALESCE(display_country.id, '') AS country_id,
       COALESCE(display_country.name, display_country.id, '') AS country_name,
       COALESCE(display_country.iso2, '') AS country_iso2,
       COALESCE(display_country.continent_id, '') AS continent_id,
       filtered.best
     FROM filtered
     LEFT JOIN countries current_country ON current_country.id = filtered.current_country_id
     LEFT JOIN countries display_country ON display_country.id = CASE
       WHEN ? = 'country' THEN ?
       WHEN ? = 'continent' AND current_country.continent_id <> ? THEN NULL
       ELSE filtered.current_country_id
     END
     WHERE ${pageConditions.join(" AND ")}
     ORDER BY filtered.filtered_position
     LIMIT ?`,
    [...values, input.scope, input.regionId, input.scope, input.regionId, ...pageValues, limit],
  );
  const timings = {
    queueMs: peopleTimings.queueMs + result.timings.queueMs,
    statementMs: peopleTimings.statementMs + result.timings.statementMs,
  };
  const rows = result.rows;
  const entries = rows.slice(0, input.locate ? 1 : search ? rows.length : input.limit).map(personMetricEntry);
  if (input.locate) return { data: { located: entries[0] ?? null }, timings, queryCount: 1, returnedRows: peopleReturnedRows + rows.length };
  if (search) return { data: { entries, hasMore: false, nextPageStart: null, previousPageStart: null, total: entries.length }, timings, queryCount: 2, returnedRows: peopleReturnedRows + rows.length };
  return {
    data: {
      entries,
      hasMore: rows.length > input.limit,
      nextPageStart: rows.length > input.limit ? input.startRank + PAGE_SIZE : null,
      previousPageStart: input.startRank > 1 ? Math.max(1, input.startRank - PAGE_SIZE) : null,
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
  const eventId = isRankingEventId(searchParams.get("eventId") ?? searchParams.get("event")) ? searchParams.get("eventId") ?? searchParams.get("event")! : "333";
  const rawType = searchParams.get("result") ?? searchParams.get("type");
  const type = eventId === "333mbf" || eventId === "sor-kinch" ? "single" : isRankingType(rawType) ? rawType : "single";
  const { scope, regionId } = parseRegionQuery(searchParams.get("region"));
  const kinchOrder = searchParams.get("kinch") === "continent" ? "continent" : "regional";
  if (scope !== "world" && !regionId) throw new Error("Choose a region before loading rankings.");
  const paged = searchParams.get("paged") === "1";
  const rawStart = Number(searchParams.get("start"));
  const startRank = paged ? Math.floor(Math.max(0, Number.isFinite(rawStart) ? rawStart : 0) / PAGE_SIZE) * PAGE_SIZE + 1 : Math.max(1, rawStart || 1);
  const search = (searchParams.get("search") ?? "").trim().slice(0, 80);
  const regexSearch = searchParams.get("mode") === "vim";
  if (regexSearch && search && !isValidRegexPattern(search)) throw new Error("Invalid regular expression.");
  return { eventId, type, gender: parseGender(searchParams), scope, regionId, year: parseYear(searchParams), kinchOrder, startRank, cursorRank: Number(searchParams.get("cursorRank")) || null, cursorId: searchParams.get("cursorId") ?? "", limit: paged ? PAGE_SIZE : Math.min(PAGE_SIZE, Math.max(20, Number(searchParams.get("limit")) || 80)), locate: (searchParams.get("locate") ?? "").trim().toUpperCase(), search, regexSearch, searchLimit: Math.min(MAX_SEARCH_RESULTS, Math.max(1, Number(searchParams.get("searchLimit")) || MAX_SEARCH_RESULTS)), paged };
}

export async function loadRankingsWithDiagnostics(searchParams: URLSearchParams) {
  const input = parseInput(searchParams);
  if (input.year !== null && (input.eventId === "SOR" || input.eventId === "sor-kinch")) throw new ApiInputError("year is only available for person event rankings.");
  if (input.eventId === "SOR" || input.eventId === "sor-kinch") {
    const result = await queryMysql(input);
    return { ...result, cacheOutcome: "bypass" as const, dataVersion: null };
  }
  const metadata = await getCurrentRankingsMetadata();
  if (input.year !== null && !metadata.availableYears.includes(input.year)) throw new ApiInputError(`year ${input.year} is unavailable.`);
  const cacheable = !input.gender.length && input.paged && !input.search && !input.locate && !input.cursorRank && !input.cursorId;
  if (!cacheable) {
    const result = await queryMysql(input);
    return { ...result, data: { ...result.data, availableYears: metadata.availableYears }, cacheOutcome: "bypass" as const, dataVersion: null };
  }
  const cached = await rankingsPageCache.getWithStatus(normalPageKey({ eventId: input.eventId, year: input.year, type: input.type, scope: input.scope, regionId: input.regionId, startRank: input.startRank }), () => queryNormalPage(input, metadata)) as { value: Awaited<ReturnType<typeof queryNormalPage>>; outcome: "hit" | "miss" | "coalesced" };
  return {
    ...cached.value,
    timings: cached.outcome === "hit" ? { queueMs: 0, statementMs: 0 } : cached.value.timings,
    cacheOutcome: cached.outcome,
    dataVersion: metadata.fetchedAt,
  };
}

export async function loadRankings(searchParams: URLSearchParams) {
  return (await loadRankingsWithDiagnostics(searchParams)).data;
}
