CREATE TABLE city_event_stats AS
WITH base AS (
  SELECT facts.*, comp.city_name, comp.country_id,
    CASE
      WHEN person.gender IN ('m', 'f') THEN person.gender
      ELSE 'o'
    END AS person_gender
  FROM result_facts facts
  INNER JOIN competitions comp ON comp.id = facts.competition_id
  LEFT JOIN persons person ON person.wca_id = facts.person_id AND person.sub_id = 1
  WHERE comp.city_name <> ''
), scoped AS (
  SELECT base.*, base.person_gender AS gender FROM base
  UNION ALL
  SELECT base.*, 'all' AS gender FROM base
), ordered AS (
  SELECT scoped.*,
    ROW_NUMBER() OVER (
      PARTITION BY city_name, country_id, event_id, gender
      ORDER BY best <= 0, best, competition_start_date, competition_id, result_id
    ) AS single_choice,
    ROW_NUMBER() OVER (
      PARTITION BY city_name, country_id, event_id, gender
      ORDER BY average <= 0, average, competition_start_date, competition_id, result_id
    ) AS average_choice
  FROM scoped
), aggregates AS (
  SELECT
    city_name,
    country_id,
    event_id,
    gender,
    MIN(CASE WHEN best > 0 THEN best END) AS fastest_single,
    MAX(CASE WHEN single_choice = 1 AND best > 0 THEN result_id END) AS fastest_single_result_id,
    MIN(CASE WHEN average > 0 THEN average END) AS fastest_average,
    MAX(CASE WHEN average_choice = 1 AND average > 0 THEN result_id END) AS fastest_average_result_id
  FROM ordered
  GROUP BY city_name, country_id, event_id, gender
), counts AS (
  SELECT scoped.city_name, scoped.country_id, scoped.event_id, scoped.gender,
    COUNT(DISTINCT scoped.person_id) AS competitor_count,
    COUNT(DISTINCT scoped.competition_id) AS competition_count,
    COUNT(CASE WHEN attempts.value > 0 THEN 1 END) AS official_solve_count
  FROM scoped
  LEFT JOIN result_attempts attempts ON attempts.result_id = scoped.result_id
  GROUP BY scoped.city_name, scoped.country_id, scoped.event_id, scoped.gender
)
SELECT aggregates.*,
  counts.competitor_count,
  counts.competition_count,
  counts.official_solve_count,
  CASE WHEN fastest_single IS NOT NULL THEN
    DENSE_RANK() OVER (
      PARTITION BY event_id, gender, fastest_single IS NULL ORDER BY fastest_single
    )
  END AS fastest_single_rank,
  CASE WHEN fastest_average IS NOT NULL THEN
    DENSE_RANK() OVER (
      PARTITION BY event_id, gender, fastest_average IS NULL ORDER BY fastest_average
    )
  END AS fastest_average_rank
FROM aggregates
INNER JOIN counts
  ON counts.city_name = aggregates.city_name
  AND counts.country_id = aggregates.country_id
  AND counts.event_id = aggregates.event_id
  AND counts.gender = aggregates.gender;

ALTER TABLE city_event_stats
  ADD PRIMARY KEY (city_name, country_id, event_id, gender),
  ADD INDEX idx_city_event_single (event_id, gender, fastest_single, country_id, city_name),
  ADD INDEX idx_city_event_average (event_id, gender, fastest_average, country_id, city_name),
  ADD INDEX idx_city_event_competitors (event_id, gender, competitor_count, country_id, city_name),
  ADD INDEX idx_city_event_competitions (event_id, gender, competition_count, country_id, city_name),
  ADD INDEX idx_city_event_solves (event_id, gender, official_solve_count, country_id, city_name);
