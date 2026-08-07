-- phase: count official solves once
DROP TEMPORARY TABLE IF EXISTS person_period_attempt_counts;

CREATE TEMPORARY TABLE person_period_attempt_counts ENGINE = InnoDB AS
SELECT
  result_id,
  COUNT(CASE WHEN value > 0 THEN 1 END) AS official_solve_count
FROM result_attempts
GROUP BY result_id;

ALTER TABLE person_period_attempt_counts ADD PRIMARY KEY (result_id);

-- phase: build one all-time and one yearly row for each person
CREATE TABLE person_period_metrics AS
SELECT
  period_year,
  person_id,
  person_gender,
  country_id,
  continent_id,
  competition_count,
  country_count,
  round_count,
  official_solve_count
FROM (
  SELECT
    0 AS period_year,
    facts.person_id,
    CASE WHEN person.gender IN ('m', 'f') THEN person.gender ELSE 'o' END AS person_gender,
    COALESCE(person.country_id, '') AS country_id,
    COALESCE(person_country.continent_id, '') AS continent_id,
    COUNT(DISTINCT facts.competition_id) AS competition_count,
    COUNT(DISTINCT NULLIF(competition.country_id, '')) AS country_count,
    COUNT(*) AS round_count,
    COALESCE(SUM(attempts.official_solve_count), 0) AS official_solve_count
  FROM result_facts facts
  INNER JOIN persons person ON person.wca_id = facts.person_id AND person.sub_id = 1
  LEFT JOIN countries person_country ON person_country.id = person.country_id
  LEFT JOIN competitions competition ON competition.id = facts.competition_id
  LEFT JOIN person_period_attempt_counts attempts ON attempts.result_id = facts.result_id
  GROUP BY facts.person_id, person_gender, country_id, continent_id
  UNION ALL
  SELECT
    facts.competition_year AS period_year,
    facts.person_id,
    CASE WHEN person.gender IN ('m', 'f') THEN person.gender ELSE 'o' END AS person_gender,
    COALESCE(person.country_id, '') AS country_id,
    COALESCE(person_country.continent_id, '') AS continent_id,
    COUNT(DISTINCT facts.competition_id) AS competition_count,
    COUNT(DISTINCT NULLIF(competition.country_id, '')) AS country_count,
    COUNT(*) AS round_count,
    COALESCE(SUM(attempts.official_solve_count), 0) AS official_solve_count
  FROM result_facts facts
  INNER JOIN persons person ON person.wca_id = facts.person_id AND person.sub_id = 1
  LEFT JOIN countries person_country ON person_country.id = person.country_id
  LEFT JOIN competitions competition ON competition.id = facts.competition_id
  LEFT JOIN person_period_attempt_counts attempts ON attempts.result_id = facts.result_id
  GROUP BY facts.competition_year, facts.person_id, person_gender, country_id, continent_id
) metrics;

DROP TEMPORARY TABLE person_period_attempt_counts;

ALTER TABLE person_period_metrics
  MODIFY period_year SMALLINT UNSIGNED NOT NULL,
  ADD PRIMARY KEY (period_year, person_id),
  ADD INDEX idx_person_period_metrics_competitions (period_year, competition_count, person_id),
  ADD INDEX idx_person_period_metrics_gender (period_year, person_gender, competition_count, person_id),
  ADD INDEX idx_person_period_metrics_country (period_year, country_id, person_id),
  ADD INDEX idx_person_period_metrics_continent (period_year, continent_id, person_id);
