import SQL from "sql-template-tag";

export const deleteProvisionalPersonPeriodMetricsQuery = ({
  personId,
  year,
}: {
  personId: string;
  year: number;
}) => SQL`
  DELETE FROM person_period_metrics
  WHERE person_id = ${personId}
    AND period_year IN (0, ${year})
    AND is_provisional = 1
`;

export const insertProvisionalPersonPeriodMetricsQuery = ({
  personId,
  year,
}: {
  personId: string;
  year: number;
}) => SQL`
  INSERT INTO person_period_metrics (
    period_year,
    person_id,
    is_provisional,
    person_gender,
    country_id,
    continent_id,
    competition_count,
    country_count,
    round_count,
    official_solve_count
  )
  WITH facts AS (
    SELECT
      facts.competition_year,
      facts.competition_id,
      competition.country_id AS competition_country_id,
      COALESCE(attempts.official_solve_count, 0) AS official_solve_count
    FROM result_facts facts
    INNER JOIN competitions competition ON competition.id = facts.competition_id
    LEFT JOIN (
      SELECT result_id, COUNT(*) AS official_solve_count
      FROM result_attempts
      WHERE value > 0
      GROUP BY result_id
    ) attempts ON attempts.result_id = facts.result_id
    WHERE facts.person_id = ${personId}
      AND facts.result_id > 0
    UNION ALL
    SELECT
      competition.year AS competition_year,
      live.competition_id,
      competition.country_id AS competition_country_id,
      COALESCE((
        SELECT COUNT(*)
        FROM JSON_TABLE(
          live.attempts_json,
          '$[*]' COLUMNS (attempt_value INT PATH '$')
        ) attempts
        WHERE attempts.attempt_value > 0
      ), 0) AS official_solve_count
    FROM provisional_live_results live
    INNER JOIN provisional_live_result_sources source
      ON source.source_name = live.source_name
      AND source.competition_id = live.competition_id
      AND source.enabled = 1
    INNER JOIN competitions competition ON competition.id = live.competition_id
    WHERE live.person_id = ${personId}
  ), periods AS (
    SELECT 0 AS period_year
    UNION ALL
    SELECT ${year}
  )
  SELECT
    periods.period_year,
    ${personId},
    1 AS is_provisional,
    CASE WHEN person.gender IN ('m', 'f') THEN person.gender ELSE 'o' END,
    COALESCE(person.country_id, ''),
    COALESCE(person_country.continent_id, ''),
    COUNT(DISTINCT facts.competition_id),
    COUNT(DISTINCT NULLIF(facts.competition_country_id, '')),
    COUNT(facts.competition_id),
    COALESCE(SUM(facts.official_solve_count), 0)
  FROM periods
  INNER JOIN persons person ON person.wca_id = ${personId} AND person.sub_id = 1
  LEFT JOIN countries person_country ON person_country.id = person.country_id
  LEFT JOIN facts ON periods.period_year = 0
    OR facts.competition_year = periods.period_year
  GROUP BY
    periods.period_year,
    person.gender,
    person.country_id,
    person_country.continent_id
  HAVING COUNT(facts.competition_id) > 0
`;
