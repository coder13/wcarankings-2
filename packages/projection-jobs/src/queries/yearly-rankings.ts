import SQL, { raw } from "sql-template-tag";

export type YearlyResultType = "single" | "average";

export const countryByIsoQuery = SQL`
  SELECT id
  FROM countries
  WHERE iso2 = ?
  LIMIT 1
`;

export const countryCohortQuery = SQL`
  SELECT cohort_id
  FROM person_year_ranking_cohorts
  WHERE scope = 'country'
    AND region_id = ?
  LIMIT 1
`;

export const dropYearlyRankingStageQuery = SQL`
  DROP TEMPORARY TABLE IF EXISTS live_yearly_ranking_stage
`;

const tableFor = (resultType: YearlyResultType): string =>
  resultType === "single"
    ? "person_year_rankings_single"
    : "person_year_rankings_average";

const resultValueColumn = (resultType: YearlyResultType): string =>
  resultType === "single" ? "best" : "average";

export const createYearlyRankingStageQuery = ({
  countryId,
  cohortId,
  eventId,
  resultType,
  year,
}: {
  countryId: string;
  cohortId: number;
  eventId: string;
  resultType: YearlyResultType;
  year: number;
}) => {
  const valueColumn = raw(resultValueColumn(resultType));
  return SQL`
    CREATE TEMPORARY TABLE live_yearly_ranking_stage AS
    WITH facts AS (
      SELECT result_id, person_id, person_country_id AS country_id,
        competition_start_date, competition_id, ${valueColumn} AS result_value
      FROM result_facts
      WHERE result_id > 0 AND competition_year = ${year} AND event_id = ${eventId}
      UNION ALL
      SELECT -CAST(live.projection_result_id AS SIGNED), live.person_id, country.id,
        STR_TO_DATE(CONCAT(competition.year, '-', LPAD(competition.month, 2, '0'), '-', LPAD(competition.day, 2, '0')), '%Y-%m-%d'),
        live.competition_id, live.${valueColumn}
      FROM provisional_live_results live
      JOIN provisional_live_result_sources source
        ON source.source_name = live.source_name
        AND source.competition_id = live.competition_id
        AND source.enabled = 1
      JOIN competitions competition ON competition.id = live.competition_id
      JOIN countries country ON country.iso2 = live.country_iso2
      WHERE competition.year = ${year} AND live.event_id = ${eventId}
    ), candidates AS (
      SELECT *, ROW_NUMBER() OVER (
        PARTITION BY person_id, country_id
        ORDER BY result_value, competition_start_date, competition_id, result_id
      ) AS best_position
      FROM facts
      WHERE result_value > 0 AND country_id = ${countryId}
    ), bests AS (
      SELECT * FROM candidates WHERE best_position = 1
    )
    SELECT ${year} AS year, ${eventId} AS event_id, ${cohortId} AS cohort_id,
      person_id, result_id, result_value, 1 AS is_provisional,
      RANK() OVER (ORDER BY result_value) AS public_rank,
      ROW_NUMBER() OVER (ORDER BY result_value, person_id) AS position
    FROM bests
  `;
};

export const deleteProvisionalYearlyScopeQuery = ({
  cohortId,
  eventId,
  resultType,
  year,
}: {
  cohortId: number;
  eventId: string;
  resultType: YearlyResultType;
  year: number;
}) => SQL`
  DELETE FROM ${raw(tableFor(resultType))}
  WHERE year = ${year}
    AND event_id = ${eventId}
    AND cohort_id = ${cohortId}
`;

export const insertProvisionalYearlyScopeQuery = (
  resultType: YearlyResultType,
) => SQL`
  INSERT INTO ${raw(tableFor(resultType))} (
    year, event_id, cohort_id, person_id, result_id, result_value,
    is_provisional, public_rank, position
  )
  SELECT year, event_id, cohort_id, person_id, result_id, result_value,
    is_provisional, public_rank, position
  FROM live_yearly_ranking_stage
`;
