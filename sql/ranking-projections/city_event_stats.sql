CREATE TABLE city_event_stats AS
WITH attempt_counts AS (
  SELECT result_id, COUNT(CASE WHEN value > 0 THEN 1 END) AS official_solve_count
  FROM result_attempts
  GROUP BY result_id
), base AS (
  SELECT facts.*, comp.city_name, comp.country_id,
    CASE WHEN person.gender IN ('m', 'f') THEN person.gender ELSE 'o' END AS person_gender,
    COALESCE(attempts.official_solve_count, 0) AS official_solve_count
  FROM result_facts facts
  INNER JOIN competitions comp ON comp.id = facts.competition_id
  LEFT JOIN persons person ON person.wca_id = facts.person_id AND person.sub_id = 1
  LEFT JOIN attempt_counts attempts ON attempts.result_id = facts.result_id
  WHERE comp.city_name <> ''
), scoped AS (
  SELECT base.*, base.person_gender AS gender FROM base
  UNION ALL
  SELECT base.*, 'all' AS gender FROM base
), aggregates AS (
  SELECT city_name, country_id, event_id, gender,
    MIN(CASE WHEN best > 0 THEN best END) AS fastest_single,
    MIN(CASE WHEN average > 0 THEN average END) AS fastest_average,
    COUNT(DISTINCT person_id) AS competitor_count,
    COUNT(DISTINCT competition_id) AS competition_count,
    SUM(official_solve_count) AS official_solve_count
  FROM scoped
  GROUP BY city_name, country_id, event_id, gender
), winner_candidates AS (
  SELECT scoped.city_name, scoped.country_id, scoped.event_id, scoped.gender, scoped.result_id,
    ROW_NUMBER() OVER (
      PARTITION BY scoped.city_name, scoped.country_id, scoped.event_id, scoped.gender
      ORDER BY scoped.competition_start_date, scoped.competition_id, scoped.result_id
    ) AS single_choice,
    0 AS average_choice
  FROM scoped
  INNER JOIN aggregates USING (city_name, country_id, event_id, gender)
  WHERE scoped.best = aggregates.fastest_single
  UNION ALL
  SELECT scoped.city_name, scoped.country_id, scoped.event_id, scoped.gender, scoped.result_id,
    0,
    ROW_NUMBER() OVER (
      PARTITION BY scoped.city_name, scoped.country_id, scoped.event_id, scoped.gender
      ORDER BY scoped.competition_start_date, scoped.competition_id, scoped.result_id
    )
  FROM scoped
  INNER JOIN aggregates USING (city_name, country_id, event_id, gender)
  WHERE scoped.average = aggregates.fastest_average
), winners AS (
  SELECT city_name, country_id, event_id, gender,
    MAX(CASE WHEN single_choice = 1 THEN result_id END) AS fastest_single_result_id,
    MAX(CASE WHEN average_choice = 1 THEN result_id END) AS fastest_average_result_id
  FROM winner_candidates
  GROUP BY city_name, country_id, event_id, gender
)
SELECT aggregates.city_name, aggregates.country_id, aggregates.event_id, aggregates.gender,
  aggregates.fastest_single, winners.fastest_single_result_id,
  aggregates.fastest_average, winners.fastest_average_result_id,
  aggregates.competitor_count, aggregates.competition_count, aggregates.official_solve_count,
  CASE WHEN fastest_single IS NOT NULL THEN
    DENSE_RANK() OVER (PARTITION BY event_id, gender ORDER BY fastest_single)
  END AS fastest_single_rank,
  CASE WHEN fastest_average IS NOT NULL THEN
    DENSE_RANK() OVER (PARTITION BY event_id, gender ORDER BY fastest_average)
  END AS fastest_average_rank
FROM aggregates
LEFT JOIN winners USING (city_name, country_id, event_id, gender);

ALTER TABLE city_event_stats
  ADD PRIMARY KEY (city_name, country_id, event_id, gender),
  ADD INDEX idx_city_event_single (event_id, gender, fastest_single, country_id, city_name),
  ADD INDEX idx_city_event_average (event_id, gender, fastest_average, country_id, city_name),
  ADD INDEX idx_city_event_competitors (event_id, gender, competitor_count, country_id, city_name),
  ADD INDEX idx_city_event_competitions (event_id, gender, competition_count, country_id, city_name),
  ADD INDEX idx_city_event_solves (event_id, gender, official_solve_count, country_id, city_name);
