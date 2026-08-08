import SQL from "sql-template-tag";

type PersonEventBestsInput = { personId: string; year: number };

export const deletePersonEventBestsQuery = ({
  personId,
  year,
}: PersonEventBestsInput) => SQL`
  DELETE FROM person_event_bests
  WHERE person_id = ${personId}
    AND period_year IN (0, ${year})
`;

export const insertPersonEventBestsQuery = ({
  personId,
  year,
}: PersonEventBestsInput) => SQL`
  INSERT INTO person_event_bests (
    period_year, person_id, event_id, result_type, result_id, result_value,
    competition_start_date, competition_id, country_id, continent_id, gender
  )
  WITH facts AS (
    SELECT
      facts.competition_year,
      facts.person_id,
      facts.event_id,
      facts.result_id,
      facts.best,
      facts.average,
      facts.person_country_id AS country_id,
      facts.person_continent_id AS continent_id,
      CASE WHEN person.gender IN ('m', 'f') THEN person.gender ELSE 'o' END AS gender,
      facts.competition_start_date,
      facts.competition_id
    FROM result_facts facts
    LEFT JOIN persons person
      ON person.wca_id = facts.person_id
      AND person.sub_id = 1
    WHERE facts.person_id = ${personId}
    UNION ALL
    SELECT
      competition.year,
      live.person_id,
      live.event_id,
      -CAST(live.projection_result_id AS SIGNED),
      live.best,
      live.average,
      country.id,
      country.continent_id,
      CASE WHEN person.gender IN ('m', 'f') THEN person.gender ELSE 'o' END,
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
    INNER JOIN provisional_live_result_sources source
      ON source.source_name = live.source_name
      AND source.competition_id = live.competition_id
      AND source.enabled = 1
    INNER JOIN competitions competition ON competition.id = live.competition_id
    INNER JOIN countries country ON country.iso2 = live.country_iso2
    LEFT JOIN persons person
      ON person.wca_id = live.person_id
      AND person.sub_id = 1
    WHERE live.person_id = ${personId}
  ), candidates AS (
    SELECT
      0 AS period_year,
      person_id,
      event_id,
      'single' AS result_type,
      result_id,
      best AS result_value,
      competition_start_date,
      competition_id,
      country_id,
      continent_id,
      gender,
      ROW_NUMBER() OVER (
        PARTITION BY person_id, event_id, country_id
        ORDER BY best, competition_start_date, competition_id, result_id
      ) AS best_position
    FROM facts
    WHERE best > 0
    UNION ALL
    SELECT
      0,
      person_id,
      event_id,
      'average',
      result_id,
      average,
      competition_start_date,
      competition_id,
      country_id,
      continent_id,
      gender,
      ROW_NUMBER() OVER (
        PARTITION BY person_id, event_id, country_id
        ORDER BY average, competition_start_date, competition_id, result_id
      )
    FROM facts
    WHERE average > 0
    UNION ALL
    SELECT
      ${year},
      person_id,
      event_id,
      'single',
      result_id,
      best,
      competition_start_date,
      competition_id,
      country_id,
      continent_id,
      gender,
      ROW_NUMBER() OVER (
        PARTITION BY person_id, event_id, country_id
        ORDER BY best, competition_start_date, competition_id, result_id
      )
    FROM facts
    WHERE competition_year = ${year}
      AND best > 0
    UNION ALL
    SELECT
      ${year},
      person_id,
      event_id,
      'average',
      result_id,
      average,
      competition_start_date,
      competition_id,
      country_id,
      continent_id,
      gender,
      ROW_NUMBER() OVER (
        PARTITION BY person_id, event_id, country_id
        ORDER BY average, competition_start_date, competition_id, result_id
      )
    FROM facts
    WHERE competition_year = ${year}
      AND average > 0
  )
  SELECT
    period_year,
    person_id,
    event_id,
    result_type,
    result_id,
    result_value,
    competition_start_date,
    competition_id,
    country_id,
    continent_id,
    gender
  FROM candidates
  WHERE best_position = 1
`;
