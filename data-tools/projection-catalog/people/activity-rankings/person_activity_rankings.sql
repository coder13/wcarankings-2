-- phase: rank the common World all-gender activity lists
CREATE TABLE person_activity_rankings AS
WITH
  metrics AS (
    SELECT
      person_id,
      'countries' AS metric,
      country_count AS metric_value
    FROM person_period_metrics
    WHERE period_year = 0
    UNION ALL
    SELECT
      person_id,
      'rounds' AS metric,
      round_count AS metric_value
    FROM person_period_metrics
    WHERE period_year = 0
    UNION ALL
    SELECT
      person_id,
      'solves' AS metric,
      official_solve_count AS metric_value
    FROM person_period_metrics
    WHERE period_year = 0
  )
SELECT
  person_id,
  metric,
  'world' AS scope,
  CAST('' AS CHAR(16)) AS region_id,
  'all' AS gender,
  metric_value,
  RANK() OVER (
    PARTITION BY
      metric
    ORDER BY
      metric_value DESC
  ) AS rank,
  ROW_NUMBER() OVER (
    PARTITION BY
      metric
    ORDER BY
      metric_value DESC,
      person_id
  ) AS position
FROM
  metrics
WHERE
  metric_value > 0;

ALTER TABLE person_activity_rankings
ADD PRIMARY KEY (metric, scope, region_id, gender, person_id),
ADD INDEX idx_person_activity_rankings_page (
  metric,
  scope,
  region_id,
  gender,
  position,
  person_id
);

-- phase: count common activity leaderboard rows
