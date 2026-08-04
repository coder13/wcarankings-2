-- Issue #179 staged comparison. This reuses benchmark_solve_facts from the
-- one-pass build and keeps personal history in a compact companion table.
-- It tests whether separating the independent personal window improves build
-- time enough to justify the additional artifact and lookup.
CREATE TABLE benchmark_issue_179_single_regional AS
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
  ) AS continent_position,
  RANK() OVER (
    PARTITION BY
      gender,
      event_id,
      country_id
    ORDER BY
      solve_value
  ) AS country_rank,
  ROW_NUMBER() OVER (
    PARTITION BY
      gender,
      event_id,
      country_id
    ORDER BY
      solve_value,
      competition_start_date,
      competition_id,
      result_id,
      attempt_number
  ) AS country_position
FROM
  benchmark_solve_facts solve;

ALTER TABLE benchmark_issue_179_single_regional
ADD PRIMARY KEY (result_id, attempt_number),
ADD INDEX idx_benchmark_issue179_staged_world (gender, event_id, world_position),
ADD INDEX idx_benchmark_issue179_staged_continent (
  gender,
  event_id,
  continent_id,
  continent_position
),
ADD INDEX idx_benchmark_issue179_staged_country (gender, event_id, country_id, country_position),
ADD INDEX idx_benchmark_issue179_staged_search (
  gender,
  person_id,
  event_id,
  world_position,
  result_id,
  attempt_number
);

CREATE TABLE benchmark_issue_179_single_personal AS
SELECT
  solve.result_id,
  solve.attempt_number,
  solve.person_id,
  solve.event_id,
  RANK() OVER (
    PARTITION BY
      solve.person_id,
      solve.event_id
    ORDER BY
      solve.solve_value
  ) AS personal_rank,
  ROW_NUMBER() OVER (
    PARTITION BY
      solve.person_id,
      solve.event_id
    ORDER BY
      solve.solve_value,
      solve.competition_start_date,
      solve.competition_id,
      solve.result_id,
      solve.attempt_number
  ) AS personal_position
FROM
  benchmark_solve_facts solve;

ALTER TABLE benchmark_issue_179_single_personal
ADD PRIMARY KEY (result_id, attempt_number),
ADD INDEX idx_benchmark_issue179_staged_person (person_id, event_id, personal_position);
