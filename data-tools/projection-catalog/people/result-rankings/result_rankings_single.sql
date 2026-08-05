CREATE TABLE result_rankings_single (
  result_id BIGINT NOT NULL,
  attempt_number TINYINT UNSIGNED NOT NULL,
  event_id VARCHAR(6) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  person_id VARCHAR(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  gender ENUM('m', 'f', 'o') NOT NULL,
  competition_id VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  competition_start_date DATE NOT NULL,
  country_id VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  continent_id VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  result_value INT UNSIGNED NOT NULL,
  record_code VARCHAR(3) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  world_rank INT UNSIGNED NOT NULL,
  world_position INT UNSIGNED NOT NULL,
  continent_rank INT UNSIGNED NOT NULL,
  continent_position INT UNSIGNED NOT NULL,
  country_rank INT UNSIGNED NOT NULL,
  country_position INT UNSIGNED NOT NULL
);

-- phase: materialize Single result rankings
INSERT INTO
  result_rankings_single
SELECT
  solve.result_id,
  solve.attempt_number,
  solve.event_id,
  solve.person_id,
  solve.gender,
  solve.competition_id,
  solve.competition_start_date,
  solve.country_id,
  solve.continent_id,
  solve.solve_value,
  solve.record_code,
  RANK() OVER (
    PARTITION BY
      event_id
    ORDER BY
      solve_value
  ) AS world_rank,
  ROW_NUMBER() OVER (
    PARTITION BY
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
      event_id,
      continent_id
    ORDER BY
      solve_value
  ) AS continent_rank,
  ROW_NUMBER() OVER (
    PARTITION BY
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
      event_id,
      country_id
    ORDER BY
      solve_value
  ) AS country_rank,
  ROW_NUMBER() OVER (
    PARTITION BY
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
  solve_facts_stage solve;

-- Build all proven persistent indexes together. Separate ALTER statements
-- caused MariaDB to rescan/rebuild this 29M-row table for every index.
-- phase: index Single result rankings
ALTER TABLE result_rankings_single
ADD PRIMARY KEY (result_id, attempt_number),
ADD INDEX idx_results_single_world (event_id, world_position),
ADD INDEX idx_results_single_continent (event_id, continent_id, continent_position),
ADD INDEX idx_results_single_country (event_id, country_id, country_position),
ADD INDEX idx_results_single_person (
  person_id,
  event_id,
  world_position,
  result_id,
  attempt_number
),
-- This is the only former solve_facts secondary index selected by the
-- measured gender-only and gender/country lazy fallback plans.
ADD INDEX idx_results_single_lazy_gender (
  gender,
  event_id,
  country_id,
  competition_start_date,
  result_value,
  competition_id,
  result_id,
  attempt_number
);
