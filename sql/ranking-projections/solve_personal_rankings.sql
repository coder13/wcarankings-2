CREATE TABLE solve_personal_rankings AS
SELECT
  solve.result_id,
  solve.attempt_number,
  solve.person_id,
  solve.event_id,
  RANK() OVER (PARTITION BY solve.person_id, solve.event_id ORDER BY solve.solve_value) AS personal_rank,
  ROW_NUMBER() OVER (
    PARTITION BY solve.person_id, solve.event_id
    ORDER BY solve.solve_value, solve.competition_start_date, solve.competition_id, solve.result_id, solve.attempt_number
  ) AS personal_position
FROM solve_facts solve;

ALTER TABLE solve_personal_rankings
  ADD PRIMARY KEY (result_id, attempt_number),
  ADD INDEX idx_solve_personal_rankings (person_id, event_id, personal_position);
