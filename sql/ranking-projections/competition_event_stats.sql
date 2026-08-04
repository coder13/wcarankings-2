CREATE TABLE competition_event_stats AS
WITH
  aggregates AS (
    SELECT
      result.competition_id,
      result.event_id,
      STR_TO_DATE(
        CONCAT(
          competition.year,
          '-',
          LPAD(competition.month, 2, '0'),
          '-',
          LPAD(competition.day, 2, '0')
        ),
        '%Y-%m-%d'
      ) AS start_date,
      MIN(
        CASE
          WHEN result.best > 0 THEN CAST(
            CONCAT(
              LPAD(result.best, 10, '0'),
              LPAD(result.id, 10, '0')
            ) AS DECIMAL(20, 0)
          )
        END
      ) AS fastest_single_key,
      MIN(
        CASE
          WHEN result.average > 0 THEN CAST(
            CONCAT(
              LPAD(result.average, 10, '0'),
              LPAD(result.id, 10, '0')
            ) AS DECIMAL(20, 0)
          )
        END
      ) AS fastest_average_key
    FROM
      results result
      INNER JOIN competitions competition ON competition.id = result.competition_id
    GROUP BY
      result.competition_id,
      result.event_id,
      competition.year,
      competition.month,
      competition.day
  ),
  podiums AS (
    SELECT
      competition_id,
      event_id,
      AVG (DISTINCT result_value) AS podium_score
    FROM
      competition_podium_members
    GROUP BY
      competition_id,
      event_id
    HAVING
      COUNT(DISTINCT person_id) >= 3
  ),
  values_by_competition AS (
    SELECT
      aggregate.competition_id,
      aggregate.event_id,
      aggregate.start_date,
      CASE
        WHEN fastest_single_key IS NOT NULL THEN FLOOR(fastest_single_key / 10000000000)
      END AS fastest_single,
      CASE
        WHEN fastest_single_key IS NOT NULL THEN MOD (fastest_single_key, 10000000000)
      END AS fastest_single_result_id,
      CASE
        WHEN fastest_average_key IS NOT NULL THEN FLOOR(fastest_average_key / 10000000000)
      END AS fastest_average,
      CASE
        WHEN fastest_average_key IS NOT NULL THEN MOD (fastest_average_key, 10000000000)
      END AS fastest_average_result_id,
      podiums.podium_score
    FROM
      aggregates aggregate
      LEFT JOIN podiums ON podiums.competition_id = aggregate.competition_id
      AND podiums.event_id = aggregate.event_id
  )
SELECT
  values_by_competition.*,
  CASE
    WHEN fastest_single IS NOT NULL THEN RANK() OVER (
      PARTITION BY
        event_id,
        fastest_single IS NULL
      ORDER BY
        fastest_single
    )
  END AS fastest_single_rank,
  CASE
    WHEN fastest_single IS NOT NULL THEN ROW_NUMBER() OVER (
      PARTITION BY
        event_id,
        fastest_single IS NULL
      ORDER BY
        fastest_single,
        start_date,
        competition_id
    )
  END AS fastest_single_position,
  CASE
    WHEN fastest_average IS NOT NULL THEN RANK() OVER (
      PARTITION BY
        event_id,
        fastest_average IS NULL
      ORDER BY
        fastest_average
    )
  END AS fastest_average_rank,
  CASE
    WHEN fastest_average IS NOT NULL THEN ROW_NUMBER() OVER (
      PARTITION BY
        event_id,
        fastest_average IS NULL
      ORDER BY
        fastest_average,
        start_date,
        competition_id
    )
  END AS fastest_average_position,
  CASE
    WHEN podium_score IS NOT NULL THEN RANK() OVER (
      PARTITION BY
        event_id,
        podium_score IS NULL
      ORDER BY
        podium_score
    )
  END AS podium_rank,
  CASE
    WHEN podium_score IS NOT NULL THEN ROW_NUMBER() OVER (
      PARTITION BY
        event_id,
        podium_score IS NULL
      ORDER BY
        podium_score,
        start_date,
        competition_id
    )
  END AS podium_position
FROM
  values_by_competition;

ALTER TABLE competition_event_stats
ADD PRIMARY KEY (competition_id, event_id),
ADD INDEX idx_competition_event_fastest_single (event_id, fastest_single_position),
ADD INDEX idx_competition_event_fastest_average (event_id, fastest_average_position),
ADD INDEX idx_competition_event_podium (event_id, podium_position);
