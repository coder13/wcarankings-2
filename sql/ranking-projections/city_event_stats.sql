CREATE TABLE city_event_stats AS
WITH ordered AS (
  SELECT facts.*, comp.city_name, comp.country_id,
    CASE
      WHEN person.gender IN ('m', 'f') THEN person.gender
      ELSE 'o'
    END AS gender,
    ROW_NUMBER() OVER (
      PARTITION BY comp.city_name, comp.country_id, event_id,
        CASE WHEN person.gender IN ('m', 'f') THEN person.gender ELSE 'o' END
      ORDER BY best <= 0, best, competition_start_date, competition_id, result_id
    ) AS single_choice,
    ROW_NUMBER() OVER (
      PARTITION BY comp.city_name, comp.country_id, event_id,
        CASE WHEN person.gender IN ('m', 'f') THEN person.gender ELSE 'o' END
      ORDER BY average <= 0, average, competition_start_date, competition_id, result_id
    ) AS average_choice
  FROM result_facts facts
  INNER JOIN competitions comp ON comp.id = facts.competition_id
  LEFT JOIN persons person ON person.wca_id = facts.person_id AND person.sub_id = 1
  WHERE comp.city_name <> ''
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
  GROUP BY city_name, country_id, event_id,
    CASE WHEN gender IN ('m', 'f') THEN gender ELSE 'o' END
)
SELECT aggregates.*,
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
FROM aggregates;

ALTER TABLE city_event_stats
  ADD PRIMARY KEY (city_name, country_id, event_id, gender),
  ADD INDEX idx_city_event_single (event_id, gender, fastest_single, country_id, city_name),
  ADD INDEX idx_city_event_average (event_id, gender, fastest_average, country_id, city_name);
