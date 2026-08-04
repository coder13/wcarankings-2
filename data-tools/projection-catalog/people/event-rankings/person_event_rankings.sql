CREATE TABLE person_event_rankings AS
WITH candidates AS (
  SELECT result_id, event_id, person_id, person_country_id AS country_id,
    person_continent_id AS continent_id, 'single' AS result_type, best AS result_value,
    ROW_NUMBER() OVER (
      PARTITION BY person_id, event_id
      ORDER BY best, competition_start_date, competition_id, result_id
    ) AS personal_position
  FROM result_facts
  WHERE best > 0
  UNION ALL
  SELECT result_id, event_id, person_id, person_country_id,
    person_continent_id, 'average', average,
    ROW_NUMBER() OVER (
      PARTITION BY person_id, event_id
      ORDER BY average, competition_start_date, competition_id, result_id
    )
  FROM result_facts
  WHERE average > 0
), bests AS (
  SELECT * FROM candidates WHERE personal_position = 1
)
SELECT
  person_id, event_id, result_type, result_id, result_value, country_id, continent_id,
  DENSE_RANK() OVER (PARTITION BY event_id, result_type ORDER BY result_value) AS world_rank,
  ROW_NUMBER() OVER (
    PARTITION BY event_id, result_type
    ORDER BY result_value, person_id
  ) AS world_position,
  DENSE_RANK() OVER (
    PARTITION BY event_id, result_type, continent_id ORDER BY result_value
  ) AS continent_rank,
  ROW_NUMBER() OVER (
    PARTITION BY event_id, result_type, continent_id
    ORDER BY result_value, person_id
  ) AS continent_position,
  DENSE_RANK() OVER (
    PARTITION BY event_id, result_type, country_id ORDER BY result_value
  ) AS country_rank,
  ROW_NUMBER() OVER (
    PARTITION BY event_id, result_type, country_id
    ORDER BY result_value, person_id
  ) AS country_position,
  CAST(NULL AS SIGNED) AS previous_world_rank,
  CAST(NULL AS SIGNED) AS previous_continent_rank,
  CAST(NULL AS SIGNED) AS previous_country_rank,
  CAST(NULL AS SIGNED) AS world_rank_delta,
  CAST(NULL AS SIGNED) AS continent_rank_delta,
  CAST(NULL AS SIGNED) AS country_rank_delta,
  'unavailable' AS rank_delta_state
FROM bests;

ALTER TABLE person_event_rankings
  ADD PRIMARY KEY (person_id, event_id, result_type),
  ADD INDEX idx_person_event_world (event_id, result_type, world_position, person_id),
  ADD INDEX idx_person_event_continent (event_id, result_type, continent_id, continent_position, person_id),
  ADD INDEX idx_person_event_country (event_id, result_type, country_id, country_position, person_id);
