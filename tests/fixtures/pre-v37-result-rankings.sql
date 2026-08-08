-- The V37 app migration updated projection tables that predated Flyway.
-- This fixture is their exact pre-V37 schema from catalog commit 3144e7e.
-- V39 also indexes this imported WCA export table.
CREATE TABLE countries (
  id VARCHAR(50) NOT NULL PRIMARY KEY,
  iso2 CHAR(2) NOT NULL
);

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
  country_position INT UNSIGNED NOT NULL,
  PRIMARY KEY (result_id, attempt_number),
  INDEX idx_results_single_world (event_id, world_position),
  INDEX idx_results_single_continent (event_id, continent_id, continent_position),
  INDEX idx_results_single_country (event_id, country_id, country_position),
  INDEX idx_results_single_person (
    person_id,
    event_id,
    world_position,
    result_id,
    attempt_number
  ),
  INDEX idx_results_single_lazy_gender (
    gender,
    event_id,
    country_id,
    competition_start_date,
    result_value,
    competition_id,
    result_id,
    attempt_number
  )
);

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
  country_position INT UNSIGNED NOT NULL,
  PRIMARY KEY (result_id),
  INDEX idx_results_average_world (event_id, world_position),
  INDEX idx_results_average_continent (event_id, continent_id, continent_position),
  INDEX idx_results_average_country (event_id, country_id, country_position),
  INDEX idx_results_average_person (person_id, event_id, world_position, result_id)
);
