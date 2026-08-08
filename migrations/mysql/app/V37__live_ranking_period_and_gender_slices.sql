-- Add period and gender rank dimensions required by live result-ranking jobs.
ALTER TABLE result_rankings_single
  ADD COLUMN period_year SMALLINT UNSIGNED NOT NULL DEFAULT 0 FIRST,
  ADD COLUMN gender_world_rank INT UNSIGNED NOT NULL DEFAULT 0
    AFTER country_position,
  ADD COLUMN gender_world_position INT UNSIGNED NOT NULL DEFAULT 0
    AFTER gender_world_rank,
  ADD COLUMN gender_continent_rank INT UNSIGNED NOT NULL DEFAULT 0
    AFTER gender_world_position,
  ADD COLUMN gender_continent_position INT UNSIGNED NOT NULL DEFAULT 0
    AFTER gender_continent_rank,
  ADD COLUMN gender_country_rank INT UNSIGNED NOT NULL DEFAULT 0
    AFTER gender_continent_position,
  ADD COLUMN gender_country_position INT UNSIGNED NOT NULL DEFAULT 0
    AFTER gender_country_rank,
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (period_year, result_id, attempt_number),
  DROP INDEX idx_results_single_world,
  DROP INDEX idx_results_single_continent,
  DROP INDEX idx_results_single_country,
  DROP INDEX idx_results_single_person,
  DROP INDEX idx_results_single_lazy_gender,
  ADD INDEX idx_results_single_world (period_year, event_id, world_position),
  ADD INDEX idx_results_single_continent (
    period_year, event_id, continent_id, continent_position
  ),
  ADD INDEX idx_results_single_country (
    period_year, event_id, country_id, country_position
  ),
  ADD INDEX idx_results_single_gender_world (
    period_year, gender, event_id, gender_world_position
  ),
  ADD INDEX idx_results_single_gender_continent (
    period_year, gender, event_id, continent_id, gender_continent_position
  ),
  ADD INDEX idx_results_single_gender_country (
    period_year, gender, event_id, country_id, gender_country_position
  ),
  ADD INDEX idx_results_single_person (
    period_year, person_id, event_id, world_position, result_id, attempt_number
  ),
  ADD INDEX idx_results_single_lazy_gender (
    period_year, gender, event_id, country_id, competition_start_date,
    result_value, competition_id, result_id, attempt_number
  );

ALTER TABLE result_rankings_average
  ADD COLUMN period_year SMALLINT UNSIGNED NOT NULL DEFAULT 0 FIRST,
  ADD COLUMN gender_world_rank INT UNSIGNED NOT NULL DEFAULT 0
    AFTER country_position,
  ADD COLUMN gender_world_position INT UNSIGNED NOT NULL DEFAULT 0
    AFTER gender_world_rank,
  ADD COLUMN gender_continent_rank INT UNSIGNED NOT NULL DEFAULT 0
    AFTER gender_world_position,
  ADD COLUMN gender_continent_position INT UNSIGNED NOT NULL DEFAULT 0
    AFTER gender_continent_rank,
  ADD COLUMN gender_country_rank INT UNSIGNED NOT NULL DEFAULT 0
    AFTER gender_continent_position,
  ADD COLUMN gender_country_position INT UNSIGNED NOT NULL DEFAULT 0
    AFTER gender_country_rank,
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (period_year, result_id),
  DROP INDEX idx_results_average_world,
  DROP INDEX idx_results_average_continent,
  DROP INDEX idx_results_average_country,
  DROP INDEX idx_results_average_person,
  ADD INDEX idx_results_average_world (period_year, event_id, world_position),
  ADD INDEX idx_results_average_continent (
    period_year, event_id, continent_id, continent_position
  ),
  ADD INDEX idx_results_average_country (
    period_year, event_id, country_id, country_position
  ),
  ADD INDEX idx_results_average_gender_world (
    period_year, gender, event_id, gender_world_position
  ),
  ADD INDEX idx_results_average_gender_continent (
    period_year, gender, event_id, continent_id, gender_continent_position
  ),
  ADD INDEX idx_results_average_gender_country (
    period_year, gender, event_id, country_id, gender_country_position
  ),
  ADD INDEX idx_results_average_person (
    period_year, person_id, event_id, world_position, result_id
  );
