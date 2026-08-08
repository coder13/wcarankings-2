CREATE TABLE result_rankings_average (
  period_year SMALLINT UNSIGNED NOT NULL,
  result_id BIGINT NOT NULL,
  attempt_number TINYINT UNSIGNED,
  event_id VARCHAR(6) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  person_id VARCHAR(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  gender ENUM('m', 'f', 'o') NOT NULL,
  competition_id VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  result_value INT UNSIGNED NOT NULL,
  country_id VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  continent_id VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
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

-- phase: materialize Average result rankings
INSERT INTO
  result_rankings_average (
    period_year,
    result_id,
    attempt_number,
    event_id,
    person_id,
    gender,
    competition_id,
    result_value,
    country_id,
    continent_id,
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
  result.result_id,
  NULL,
  result.event_id,
  result.person_id,
  result.gender,
  result.competition_id,
  result.average,
  result.person_country_id,
  result.person_continent_id,
  result.regional_average_record,
  RANK() OVER (
    PARTITION BY
      result.event_id
    ORDER BY
      result.average
  ) AS world_rank,
  ROW_NUMBER() OVER (
    PARTITION BY
      result.event_id
    ORDER BY
      result.average,
      result.result_id
  ) AS world_position,
  RANK() OVER (
    PARTITION BY
      result.event_id,
      result.person_continent_id
    ORDER BY
      result.average
  ) AS continent_rank,
  ROW_NUMBER() OVER (
    PARTITION BY
      result.event_id,
      result.person_continent_id
    ORDER BY
      result.average,
      result.result_id
  ) AS continent_position,
  RANK() OVER (
    PARTITION BY
      result.event_id,
      result.person_country_id
    ORDER BY
      result.average
  ) AS country_rank,
  ROW_NUMBER() OVER (
    PARTITION BY
      result.event_id,
      result.person_country_id
    ORDER BY
      result.average,
      result.result_id
  ) AS country_position,
  RANK() OVER (
    PARTITION BY
      result.event_id,
      result.gender
    ORDER BY
      result.average
  ) AS gender_world_rank,
  ROW_NUMBER() OVER (
    PARTITION BY
      result.event_id,
      result.gender
    ORDER BY
      result.average,
      result.result_id
  ) AS gender_world_position,
  RANK() OVER (
    PARTITION BY
      result.event_id,
      result.person_continent_id,
      result.gender
    ORDER BY
      result.average
  ) AS gender_continent_rank,
  ROW_NUMBER() OVER (
    PARTITION BY
      result.event_id,
      result.person_continent_id,
      result.gender
    ORDER BY
      result.average,
      result.result_id
  ) AS gender_continent_position,
  RANK() OVER (
    PARTITION BY
      result.event_id,
      result.person_country_id,
      result.gender
    ORDER BY
      result.average
  ) AS gender_country_rank,
  ROW_NUMBER() OVER (
    PARTITION BY
      result.event_id,
      result.person_country_id,
      result.gender
    ORDER BY
      result.average,
      result.result_id
  ) AS gender_country_position,
  0 AS is_provisional
FROM
  result_facts result
WHERE
  result.average > 0;

-- phase: materialize current-year Average result rankings
INSERT INTO
  result_rankings_average (
    period_year,
    result_id,
    attempt_number,
    event_id,
    person_id,
    gender,
    competition_id,
    result_value,
    country_id,
    continent_id,
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
  result.result_id,
  NULL,
  result.event_id,
  result.person_id,
  result.gender,
  result.competition_id,
  result.average,
  result.person_country_id,
  result.person_continent_id,
  result.regional_average_record,
  RANK() OVER (
    PARTITION BY
      result.event_id
    ORDER BY
      result.average
  ),
  ROW_NUMBER() OVER (
    PARTITION BY
      result.event_id
    ORDER BY
      result.average,
      result.result_id
  ),
  RANK() OVER (
    PARTITION BY
      result.event_id,
      result.person_continent_id
    ORDER BY
      result.average
  ),
  ROW_NUMBER() OVER (
    PARTITION BY
      result.event_id,
      result.person_continent_id
    ORDER BY
      result.average,
      result.result_id
  ),
  RANK() OVER (
    PARTITION BY
      result.event_id,
      result.person_country_id
    ORDER BY
      result.average
  ),
  ROW_NUMBER() OVER (
    PARTITION BY
      result.event_id,
      result.person_country_id
    ORDER BY
      result.average,
      result.result_id
  ),
  RANK() OVER (
    PARTITION BY
      result.event_id,
      result.gender
    ORDER BY
      result.average
  ),
  ROW_NUMBER() OVER (
    PARTITION BY
      result.event_id,
      result.gender
    ORDER BY
      result.average,
      result.result_id
  ),
  RANK() OVER (
    PARTITION BY
      result.event_id,
      result.person_continent_id,
      result.gender
    ORDER BY
      result.average
  ),
  ROW_NUMBER() OVER (
    PARTITION BY
      result.event_id,
      result.person_continent_id,
      result.gender
    ORDER BY
      result.average,
      result.result_id
  ),
  RANK() OVER (
    PARTITION BY
      result.event_id,
      result.person_country_id,
      result.gender
    ORDER BY
      result.average
  ),
  ROW_NUMBER() OVER (
    PARTITION BY
      result.event_id,
      result.person_country_id,
      result.gender
    ORDER BY
      result.average,
      result.result_id
  ),
  0
FROM
  result_facts result
WHERE
  result.average > 0
  AND result.competition_year = YEAR(CURDATE());

-- phase: index Average result rankings
ALTER TABLE result_rankings_average
ADD PRIMARY KEY (period_year, result_id),
ADD INDEX idx_results_average_world (period_year, event_id, world_position),
ADD INDEX idx_results_average_continent (
  period_year,
  event_id,
  continent_id,
  continent_position
),
ADD INDEX idx_results_average_country (
  period_year,
  event_id,
  country_id,
  country_position
),
ADD INDEX idx_results_average_gender_world (
  period_year,
  gender,
  event_id,
  gender_world_position
),
ADD INDEX idx_results_average_gender_continent (
  period_year,
  gender,
  event_id,
  continent_id,
  gender_continent_position
),
ADD INDEX idx_results_average_gender_country (
  period_year,
  gender,
  event_id,
  country_id,
  gender_country_position
),
ADD INDEX idx_results_average_person (
  period_year,
  person_id,
  event_id,
  world_position,
  result_id
),
ADD INDEX idx_result_rankings_average_live_order (period_year, event_id, result_value, result_id);
