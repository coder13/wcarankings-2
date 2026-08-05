-- Issue #179 benchmark: materialize one row per valid official solve, then
-- rank each solve both within its gender/region cohort and within the
-- competitor's own event history. Run only against an isolated benchmark DB.
CREATE TABLE benchmark_solve_facts AS
SELECT
  attempt.result_id,
  attempt.attempt_number,
  facts.event_id,
  facts.person_id,
  CASE
    WHEN person.gender IN ('m', 'f') THEN person.gender
    ELSE 'o'
  END AS gender,
  facts.competition_id,
  facts.competition_start_date,
  facts.round_type_id,
  facts.person_country_id AS country_id,
  facts.person_continent_id AS continent_id,
  attempt.value AS solve_value,
  facts.regional_single_record AS record_code
FROM
  result_attempts attempt
  JOIN result_facts facts ON facts.result_id = attempt.result_id
  JOIN persons person ON person.wca_id = facts.person_id
  AND person.sub_id = 1
WHERE
  attempt.value > 0;

ALTER TABLE benchmark_solve_facts
ADD PRIMARY KEY (result_id, attempt_number),
ADD INDEX idx_benchmark_solve_global (
  gender,
  event_id,
  solve_value,
  result_id,
  attempt_number
),
ADD INDEX idx_benchmark_solve_person (
  person_id,
  event_id,
  solve_value,
  result_id,
  attempt_number
);

CREATE TABLE benchmark_issue_179_single_rankings AS
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
  ) AS country_position,
  RANK() OVER (
    PARTITION BY
      person_id,
      event_id
    ORDER BY
      solve_value
  ) AS personal_rank,
  ROW_NUMBER() OVER (
    PARTITION BY
      person_id,
      event_id
    ORDER BY
      solve_value,
      competition_start_date,
      competition_id,
      result_id,
      attempt_number
  ) AS personal_position
FROM
  benchmark_solve_facts solve;

ALTER TABLE benchmark_issue_179_single_rankings
ADD PRIMARY KEY (result_id, attempt_number),
ADD INDEX idx_benchmark_issue179_world (gender, event_id, world_position),
ADD INDEX idx_benchmark_issue179_continent (
  gender,
  event_id,
  continent_id,
  continent_position
),
ADD INDEX idx_benchmark_issue179_country (gender, event_id, country_id, country_position),
ADD INDEX idx_benchmark_issue179_person (person_id, event_id, personal_position);
