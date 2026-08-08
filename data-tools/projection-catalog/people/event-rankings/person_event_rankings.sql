CREATE TABLE person_event_rankings (
  person_id VARCHAR(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  event_id VARCHAR(6) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  result_type ENUM('single', 'average') NOT NULL,
  result_id BIGINT NOT NULL,
  result_value INT NOT NULL,
  country_id VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  continent_id VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  gender ENUM('m', 'f', 'o') NOT NULL,
  world_rank INT UNSIGNED NOT NULL,
  world_position INT UNSIGNED NOT NULL,
  continent_rank INT UNSIGNED NOT NULL,
  continent_position INT UNSIGNED NOT NULL,
  country_rank INT UNSIGNED NOT NULL,
  country_position INT UNSIGNED NOT NULL,
  is_provisional TINYINT(1) NOT NULL DEFAULT 0
);

-- phase: rank person event bests
INSERT INTO
  person_event_rankings (
    person_id,
    event_id,
    result_type,
    result_id,
    result_value,
    country_id,
    continent_id,
    gender,
    world_rank,
    world_position,
    continent_rank,
    continent_position,
    country_rank,
    country_position,
    is_provisional
  )
WITH
  world_candidates AS (
    SELECT
      best.*,
      ROW_NUMBER() OVER (
        PARTITION BY
          best.person_id,
          best.event_id,
          best.result_type
        ORDER BY
          best.result_value,
          best.competition_start_date,
          best.competition_id,
          best.result_id
      ) AS world_candidate_position
    FROM
      person_event_bests best
    WHERE
      best.period_year = 0
  ),
  world_bests AS (
    SELECT
      *
    FROM
      world_candidates
    WHERE
      world_candidate_position = 1
  )
SELECT
  best.person_id,
  best.event_id,
  best.result_type,
  best.result_id,
  best.result_value,
  best.country_id,
  best.continent_id,
  best.gender,
  DENSE_RANK() OVER (
    PARTITION BY
      best.event_id,
      best.result_type
    ORDER BY
      best.result_value
  ) AS world_rank,
  ROW_NUMBER() OVER (
    PARTITION BY
      best.event_id,
      best.result_type
    ORDER BY
      best.result_value,
      best.person_id
  ) AS world_position,
  DENSE_RANK() OVER (
    PARTITION BY
      best.event_id,
      best.result_type,
      best.continent_id
    ORDER BY
      best.result_value
  ) AS continent_rank,
  ROW_NUMBER() OVER (
    PARTITION BY
      best.event_id,
      best.result_type,
      best.continent_id
    ORDER BY
      best.result_value,
      best.person_id
  ) AS continent_position,
  DENSE_RANK() OVER (
    PARTITION BY
      best.event_id,
      best.result_type,
      best.country_id
    ORDER BY
      best.result_value
  ) AS country_rank,
  ROW_NUMBER() OVER (
    PARTITION BY
      best.event_id,
      best.result_type,
      best.country_id
    ORDER BY
      best.result_value,
      best.person_id
  ) AS country_position,
  0 AS is_provisional
FROM
  world_bests best;

-- Build the supported browse and lazy-filter indexes together so MariaDB only
-- scans the completed table once during index publication.
-- phase: index person event rankings
ALTER TABLE person_event_rankings
ADD PRIMARY KEY (person_id, event_id, result_type),
ADD INDEX idx_person_event_world (event_id, result_type, world_position, person_id),
ADD INDEX idx_person_event_continent (
  event_id,
  result_type,
  continent_id,
  continent_position,
  person_id
),
ADD INDEX idx_person_event_country (
  event_id,
  result_type,
  country_id,
  country_position,
  person_id
),
ADD INDEX idx_person_event_continent_value (
  event_id,
  result_type,
  continent_id,
  result_value,
  person_id
),
ADD INDEX idx_person_event_country_value (
  event_id,
  result_type,
  country_id,
  result_value,
  person_id
),
ADD INDEX idx_person_event_gender_value (
  event_id,
  result_type,
  gender,
  result_value,
  person_id
),
ADD INDEX idx_person_event_continent_gender_value (
  event_id,
  result_type,
  continent_id,
  gender,
  result_value,
  person_id
),
ADD INDEX idx_person_event_country_gender_value (
  event_id,
  result_type,
  country_id,
  gender,
  result_value,
  person_id
);
