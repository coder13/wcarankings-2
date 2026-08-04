CREATE TABLE result_gender_rankings_average AS
WITH gender_sets AS (
  SELECT 'm' AS gender_set
  UNION ALL SELECT 'f'
  UNION ALL SELECT 'o'
  UNION ALL SELECT 'm,f'
  UNION ALL SELECT 'm,o'
  UNION ALL SELECT 'f,o'
), scoped AS (
  SELECT
    gender_sets.gender_set,
    result.result_id,
    result.event_id,
    result.person_id,
    result.competition_id,
    result.average AS result_value,
    result.person_country_id AS country_id,
    result.person_continent_id AS continent_id,
    result.regional_average_record AS record_code
  FROM result_facts result
  JOIN persons person ON person.wca_id = result.person_id AND person.sub_id = 1
  JOIN gender_sets ON FIND_IN_SET(CASE WHEN person.gender IN ('m', 'f') THEN person.gender ELSE 'o' END, gender_sets.gender_set)
  WHERE result.average > 0
)
SELECT
  scoped.*,
  RANK() OVER (PARTITION BY gender_set, event_id ORDER BY result_value) AS world_rank,
  ROW_NUMBER() OVER (PARTITION BY gender_set, event_id ORDER BY result_value, result_id) AS world_position,
  RANK() OVER (PARTITION BY gender_set, event_id, continent_id ORDER BY result_value) AS continent_rank,
  ROW_NUMBER() OVER (PARTITION BY gender_set, event_id, continent_id ORDER BY result_value, result_id) AS continent_position,
  RANK() OVER (PARTITION BY gender_set, event_id, country_id ORDER BY result_value) AS country_rank,
  ROW_NUMBER() OVER (PARTITION BY gender_set, event_id, country_id ORDER BY result_value, result_id) AS country_position
FROM scoped;

ALTER TABLE result_gender_rankings_average
  ADD PRIMARY KEY (gender_set, result_id),
  ADD INDEX idx_gender_results_average_world (gender_set, event_id, world_position),
  ADD INDEX idx_gender_results_average_continent (gender_set, event_id, continent_id, continent_position),
  ADD INDEX idx_gender_results_average_country (gender_set, event_id, country_id, country_position),
  ADD INDEX idx_gender_results_average_person (gender_set, person_id, event_id, world_position, result_id);
