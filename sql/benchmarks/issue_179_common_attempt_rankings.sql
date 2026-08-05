-- Common-path comparison: only singleton-gender World and continent result
-- rankings are eagerly browsable. Country and year cohorts remain lazy.
-- Reuses benchmark_solve_facts from the complete Issue #179 build.
CREATE TABLE benchmark_issue_179_single_common AS
SELECT
  solve.*,
  RANK() OVER (
    PARTITION BY
      gender,
      event_id
    ORDER BY
      solve_value
  ) AS world_rank,
  ROW_NUMBER() OVER (
    PARTITION BY
      gender,
      event_id
    ORDER BY
      solve_value,
      competition_start_date,
      competition_id,
      result_id,
      attempt_number
  ) AS world_position,
  RANK() OVER (
    PARTITION BY
      gender,
      event_id,
      continent_id
    ORDER BY
      solve_value
  ) AS continent_rank,
  ROW_NUMBER() OVER (
    PARTITION BY
      gender,
      event_id,
      continent_id
    ORDER BY
      solve_value,
      competition_start_date,
      competition_id,
      result_id,
      attempt_number
  ) AS continent_position
FROM
  benchmark_solve_facts solve;

ALTER TABLE benchmark_issue_179_single_common
ADD PRIMARY KEY (result_id, attempt_number),
ADD INDEX idx_benchmark_issue179_common_world (gender, event_id, world_position),
ADD INDEX idx_benchmark_issue179_common_continent (
  gender,
  event_id,
  continent_id,
  continent_position
),
ADD INDEX idx_benchmark_issue179_common_search (
  gender,
  person_id,
  event_id,
  world_position,
  result_id,
  attempt_number
);
