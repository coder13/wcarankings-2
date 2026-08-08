CREATE TABLE result_rankings_single (
  period_year SMALLINT UNSIGNED NOT NULL,
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
  country_position INT UNSIGNED NOT NULL,
  gender_world_rank INT UNSIGNED NOT NULL DEFAULT 0,
  gender_world_position INT UNSIGNED NOT NULL DEFAULT 0,
  gender_continent_rank INT UNSIGNED NOT NULL DEFAULT 0,
  gender_continent_position INT UNSIGNED NOT NULL DEFAULT 0,
  gender_country_rank INT UNSIGNED NOT NULL DEFAULT 0,
  gender_country_position INT UNSIGNED NOT NULL DEFAULT 0,
  is_provisional TINYINT(1) NOT NULL DEFAULT 0
);

-- phase: materialize Single result rankings
INSERT INTO
  result_rankings_single (
    period_year,
    result_id,
    attempt_number,
    event_id,
    person_id,
    gender,
    competition_id,
    competition_start_date,
    country_id,
    continent_id,
    result_value,
    record_code,
    world_rank,
    world_position,
    continent_rank,
    continent_position,
    country_rank,
    country_position,
    gender_world_rank,
    gender_world_position,
    gender_continent_rank,
    gender_continent_position,
    gender_country_rank,
    gender_country_position,
    is_provisional
  )
SELECT
  0 AS period_year,
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
  ) AS country_position,
  RANK() OVER (
    PARTITION BY
      event_id,
      gender
    ORDER BY
      solve_value
  ) AS gender_world_rank,
  ROW_NUMBER() OVER (
    PARTITION BY
      event_id,
      gender
    ORDER BY
      solve_value,
      competition_start_date,
      competition_id,
      result_id,
      attempt_number
  ) AS gender_world_position,
  RANK() OVER (
    PARTITION BY
      event_id,
      continent_id,
      gender
    ORDER BY
      solve_value
  ) AS gender_continent_rank,
  ROW_NUMBER() OVER (
    PARTITION BY
      event_id,
      continent_id,
      gender
    ORDER BY
      solve_value,
      competition_start_date,
      competition_id,
      result_id,
      attempt_number
  ) AS gender_continent_position,
  RANK() OVER (
    PARTITION BY
      event_id,
      country_id,
      gender
    ORDER BY
      solve_value
  ) AS gender_country_rank,
  ROW_NUMBER() OVER (
    PARTITION BY
      event_id,
      country_id,
      gender
    ORDER BY
      solve_value,
      competition_start_date,
      competition_id,
      result_id,
      attempt_number
  ) AS gender_country_position,
  0 AS is_provisional
FROM
  solve_facts_stage solve;

-- phase: materialize current-year Single result rankings
INSERT INTO
  result_rankings_single (
    period_year,
    result_id,
    attempt_number,
    event_id,
    person_id,
    gender,
    competition_id,
    competition_start_date,
    country_id,
    continent_id,
    result_value,
    record_code,
    world_rank,
    world_position,
    continent_rank,
    continent_position,
    country_rank,
    country_position,
    gender_world_rank,
    gender_world_position,
    gender_continent_rank,
    gender_continent_position,
    gender_country_rank,
    gender_country_position,
    is_provisional
  )
SELECT
  YEAR(CURDATE()) AS period_year,
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
      solve.event_id
    ORDER BY
      solve.solve_value
  ),
  ROW_NUMBER() OVER (
    PARTITION BY
      solve.event_id
    ORDER BY
      solve.solve_value,
      solve.competition_start_date,
      solve.competition_id,
      solve.result_id,
      solve.attempt_number
  ),
  RANK() OVER (
    PARTITION BY
      solve.event_id,
      solve.continent_id
    ORDER BY
      solve.solve_value
  ),
  ROW_NUMBER() OVER (
    PARTITION BY
      solve.event_id,
      solve.continent_id
    ORDER BY
      solve.solve_value,
      solve.competition_start_date,
      solve.competition_id,
      solve.result_id,
      solve.attempt_number
  ),
  RANK() OVER (
    PARTITION BY
      solve.event_id,
      solve.country_id
    ORDER BY
      solve.solve_value
  ),
  ROW_NUMBER() OVER (
    PARTITION BY
      solve.event_id,
      solve.country_id
    ORDER BY
      solve.solve_value,
      solve.competition_start_date,
      solve.competition_id,
      solve.result_id,
      solve.attempt_number
  ),
  RANK() OVER (
    PARTITION BY
      solve.event_id,
      solve.gender
    ORDER BY
      solve.solve_value
  ),
  ROW_NUMBER() OVER (
    PARTITION BY
      solve.event_id,
      solve.gender
    ORDER BY
      solve.solve_value,
      solve.competition_start_date,
      solve.competition_id,
      solve.result_id,
      solve.attempt_number
  ),
  RANK() OVER (
    PARTITION BY
      solve.event_id,
      solve.continent_id,
      solve.gender
    ORDER BY
      solve.solve_value
  ),
  ROW_NUMBER() OVER (
    PARTITION BY
      solve.event_id,
      solve.continent_id,
      solve.gender
    ORDER BY
      solve.solve_value,
      solve.competition_start_date,
      solve.competition_id,
      solve.result_id,
      solve.attempt_number
  ),
  RANK() OVER (
    PARTITION BY
      solve.event_id,
      solve.country_id,
      solve.gender
    ORDER BY
      solve.solve_value
  ),
  ROW_NUMBER() OVER (
    PARTITION BY
      solve.event_id,
      solve.country_id,
      solve.gender
    ORDER BY
      solve.solve_value,
      solve.competition_start_date,
      solve.competition_id,
      solve.result_id,
      solve.attempt_number
  ),
  0
FROM
  solve_facts_stage solve
WHERE
  YEAR(solve.competition_start_date) = YEAR(CURDATE());

-- Build all proven persistent indexes together. Separate ALTER statements
-- caused MariaDB to rescan/rebuild this 29M-row table for every index.
-- phase: index Single result rankings
ALTER TABLE result_rankings_single
ADD PRIMARY KEY (period_year, result_id, attempt_number),
ADD INDEX idx_results_single_world (period_year, event_id, world_position),
ADD INDEX idx_results_single_continent (
  period_year,
  event_id,
  continent_id,
  continent_position
),
ADD INDEX idx_results_single_country (
  period_year,
  event_id,
  country_id,
  country_position
),
ADD INDEX idx_results_single_gender_world (
  period_year,
  gender,
  event_id,
  gender_world_position
),
ADD INDEX idx_results_single_gender_continent (
  period_year,
  gender,
  event_id,
  continent_id,
  gender_continent_position
),
ADD INDEX idx_results_single_gender_country (
  period_year,
  gender,
  event_id,
  country_id,
  gender_country_position
),
ADD INDEX idx_results_single_person (
  period_year,
  person_id,
  event_id,
  world_position,
  result_id,
  attempt_number
),
ADD INDEX idx_result_rankings_single_live_order (
  period_year,
  event_id,
  result_value,
  competition_start_date,
  competition_id,
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
