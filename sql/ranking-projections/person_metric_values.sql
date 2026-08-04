DROP TEMPORARY TABLE IF EXISTS person_metric_references;

CREATE TEMPORARY TABLE person_metric_references (
  result_type ENUM('single', 'average') NOT NULL,
  scope ENUM('world', 'continent', 'country') NOT NULL,
  region_id VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  event_id VARCHAR(6) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  reference_result INT UNSIGNED NOT NULL,
  PRIMARY KEY (result_type, scope, region_id, event_id)
) ENGINE = InnoDB;

-- Every cohort has exactly one position-1 row. Its value is identical to the
-- MIN(personal_result) window previously calculated for every metric row.
-- phase: collect person metric references
INSERT INTO
  person_metric_references
SELECT
  result_type,
  'world',
  '',
  event_id,
  result_value
FROM
  person_event_rankings
WHERE
  world_position = 1
  AND event_id IN (
    '333',
    '222',
    '444',
    '555',
    '666',
    '777',
    '333bf',
    '333fm',
    '333oh',
    'clock',
    'minx',
    'pyram',
    'skewb',
    'sq1',
    '444bf',
    '555bf',
    '333mbf'
  )
UNION ALL
SELECT
  result_type,
  'continent',
  continent_id,
  event_id,
  result_value
FROM
  person_event_rankings
WHERE
  continent_id <> ''
  AND continent_position = 1
  AND event_id IN (
    '333',
    '222',
    '444',
    '555',
    '666',
    '777',
    '333bf',
    '333fm',
    '333oh',
    'clock',
    'minx',
    'pyram',
    'skewb',
    'sq1',
    '444bf',
    '555bf',
    '333mbf'
  )
UNION ALL
SELECT
  result_type,
  'country',
  country_id,
  event_id,
  result_value
FROM
  person_event_rankings
WHERE
  country_id <> ''
  AND country_position = 1
  AND event_id IN (
    '333',
    '222',
    '444',
    '555',
    '666',
    '777',
    '333bf',
    '333fm',
    '333oh',
    'clock',
    'minx',
    'pyram',
    'skewb',
    'sq1',
    '444bf',
    '555bf',
    '333mbf'
  );

CREATE TABLE person_metric_values (
  metric_version SMALLINT UNSIGNED NOT NULL,
  event_set_version SMALLINT UNSIGNED NOT NULL,
  result_type ENUM('single', 'average') NOT NULL,
  scope ENUM('world', 'continent', 'country') NOT NULL,
  region_id VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  person_id VARCHAR(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  event_id VARCHAR(6) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  event_rank INT UNSIGNED NOT NULL,
  personal_result INT UNSIGNED NOT NULL,
  reference_result INT UNSIGNED NOT NULL,
  sum_of_ranks_value DECIMAL(18, 6) NOT NULL,
  kinch_value DECIMAL(18, 6)
);

-- phase: materialize world person metric values
INSERT INTO
  person_metric_values
SELECT
  1,
  1,
  ranking.result_type,
  reference.scope,
  reference.region_id,
  ranking.person_id,
  ranking.event_id,
  ranking.world_rank,
  ranking.result_value,
  reference.reference_result,
  CAST(ranking.world_rank AS DECIMAL(18, 6)),
  CASE
    WHEN ranking.event_id = '333mbf' THEN NULL
    ELSE CAST(
      100.0 * reference.reference_result / ranking.result_value AS DECIMAL(18, 6)
    )
  END
FROM
  person_event_rankings ranking
  STRAIGHT_JOIN person_metric_references reference ON reference.result_type = ranking.result_type
  AND reference.scope = 'world'
  AND reference.region_id = ''
  AND reference.event_id = ranking.event_id;

-- phase: materialize continent person metric values
INSERT INTO
  person_metric_values
SELECT
  1,
  1,
  ranking.result_type,
  reference.scope,
  reference.region_id,
  ranking.person_id,
  ranking.event_id,
  ranking.continent_rank,
  ranking.result_value,
  reference.reference_result,
  CAST(ranking.continent_rank AS DECIMAL(18, 6)),
  CASE
    WHEN ranking.event_id = '333mbf' THEN NULL
    ELSE CAST(
      100.0 * reference.reference_result / ranking.result_value AS DECIMAL(18, 6)
    )
  END
FROM
  person_event_rankings ranking
  STRAIGHT_JOIN person_metric_references reference ON reference.result_type = ranking.result_type
  AND reference.scope = 'continent'
  AND reference.region_id = ranking.continent_id
  AND reference.event_id = ranking.event_id
WHERE
  ranking.continent_id <> '';

-- phase: materialize country person metric values
INSERT INTO
  person_metric_values
SELECT
  1,
  1,
  ranking.result_type,
  reference.scope,
  reference.region_id,
  ranking.person_id,
  ranking.event_id,
  ranking.country_rank,
  ranking.result_value,
  reference.reference_result,
  CAST(ranking.country_rank AS DECIMAL(18, 6)),
  CASE
    WHEN ranking.event_id = '333mbf' THEN NULL
    ELSE CAST(
      100.0 * reference.reference_result / ranking.result_value AS DECIMAL(18, 6)
    )
  END
FROM
  person_event_rankings ranking
  STRAIGHT_JOIN person_metric_references reference ON reference.result_type = ranking.result_type
  AND reference.scope = 'country'
  AND reference.region_id = ranking.country_id
  AND reference.event_id = ranking.event_id
WHERE
  ranking.country_id <> '';

DROP TEMPORARY TABLE person_metric_references;

-- phase: index person metric values
ALTER TABLE person_metric_values
ADD PRIMARY KEY (
  metric_version,
  event_set_version,
  result_type,
  scope,
  region_id,
  person_id,
  event_id
);
