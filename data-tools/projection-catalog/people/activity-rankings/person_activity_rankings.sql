-- phase: rank all-time and current-year person statistics
CREATE TABLE person_activity_rankings AS
WITH
  metrics AS (
    SELECT
      period_year,
      person_id,
      person_gender,
      country_id,
      continent_id,
      'countries' AS metric,
      country_count AS metric_value
    FROM
      person_period_metrics
    WHERE
      period_year IN (0, YEAR(CURRENT_DATE))
    UNION ALL
    SELECT
      period_year,
      person_id,
      person_gender,
      country_id,
      continent_id,
      'rounds' AS metric,
      round_count AS metric_value
    FROM
      person_period_metrics
    WHERE
      period_year IN (0, YEAR(CURRENT_DATE))
    UNION ALL
    SELECT
      period_year,
      person_id,
      person_gender,
      country_id,
      continent_id,
      'solves' AS metric,
      official_solve_count AS metric_value
    FROM
      person_period_metrics
    WHERE
      period_year IN (0, YEAR(CURRENT_DATE))
  ),
  cohorts AS (
    SELECT
      period_year,
      person_id,
      metric,
      metric_value,
      'world' AS scope,
      CAST('' AS CHAR(16)) AS region_id,
      'all' AS gender
    FROM
      metrics
    UNION ALL
    SELECT
      period_year,
      person_id,
      metric,
      metric_value,
      'world',
      '',
      person_gender
    FROM
      metrics
    UNION ALL
    SELECT
      period_year,
      person_id,
      metric,
      metric_value,
      'continent',
      continent_id,
      'all'
    FROM
      metrics
    WHERE
      continent_id <> ''
    UNION ALL
    SELECT
      period_year,
      person_id,
      metric,
      metric_value,
      'continent',
      continent_id,
      person_gender
    FROM
      metrics
    WHERE
      continent_id <> ''
    UNION ALL
    SELECT
      period_year,
      person_id,
      metric,
      metric_value,
      'country',
      country_id,
      'all'
    FROM
      metrics
    WHERE
      country_id <> ''
    UNION ALL
    SELECT
      period_year,
      person_id,
      metric,
      metric_value,
      'country',
      country_id,
      person_gender
    FROM
      metrics
    WHERE
      country_id <> ''
  )
SELECT
  period_year,
  person_id,
  metric,
  scope,
  region_id,
  gender,
  0 AS is_provisional,
  metric_value,
  RANK() OVER (
    PARTITION BY
      period_year,
      metric,
      scope,
      region_id,
      gender
    ORDER BY
      metric_value DESC
  ) AS rank,
  ROW_NUMBER() OVER (
    PARTITION BY
      period_year,
      metric,
      scope,
      region_id,
      gender
    ORDER BY
      metric_value DESC,
      person_id
  ) AS position
FROM
  cohorts
WHERE
  metric_value > 0;

ALTER TABLE person_activity_rankings
ADD PRIMARY KEY (
  period_year,
  metric,
  scope,
  region_id,
  gender,
  person_id
),
ADD INDEX idx_person_activity_rankings_page (
  period_year,
  metric,
  scope,
  region_id,
  gender,
  position,
  person_id
);

-- phase: count common person-statistic leaderboard rows
