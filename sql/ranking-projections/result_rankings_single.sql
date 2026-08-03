CREATE TABLE result_rankings_single AS
SELECT
  solve.*,
  solve.solve_value AS result_value,
  RANK() OVER (PARTITION BY event_id ORDER BY solve_value) AS world_rank,
  ROW_NUMBER() OVER (
    PARTITION BY event_id
    ORDER BY solve_value, competition_start_date, competition_id, result_id, attempt_number
  ) AS world_position,
  RANK() OVER (PARTITION BY event_id, continent_id ORDER BY solve_value) AS continent_rank,
  ROW_NUMBER() OVER (
    PARTITION BY event_id, continent_id
    ORDER BY solve_value, competition_start_date, competition_id, result_id, attempt_number
  ) AS continent_position
FROM solve_facts solve;

ALTER TABLE result_rankings_single
  ADD PRIMARY KEY (result_id, attempt_number),
  ADD INDEX idx_results_single_world (event_id, world_position),
  ADD INDEX idx_results_single_continent (event_id, continent_id, continent_position),
  ADD INDEX idx_results_single_person (person_id, event_id, world_position, result_id, attempt_number);
