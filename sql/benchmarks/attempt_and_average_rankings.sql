-- Benchmark-only tables. Run in an isolated database; these tables intentionally
-- materialize every positive attempt for single rankings and every positive
-- official average, with one normalized gender per row.
CREATE TABLE benchmark_attempt_rankings_single AS
WITH
  scoped AS (
    SELECT
      CASE
        WHEN person.gender IN ('m', 'f') THEN person.gender
        ELSE 'o'
      END AS gender,
      attempt.result_id,
      attempt.attempt_number,
      facts.event_id,
      facts.person_id,
      facts.competition_id,
      attempt.value AS result_value,
      facts.person_country_id AS country_id,
      facts.person_continent_id AS continent_id,
      facts.regional_single_record AS record_code
    FROM
      result_attempts attempt
      JOIN result_facts facts ON facts.result_id = attempt.result_id
      JOIN persons person ON person.wca_id = facts.person_id
      AND person.sub_id = 1
    WHERE
      attempt.value > 0
  )
SELECT
  scoped.*,
  RANK() OVER (
    PARTITION BY
      gender,
      event_id
    ORDER BY
      result_value
  ) AS world_rank,
  ROW_NUMBER() OVER (
    PARTITION BY
      gender,
      event_id
    ORDER BY
      result_value,
      result_id,
      attempt_number
  ) AS world_position,
  RANK() OVER (
    PARTITION BY
      gender,
      event_id,
      continent_id
    ORDER BY
      result_value
  ) AS continent_rank,
  ROW_NUMBER() OVER (
    PARTITION BY
      gender,
      event_id,
      continent_id
    ORDER BY
      result_value,
      result_id,
      attempt_number
  ) AS continent_position,
  RANK() OVER (
    PARTITION BY
      gender,
      event_id,
      country_id
    ORDER BY
      result_value
  ) AS country_rank,
  ROW_NUMBER() OVER (
    PARTITION BY
      gender,
      event_id,
      country_id
    ORDER BY
      result_value,
      result_id,
      attempt_number
  ) AS country_position
FROM
  scoped;

ALTER TABLE benchmark_attempt_rankings_single
ADD PRIMARY KEY (result_id, attempt_number),
ADD INDEX idx_benchmark_attempt_world (gender, event_id, world_position),
ADD INDEX idx_benchmark_attempt_continent (
  gender,
  event_id,
  continent_id,
  continent_position
),
ADD INDEX idx_benchmark_attempt_country (gender, event_id, country_id, country_position),
ADD INDEX idx_benchmark_attempt_person (
  gender,
  person_id,
  event_id,
  world_position,
  result_id,
  attempt_number
);

CREATE TABLE benchmark_result_rankings_average AS
WITH
  scoped AS (
    SELECT
      CASE
        WHEN person.gender IN ('m', 'f') THEN person.gender
        ELSE 'o'
      END AS gender,
      facts.result_id,
      facts.event_id,
      facts.person_id,
      facts.competition_id,
      facts.average AS result_value,
      facts.person_country_id AS country_id,
      facts.person_continent_id AS continent_id,
      facts.regional_average_record AS record_code
    FROM
      result_facts facts
      JOIN persons person ON person.wca_id = facts.person_id
      AND person.sub_id = 1
    WHERE
      facts.average > 0
  )
SELECT
  scoped.*,
  RANK() OVER (
    PARTITION BY
      gender,
      event_id
    ORDER BY
      result_value
  ) AS world_rank,
  ROW_NUMBER() OVER (
    PARTITION BY
      gender,
      event_id
    ORDER BY
      result_value,
      result_id
  ) AS world_position,
  RANK() OVER (
    PARTITION BY
      gender,
      event_id,
      continent_id
    ORDER BY
      result_value
  ) AS continent_rank,
  ROW_NUMBER() OVER (
    PARTITION BY
      gender,
      event_id,
      continent_id
    ORDER BY
      result_value,
      result_id
  ) AS continent_position,
  RANK() OVER (
    PARTITION BY
      gender,
      event_id,
      country_id
    ORDER BY
      result_value
  ) AS country_rank,
  ROW_NUMBER() OVER (
    PARTITION BY
      gender,
      event_id,
      country_id
    ORDER BY
      result_value,
      result_id
  ) AS country_position
FROM
  scoped;

ALTER TABLE benchmark_result_rankings_average
ADD PRIMARY KEY (result_id),
ADD INDEX idx_benchmark_average_world (gender, event_id, world_position),
ADD INDEX idx_benchmark_average_continent (
  gender,
  event_id,
  continent_id,
  continent_position
),
ADD INDEX idx_benchmark_average_country (gender, event_id, country_id, country_position),
ADD INDEX idx_benchmark_average_person (
  gender,
  person_id,
  event_id,
  world_position,
  result_id
);
