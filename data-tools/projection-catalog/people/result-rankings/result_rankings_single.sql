CREATE TABLE result_rankings_single AS
SELECT
  result.result_id,
  result.event_id,
  result.person_id,
  result.competition_id,
  result.best AS result_value,
  result.person_country_id AS country_id,
  result.person_continent_id AS continent_id,
  result.regional_single_record AS record_code,
  RANK() OVER (
    PARTITION BY result.event_id
    ORDER BY result.best
  ) AS world_rank,
  ROW_NUMBER() OVER (
    PARTITION BY result.event_id
    ORDER BY result.best, result.result_id
  ) AS world_position,
  RANK() OVER (
    PARTITION BY result.event_id, result.person_continent_id
    ORDER BY result.best
  ) AS continent_rank,
  ROW_NUMBER() OVER (
    PARTITION BY result.event_id, result.person_continent_id
    ORDER BY result.best, result.result_id
  ) AS continent_position,
  RANK() OVER (
    PARTITION BY result.event_id, result.person_country_id
    ORDER BY result.best
  ) AS country_rank,
  ROW_NUMBER() OVER (
    PARTITION BY result.event_id, result.person_country_id
    ORDER BY result.best, result.result_id
  ) AS country_position
FROM result_facts result
WHERE result.best > 0;

ALTER TABLE result_rankings_single
  ADD PRIMARY KEY (result_id),
  ADD INDEX idx_results_single_world (
    event_id, world_position
  ),
  ADD INDEX idx_results_single_continent (
    event_id, continent_id, continent_position
  ),
  ADD INDEX idx_results_single_country (
    event_id, country_id, country_position
  ),
  ADD INDEX idx_results_single_person (
    person_id, event_id, world_position, result_id
  );
