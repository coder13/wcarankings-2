CREATE TABLE weekly_rank_deltas_average AS
WITH
  result_weeks AS (
    SELECT
      r.id AS result_id,
      r.person_id,
      r.event_id,
      r.average AS result_value,
      DATE_SUB(
        STR_TO_DATE(
          CONCAT(
            comp.year,
            '-',
            LPAD(comp.month, 2, '0'),
            '-',
            LPAD(comp.day, 2, '0')
          ),
          '%Y-%m-%d'
        ),
        INTERVAL MOD (
          DAYOFWEEK(
            STR_TO_DATE(
              CONCAT(
                comp.year,
                '-',
                LPAD(comp.month, 2, '0'),
                '-',
                LPAD(comp.day, 2, '0')
              ),
              '%Y-%m-%d'
            )
          ) + 2,
          7
        ) DAY
      ) AS week_start,
      COALESCE(person.country_id, '') AS country_id,
      COALESCE(country.continent_id, '') AS continent_id,
      ROW_NUMBER() OVER (
        PARTITION BY
          r.person_id,
          r.event_id,
          DATE_SUB(
            STR_TO_DATE(
              CONCAT(
                comp.year,
                '-',
                LPAD(comp.month, 2, '0'),
                '-',
                LPAD(comp.day, 2, '0')
              ),
              '%Y-%m-%d'
            ),
            INTERVAL MOD (
              DAYOFWEEK(
                STR_TO_DATE(
                  CONCAT(
                    comp.year,
                    '-',
                    LPAD(comp.month, 2, '0'),
                    '-',
                    LPAD(comp.day, 2, '0')
                  ),
                  '%Y-%m-%d'
                )
              ) + 2,
              7
            ) DAY
          )
        ORDER BY
          r.average,
          r.id
      ) AS weekly_position
    FROM
      results r
      INNER JOIN competitions comp ON comp.id = r.competition_id
      LEFT JOIN persons person ON person.wca_id = r.person_id
      AND person.sub_id = 1
      LEFT JOIN countries country ON country.id = person.country_id
    WHERE
      r.average > 0
  ),
  weekly_bests AS (
    SELECT
      result_id,
      person_id,
      event_id,
      result_value,
      week_start,
      country_id,
      continent_id
    FROM
      result_weeks
    WHERE
      weekly_position = 1
  ),
  latest_week AS (
    SELECT
      MAX(week_start) AS week_start
    FROM
      weekly_bests
  ),
  current_candidates AS (
    SELECT
      weekly_bests.*,
      ROW_NUMBER() OVER (
        PARTITION BY
          person_id,
          event_id
        ORDER BY
          result_value,
          week_start,
          result_id
      ) AS current_position
    FROM
      weekly_bests
  ),
  current_bests AS (
    SELECT
      current_candidates.*,
      RANK() OVER (
        PARTITION BY
          event_id
        ORDER BY
          result_value
      ) AS world_rank,
      RANK() OVER (
        PARTITION BY
          event_id,
          continent_id
        ORDER BY
          result_value
      ) AS continent_rank,
      RANK() OVER (
        PARTITION BY
          event_id,
          country_id
        ORDER BY
          result_value
      ) AS country_rank
    FROM
      current_candidates
    WHERE
      current_position = 1
  ),
  prior_candidates AS (
    SELECT
      weekly_bests.*,
      ROW_NUMBER() OVER (
        PARTITION BY
          person_id,
          event_id
        ORDER BY
          result_value,
          week_start,
          result_id
      ) AS prior_position
    FROM
      weekly_bests
      CROSS JOIN latest_week
    WHERE
      weekly_bests.week_start < latest_week.week_start
  ),
  prior_bests AS (
    SELECT
      prior_candidates.*,
      RANK() OVER (
        PARTITION BY
          event_id
        ORDER BY
          result_value
      ) AS world_rank,
      RANK() OVER (
        PARTITION BY
          event_id,
          continent_id
        ORDER BY
          result_value
      ) AS continent_rank,
      RANK() OVER (
        PARTITION BY
          event_id,
          country_id
        ORDER BY
          result_value
      ) AS country_rank
    FROM
      prior_candidates
    WHERE
      prior_position = 1
  )
SELECT
  current_bests.person_id,
  current_bests.event_id,
  CASE
    WHEN prior_bests.person_id IS NULL THEN NULL
    WHEN prior_bests.world_rank - current_bests.world_rank = 0 THEN NULL
    ELSE prior_bests.world_rank - current_bests.world_rank
  END AS world_rank_delta,
  CASE
    WHEN prior_bests.person_id IS NULL THEN 'new'
    WHEN prior_bests.world_rank - current_bests.world_rank <> 0 THEN 'changed'
    ELSE NULL
  END AS world_rank_delta_state,
  CASE
    WHEN prior_bests.person_id IS NULL THEN NULL
    WHEN prior_bests.continent_rank - current_bests.continent_rank = 0 THEN NULL
    ELSE prior_bests.continent_rank - current_bests.continent_rank
  END AS continent_rank_delta,
  CASE
    WHEN prior_bests.person_id IS NULL THEN 'new'
    WHEN prior_bests.continent_rank - current_bests.continent_rank <> 0 THEN 'changed'
    ELSE NULL
  END AS continent_rank_delta_state,
  CASE
    WHEN prior_bests.person_id IS NULL THEN NULL
    WHEN prior_bests.country_rank - current_bests.country_rank = 0 THEN NULL
    ELSE prior_bests.country_rank - current_bests.country_rank
  END AS country_rank_delta,
  CASE
    WHEN prior_bests.person_id IS NULL THEN 'new'
    WHEN prior_bests.country_rank - current_bests.country_rank <> 0 THEN 'changed'
    ELSE NULL
  END AS country_rank_delta_state
FROM
  current_bests
  LEFT JOIN prior_bests ON prior_bests.person_id = current_bests.person_id
  AND prior_bests.event_id = current_bests.event_id;

ALTER TABLE weekly_rank_deltas_average
ADD PRIMARY KEY (event_id, person_id);
