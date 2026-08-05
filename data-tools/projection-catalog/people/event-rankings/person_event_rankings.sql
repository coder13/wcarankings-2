DROP TEMPORARY TABLE IF EXISTS person_event_best_values;

DROP TEMPORARY TABLE IF EXISTS person_event_best_results;

-- The raw WCA rank tables already contain exactly one official personal-best
-- value per person and event. Reuse those values instead of ranking every
-- result row twice merely to discard all but the first Single/Average result.
-- phase: stage person event best values
CREATE TEMPORARY TABLE person_event_best_values ENGINE = InnoDB AS
SELECT
  person_id,
  event_id,
  'single' AS result_type,
  best AS result_value
FROM
  ranks_single
WHERE
  best > 0
UNION ALL
SELECT
  person_id,
  event_id,
  'average' AS result_type,
  best AS result_value
FROM
  ranks_average
WHERE
  best > 0;

ALTER TABLE person_event_best_values
ADD PRIMARY KEY (person_id, event_id, result_type);

-- A best value can occur in more than one result. Preserve the established
-- date, competition, and result-id tie-break while sorting only those tied
-- best rows rather than every historical result.
-- phase: resolve person event best results
CREATE TEMPORARY TABLE person_event_best_results ENGINE = InnoDB AS
WITH
  candidates AS (
    SELECT
      best.person_id,
      best.event_id,
      best.result_type,
      facts.result_id,
      best.result_value,
      facts.person_country_id AS country_id,
      facts.person_continent_id AS continent_id,
      facts.gender,
      ROW_NUMBER() OVER (
        PARTITION BY
          best.person_id,
          best.event_id,
          best.result_type
        ORDER BY
          facts.competition_start_date,
          facts.competition_id,
          facts.result_id
      ) AS best_result_position
    FROM
      person_event_best_values best
      STRAIGHT_JOIN result_facts facts ON facts.person_id = best.person_id
      AND facts.event_id = best.event_id
      AND (
        (
          best.result_type = 'single'
          AND facts.best = best.result_value
        )
        OR (
          best.result_type = 'average'
          AND facts.average = best.result_value
        )
      )
  )
SELECT
  person_id,
  event_id,
  result_type,
  result_id,
  result_value,
  country_id,
  continent_id,
  gender
FROM
  candidates
WHERE
  best_result_position = 1;

DROP TEMPORARY TABLE person_event_best_values;

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
  country_position INT UNSIGNED NOT NULL
);

-- phase: rank person event bests
INSERT INTO
  person_event_rankings
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
  ) AS country_position
FROM
  person_event_best_results best;

DROP TEMPORARY TABLE person_event_best_results;

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
