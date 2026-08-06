-- phase: count valid official solves once
DROP TEMPORARY TABLE IF EXISTS person_activity_attempt_counts;

CREATE TEMPORARY TABLE person_activity_attempt_counts ENGINE = InnoDB AS
SELECT
  result_id,
  COUNT(
    CASE
      WHEN value > 0 THEN 1
    END
  ) AS official_solve_count
FROM
  result_attempts
GROUP BY
  result_id;

ALTER TABLE person_activity_attempt_counts
ADD PRIMARY KEY (result_id);

-- phase: aggregate all person activity values from shared result facts
CREATE TABLE person_activity_counts AS
SELECT
  facts.person_id,
  CASE
    WHEN person.gender IN ('m', 'f') THEN person.gender
    ELSE 'o'
  END AS person_gender,
  COALESCE(person.country_id, '') AS country_id,
  COALESCE(person_country.continent_id, '') AS continent_id,
  COUNT(DISTINCT NULLIF(competition.country_id, '')) AS country_count,
  COUNT(*) AS round_count,
  COALESCE(SUM(attempts.official_solve_count), 0) AS official_solve_count
FROM
  result_facts facts
  INNER JOIN persons person ON person.wca_id = facts.person_id
  AND person.sub_id = 1
  LEFT JOIN countries person_country ON person_country.id = person.country_id
  LEFT JOIN competitions competition ON competition.id = facts.competition_id
  LEFT JOIN person_activity_attempt_counts attempts ON attempts.result_id = facts.result_id
GROUP BY
  facts.person_id,
  person_gender,
  country_id,
  continent_id;

DROP TEMPORARY TABLE person_activity_attempt_counts;

ALTER TABLE person_activity_counts
ADD PRIMARY KEY (person_id);

-- phase: rank the common World all-gender activity lists
CREATE TABLE person_activity_rankings AS
WITH
  metrics AS (
    SELECT
      person_id,
      'countries' AS metric,
      country_count AS metric_value
    FROM
      person_activity_counts
    UNION ALL
    SELECT
      person_id,
      'rounds' AS metric,
      round_count AS metric_value
    FROM
      person_activity_counts
    UNION ALL
    SELECT
      person_id,
      'solves' AS metric,
      official_solve_count AS metric_value
    FROM
      person_activity_counts
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
CREATE TABLE person_activity_ranking_counts AS
SELECT
  metric,
  scope,
  region_id,
  gender,
  COUNT(*) AS count
FROM
  person_activity_rankings
GROUP BY
  metric,
  scope,
  region_id,
  gender;

ALTER TABLE person_activity_ranking_counts
ADD PRIMARY KEY (metric, scope, region_id, gender);
