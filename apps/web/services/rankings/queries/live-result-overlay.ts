import { sqlFragment } from "@/lib/helpers/database/sql";
import type { ResultRankingRequest } from "../result-types";

/**
 * This query is intentionally limited to the current year. It combines the
 * official current-year facts with the small live snapshot set, then ranks the
 * bounded yearly cohort. All-time pages keep their materialized base table.
 */
export function currentYearLiveResultRankingsQuery(
  input: ResultRankingRequest,
) {
  const genderCondition = input.gender.length
    ? `AND candidates.gender IN (${input.gender.map(() => "?").join(", ")})`
    : "";
  const scopeColumn =
    input.scope === "world"
      ? ""
      : input.scope === "continent"
        ? "AND candidates.continent_id = ?"
        : "AND candidates.country_id = ?";
  const official =
    input.resultType === "single"
      ? `SELECT facts.result_id, attempt.attempt_number, facts.person_id,
           facts.gender, facts.person_country_id AS country_id,
           facts.person_continent_id AS continent_id, facts.competition_id,
           facts.competition_start_date, attempt.value AS result_value,
           '' AS record_code
         FROM result_facts facts
         INNER JOIN result_attempts attempt ON attempt.result_id = facts.result_id
         WHERE facts.competition_year = ? AND facts.event_id = ? AND attempt.value > 0`
      : `SELECT facts.result_id, NULL AS attempt_number, facts.person_id,
           facts.gender, facts.person_country_id AS country_id,
           facts.person_continent_id AS continent_id, facts.competition_id,
           facts.competition_start_date, facts.average AS result_value,
           '' AS record_code
         FROM result_facts facts
         WHERE facts.competition_year = ? AND facts.event_id = ? AND facts.average > 0`;
  const live =
    input.resultType === "single"
      ? `SELECT -CAST(live.projection_result_id AS SIGNED) AS result_id,
           attempts.attempt_number, live.person_id,
           CASE WHEN person.gender IN ('m', 'f') THEN person.gender ELSE 'o' END AS gender,
           country.id AS country_id, country.continent_id, live.competition_id,
           STR_TO_DATE(CONCAT(competition.year, '-', LPAD(competition.month, 2, '0'), '-', LPAD(competition.day, 2, '0')), '%Y-%m-%d') AS competition_start_date,
           attempts.result_value, '' AS record_code
         FROM provisional_live_results live
         INNER JOIN provisional_live_result_sources source ON source.source_name = live.source_name AND source.competition_id = live.competition_id AND source.enabled = 1
         INNER JOIN competitions competition ON competition.id = live.competition_id
         INNER JOIN countries country ON country.iso2 = live.country_iso2
         LEFT JOIN persons person ON person.wca_id = live.person_id AND person.sub_id = 1
         INNER JOIN JSON_TABLE(live.attempts_json, '$[*]' COLUMNS (attempt_number FOR ORDINALITY, result_value INT PATH '$')) attempts ON TRUE
         WHERE competition.year = ? AND live.event_id = ? AND attempts.result_value > 0`
      : `SELECT -CAST(live.projection_result_id AS SIGNED) AS result_id,
           NULL AS attempt_number, live.person_id,
           CASE WHEN person.gender IN ('m', 'f') THEN person.gender ELSE 'o' END AS gender,
           country.id AS country_id, country.continent_id, live.competition_id,
           STR_TO_DATE(CONCAT(competition.year, '-', LPAD(competition.month, 2, '0'), '-', LPAD(competition.day, 2, '0')), '%Y-%m-%d') AS competition_start_date,
           live.average AS result_value, '' AS record_code
         FROM provisional_live_results live
         INNER JOIN provisional_live_result_sources source ON source.source_name = live.source_name AND source.competition_id = live.competition_id AND source.enabled = 1
         INNER JOIN competitions competition ON competition.id = live.competition_id
         INNER JOIN countries country ON country.iso2 = live.country_iso2
         LEFT JOIN persons person ON person.wca_id = live.person_id AND person.sub_id = 1
         WHERE competition.year = ? AND live.event_id = ? AND live.average > 0`;
  return sqlFragment`
    WITH candidates AS (${official} UNION ALL ${live}), ranked AS (
      SELECT candidates.*, RANK() OVER (ORDER BY candidates.result_value) AS rank,
        ROW_NUMBER() OVER (ORDER BY candidates.result_value, candidates.competition_start_date, candidates.competition_id, candidates.result_id, COALESCE(candidates.attempt_number, 0)) AS position,
        COUNT(*) OVER () AS total_count
      FROM candidates WHERE 1 = 1 ${genderCondition} ${scopeColumn}
    )
    SELECT
      ranked.*,
      CASE
        WHEN best.world_rank = 1 THEN 'WR'
        WHEN best.continent_rank = 1 THEN 'CR'
        WHEN best.country_rank = 1 THEN 'NR'
        ELSE ''
      END AS record_code,
      COALESCE(person.name, ranked.person_id) AS person_name,
      COALESCE(country.name, ranked.country_id) AS country_name,
      COALESCE(country.iso2, '') AS country_iso2,
      COALESCE(competition.name, ranked.competition_id) AS competition_name
    FROM ranked
    LEFT JOIN persons person ON person.wca_id = ranked.person_id AND person.sub_id = 1
    LEFT JOIN countries country ON country.id = ranked.country_id
    LEFT JOIN competitions competition ON competition.id = ranked.competition_id
    LEFT JOIN person_event_rankings best
      ON best.person_id = ranked.person_id
      AND best.event_id = ?
      AND best.result_type = '${input.resultType}'
      AND best.result_id = ranked.result_id
      AND best.result_value = ranked.result_value
    WHERE ranked.position > ? ORDER BY ranked.position LIMIT ?
  `;
}

export function currentYearLiveResultRankingValues(
  input: ResultRankingRequest,
) {
  return [
    input.year,
    input.eventId,
    input.year,
    input.eventId,
    ...input.gender,
    ...(input.scope === "world" ? [] : [input.regionId]),
    input.eventId,
    input.start,
    input.limit + 1,
  ];
}

type AllTimeScope = {
  table: "result_rankings_single" | "result_rankings_average";
  positionColumn: string;
  rankColumn: string;
  positionIndex: string;
  values: unknown[];
  where: string;
};

function allTimeScope(input: ResultRankingRequest): AllTimeScope {
  const gender = input.gender.length === 1;
  const prefix = gender ? "gender_" : "";
  const table =
    input.resultType === "single"
      ? "result_rankings_single"
      : "result_rankings_average";
  const values = [
    input.eventId,
    ...(input.scope === "world" ? [] : [input.regionId]),
    ...(gender ? [input.gender[0]] : []),
  ];
  const where = [
    "ranking.period_year = 0",
    `ranking.${prefix}${input.scope}_position > 0`,
    "ranking.event_id = ?",
    input.scope === "world" ? "" : `ranking.${input.scope}_id = ?`,
    gender ? "ranking.gender = ?" : "",
  ]
    .filter(Boolean)
    .join(" AND ");
  return {
    table,
    positionColumn: `${prefix}${input.scope}_position`,
    rankColumn: `${prefix}${input.scope}_rank`,
    positionIndex: `idx_results_${input.resultType}_${prefix}${input.scope}`,
    values,
    where,
  };
}

/**
 * Read a small official page directly from the materialized ranking table.
 * Do not put this query in a CTE. MariaDB materializes that CTE before it
 * applies the position range.
 */
export function allTimeOfficialResultPageQuery(input: ResultRankingRequest) {
  const scope = allTimeScope(input);
  const competitionStartDate =
    input.resultType === "single"
      ? "ranking.competition_start_date"
      : "NULL AS competition_start_date";
  return sqlFragment`
    SELECT
      ranking.result_id,
      ranking.attempt_number,
      ranking.result_value,
      ranking.${scope.rankColumn} AS rank,
      ranking.${scope.positionColumn} AS position,
      ranking.person_id,
      ranking.country_id,
      ranking.continent_id,
      ranking.competition_id,
      ${competitionStartDate},
      CASE
        WHEN best.world_rank = 1 THEN 'WR'
        WHEN best.continent_rank = 1 THEN 'CR'
        WHEN best.country_rank = 1 THEN 'NR'
        ELSE ''
      END AS record_code,
      COALESCE(person.name, ranking.person_id) AS person_name,
      COALESCE(country.name, ranking.country_id) AS country_name,
      COALESCE(country.iso2, '') AS country_iso2,
      COALESCE(competition.name, ranking.competition_id) AS competition_name
    FROM ${scope.table} ranking FORCE INDEX (${scope.positionIndex})
    LEFT JOIN persons person ON person.wca_id = ranking.person_id AND person.sub_id = 1
    LEFT JOIN countries country ON country.id = ranking.country_id
    LEFT JOIN competitions competition ON competition.id = ranking.competition_id
    LEFT JOIN person_event_rankings best
      ON best.person_id = ranking.person_id
      AND best.event_id = ranking.event_id
      AND best.result_type = '${input.resultType}'
      AND best.result_id = ranking.result_id
      AND best.result_value = ranking.result_value
    WHERE ${scope.where}
      AND ranking.${scope.positionColumn} > ?
    ORDER BY ranking.${scope.positionColumn}
    LIMIT ?
  `;
}

export function allTimeOfficialResultPageValues(
  input: ResultRankingRequest,
  start: number,
  limit: number,
) {
  return [...allTimeScope(input).values, start, limit];
}

export function allTimeOfficialResultTotalQuery(input: ResultRankingRequest) {
  const scope = allTimeScope(input);
  return sqlFragment`
    SELECT ranking.${scope.positionColumn} AS total_count
    FROM ${scope.table} ranking FORCE INDEX (${scope.positionIndex})
    WHERE ${scope.where}
    ORDER BY ranking.${scope.positionColumn} DESC
    LIMIT 1
  `;
}

export function allTimeOfficialResultTotalValues(input: ResultRankingRequest) {
  return allTimeScope(input).values;
}

export function liveResultCandidatesQuery(input: ResultRankingRequest) {
  const genderCondition =
    input.gender.length === 1
      ? "AND CASE WHEN person.gender IN ('m', 'f') THEN person.gender ELSE 'o' END = ?"
      : "";
  const regionCondition =
    input.scope === "world"
      ? ""
      : `AND country.${input.scope === "continent" ? "continent_id" : "id"} = ?`;
  const source = `
    provisional_live_results live
    INNER JOIN provisional_live_result_sources source
      ON source.source_name = live.source_name
      AND source.competition_id = live.competition_id
      AND source.enabled = 1
    INNER JOIN competitions competition ON competition.id = live.competition_id
    INNER JOIN countries country ON country.iso2 = live.country_iso2
    LEFT JOIN persons person ON person.wca_id = live.person_id AND person.sub_id = 1
  `;
  const fields = `
    -CAST(live.projection_result_id AS SIGNED) AS result_id,
    live.person_id,
    CASE WHEN person.gender IN ('m', 'f') THEN person.gender ELSE 'o' END AS gender,
    country.id AS country_id,
    country.continent_id,
    live.competition_id,
    STR_TO_DATE(CONCAT(competition.year, '-', LPAD(competition.month, 2, '0'), '-', LPAD(competition.day, 2, '0')), '%Y-%m-%d') AS competition_start_date,
    COALESCE(person.name, live.person_id) AS person_name,
    country.name AS country_name,
    country.iso2 AS country_iso2,
    competition.name AS competition_name,
    CASE
      WHEN best.world_rank = 1 THEN 'WR'
      WHEN best.continent_rank = 1 THEN 'CR'
      WHEN best.country_rank = 1 THEN 'NR'
      ELSE ''
    END AS record_code
  `;
  const best = `
    LEFT JOIN person_event_rankings best
      ON best.person_id = live.person_id
      AND best.event_id = live.event_id
      AND best.result_type = '${input.resultType}'
      AND best.result_id = -CAST(live.projection_result_id AS SIGNED)
      AND best.result_value = ${
        input.resultType === "single" ? "live.best" : "live.average"
      }
  `;
  if (input.resultType === "average") {
    return `SELECT ${fields}, NULL AS attempt_number, live.average AS result_value
      FROM ${source} ${best}
      WHERE live.event_id = ? AND live.average > 0
      ${regionCondition} ${genderCondition}`;
  }
  return `SELECT ${fields}, attempts.attempt_number, attempts.result_value
    FROM ${source} ${best}
    INNER JOIN JSON_TABLE(live.attempts_json, '$[*]' COLUMNS (attempt_number FOR ORDINALITY, result_value INT PATH '$')) attempts ON TRUE
    WHERE live.event_id = ? AND attempts.result_value > 0
    ${regionCondition} ${genderCondition}`;
}

export function liveResultCandidatesValues(input: ResultRankingRequest) {
  return [
    input.eventId,
    ...(input.scope === "world" ? [] : [input.regionId]),
    ...(input.gender.length === 1 ? [input.gender[0]] : []),
  ];
}

export function activeLiveResultOverlayQuery() {
  return sqlFragment`
    SELECT EXISTS(
      SELECT 1
      FROM provisional_live_results live
      INNER JOIN provisional_live_result_sources source
        ON source.source_name = live.source_name
        AND source.competition_id = live.competition_id
        AND source.enabled = 1
      WHERE live.event_id = ?
        AND (live.best > 0 OR live.average > 0)
      LIMIT 1
    ) AS active
  `;
}
