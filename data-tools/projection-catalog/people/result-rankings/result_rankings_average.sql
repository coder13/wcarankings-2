CREATE TABLE result_rankings_average (
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
  country_position INT UNSIGNED NOT NULL
);

-- phase: materialize Average result rankings
INSERT INTO
  result_rankings_average
SELECT
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
  ) AS country_position
FROM
  result_facts result
WHERE
  result.average > 0;

-- phase: index Average result rankings
ALTER TABLE result_rankings_average
ADD PRIMARY KEY (result_id),
ADD INDEX idx_results_average_world (event_id, world_position),
ADD INDEX idx_results_average_continent (event_id, continent_id, continent_position),
ADD INDEX idx_results_average_country (event_id, country_id, country_position),
ADD INDEX idx_results_average_person (person_id, event_id, world_position, result_id);
