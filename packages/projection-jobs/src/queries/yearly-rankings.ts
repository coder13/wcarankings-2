import SQL, { raw } from "sql-template-tag";

export type YearlyResultType = "single" | "average";

export const dropYearlyRankingStageQuery = SQL`
  DROP TEMPORARY TABLE IF EXISTS live_yearly_ranking_stage
`;

const tableFor = (resultType: YearlyResultType): string =>
  resultType === "single"
    ? "person_year_rankings_single"
    : "person_year_rankings_average";

const resultValueColumn = (resultType: YearlyResultType): string =>
  resultType === "single" ? "best" : "average";

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

export const createAllYearlyRankingStageQuery = ({
  eventId,
  resultType,
  year,
}: {
  eventId: string;
  resultType: YearlyResultType;
  year: number;
}) => {
  const valueColumn = raw(resultValueColumn(resultType));
  return SQL`
    CREATE TEMPORARY TABLE live_yearly_ranking_stage AS
    WITH candidates AS (
      SELECT
        person_id,
        country_id,
        continent_id,
        result_id,
        result_value,
        competition_start_date,
        competition_id
      FROM person_event_bests
      WHERE period_year = ${year}
        AND event_id = ${eventId}
        AND result_type = ${resultType}
      UNION ALL
      SELECT
        live.person_id,
        country.id,
        country.continent_id,
        -CAST(live.projection_result_id AS SIGNED),
        live.${valueColumn},
        STR_TO_DATE(
          CONCAT(
            competition.year,
            '-',
            LPAD(competition.month, 2, '0'),
            '-',
            LPAD(competition.day, 2, '0')
          ),
          '%Y-%m-%d'
        ),
        live.competition_id
      FROM provisional_live_results live
      JOIN provisional_live_result_sources source
        ON source.source_name = live.source_name
        AND source.competition_id = live.competition_id
        AND source.enabled = 1
      JOIN competitions competition ON competition.id = live.competition_id
      JOIN countries country ON country.iso2 = live.country_iso2
      WHERE competition.year = ${year}
        AND live.event_id = ${eventId}
        AND live.${valueColumn} > 0
    ), country_bests AS (
      SELECT *
      FROM (
        SELECT
          *,
          ROW_NUMBER() OVER (
            PARTITION BY person_id, country_id
            ORDER BY result_value, competition_start_date, competition_id, result_id
          ) AS candidate_position
        FROM candidates
        WHERE result_value > 0
      ) ranked
      WHERE candidate_position = 1
    ), cohort_candidates AS (
      SELECT
        person_id, result_id, result_value, 'country' AS scope, country_id AS region_id
      FROM country_bests
      WHERE country_id <> ''
      UNION ALL
      SELECT
        person_id, result_id, result_value, 'continent', continent_id
      FROM (
        SELECT
          *,
          ROW_NUMBER() OVER (
            PARTITION BY person_id, continent_id
            ORDER BY result_value, competition_start_date, competition_id, result_id
          ) AS cohort_position
        FROM country_bests
        WHERE continent_id <> ''
      ) continent_bests
      WHERE cohort_position = 1
      UNION ALL
      SELECT person_id, result_id, result_value, 'world', ''
      FROM (
        SELECT
          *,
          ROW_NUMBER() OVER (
            PARTITION BY person_id
            ORDER BY result_value, competition_start_date, competition_id, result_id
          ) AS cohort_position
        FROM country_bests
      ) world_bests
      WHERE cohort_position = 1
    )
    SELECT
      ${year} AS year,
      ${eventId} AS event_id,
      cohort.cohort_id,
      candidate.person_id,
      candidate.result_id,
      candidate.result_value,
      1 AS is_provisional,
      RANK() OVER (
        PARTITION BY cohort.cohort_id
        ORDER BY candidate.result_value
      ) AS public_rank,
      ROW_NUMBER() OVER (
        PARTITION BY cohort.cohort_id
        ORDER BY candidate.result_value, candidate.person_id
      ) AS position
    FROM cohort_candidates candidate
    JOIN person_year_ranking_cohorts cohort
      ON cohort.scope = candidate.scope
      AND cohort.region_id = candidate.region_id
  `;
};

export const deleteYearlyRankingsQuery = ({
  eventId,
  resultType,
  year,
}: {
  eventId: string;
  resultType: YearlyResultType;
  year: number;
}) => SQL`
  DELETE FROM ${raw(tableFor(resultType))}
  WHERE year = ${year}
    AND event_id = ${eventId}
`;
