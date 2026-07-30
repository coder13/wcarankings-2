DROP TEMPORARY TABLE IF EXISTS sum_of_ranks_historical_results;

CREATE TEMPORARY TABLE sum_of_ranks_historical_results (
  event_id VARCHAR(6) CHARACTER SET ascii NOT NULL,
  person_id VARCHAR(10) CHARACTER SET ascii NOT NULL,
  country_id VARCHAR(50) CHARACTER SET ascii NOT NULL,
  continent_id VARCHAR(50) CHARACTER SET ascii NOT NULL,
  single_result INT UNSIGNED NULL,
  average_result INT UNSIGNED NULL
) ENGINE = InnoDB;

-- phase: aggregate historical Single and Average bests
INSERT INTO sum_of_ranks_historical_results
  (event_id, person_id, country_id, continent_id, single_result, average_result)
SELECT
  result.event_id,
  result.person_id,
  result.person_country_id,
  COALESCE(country.continent_id, ''),
  MIN(CASE WHEN result.best > 0 THEN result.best END),
  MIN(CASE WHEN result.average > 0 THEN result.average END)
FROM results result
LEFT JOIN countries country ON country.id = result.person_country_id
WHERE result.person_country_id <> ''
  AND result.event_id IN (
    '333', '222', '444', '555', '666', '777', '333bf', '333fm',
    '333oh', 'clock', 'minx', 'pyram', 'skewb', 'sq1', '444bf',
    '555bf', '333mbf'
  )
  AND (result.best > 0 OR result.average > 0)
GROUP BY
  result.event_id, result.person_id,
  result.person_country_id, country.continent_id;

DROP TEMPORARY TABLE IF EXISTS sum_of_ranks_historical_bests;

CREATE TEMPORARY TABLE sum_of_ranks_historical_bests (
  result_type ENUM('single', 'average') NOT NULL,
  event_id VARCHAR(6) CHARACTER SET ascii NOT NULL,
  person_id VARCHAR(10) CHARACTER SET ascii NOT NULL,
  country_id VARCHAR(50) CHARACTER SET ascii NOT NULL,
  continent_id VARCHAR(50) CHARACTER SET ascii NOT NULL,
  result_value INT UNSIGNED NOT NULL
) ENGINE = InnoDB;

-- phase: unpivot historical bests
INSERT INTO sum_of_ranks_historical_bests
  (result_type, event_id, person_id, country_id, continent_id, result_value)
SELECT
  'single', event_id, person_id, country_id, continent_id, single_result
FROM sum_of_ranks_historical_results history
WHERE single_result IS NOT NULL;

INSERT INTO sum_of_ranks_historical_bests
  (result_type, event_id, person_id, country_id, continent_id, result_value)
SELECT
  'average', event_id, person_id, country_id, continent_id, average_result
FROM sum_of_ranks_historical_results history
WHERE average_result IS NOT NULL;

DROP TEMPORARY TABLE sum_of_ranks_historical_results;

DROP TEMPORARY TABLE IF EXISTS sum_of_ranks_cohorts;

CREATE TEMPORARY TABLE sum_of_ranks_cohorts (
  cohort_id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  scope ENUM('world', 'continent', 'country') NOT NULL,
  region_id VARCHAR(50) CHARACTER SET ascii NOT NULL,
  PRIMARY KEY (cohort_id),
  UNIQUE KEY idx_sum_of_ranks_cohort (scope, region_id)
) ENGINE = MEMORY;

INSERT INTO sum_of_ranks_cohorts (scope, region_id)
VALUES ('world', '');

INSERT INTO sum_of_ranks_cohorts (scope, region_id)
SELECT DISTINCT 'continent', continent_id
FROM sum_of_ranks_historical_bests
WHERE continent_id <> ''
ORDER BY continent_id;

INSERT INTO sum_of_ranks_cohorts (scope, region_id)
SELECT DISTINCT 'country', country_id
FROM sum_of_ranks_historical_bests
ORDER BY country_id;

DROP TEMPORARY TABLE IF EXISTS sum_of_ranks_event_values;

CREATE TEMPORARY TABLE sum_of_ranks_event_values (
  result_type ENUM('single', 'average') NOT NULL,
  cohort_id SMALLINT UNSIGNED NOT NULL,
  person_id VARCHAR(10) CHARACTER SET ascii NOT NULL,
  event_id VARCHAR(6) CHARACTER SET ascii NOT NULL,
  event_rank INT UNSIGNED NOT NULL,
  result_value INT UNSIGNED NOT NULL
) ENGINE = InnoDB;

-- phase: load World Single event values
INSERT INTO sum_of_ranks_event_values
  (result_type, cohort_id, person_id, event_id, event_rank, result_value)
SELECT
  'single', 1, rank.person_id, rank.event_id, rank.world_rank, rank.best
FROM ranks_single rank
WHERE rank.event_id IN (
    '333', '222', '444', '555', '666', '777', '333bf', '333fm',
    '333oh', 'clock', 'minx', 'pyram', 'skewb', 'sq1', '444bf',
    '555bf', '333mbf'
  )
  AND rank.best > 0
  AND rank.world_rank > 0;

-- phase: load World Average event values
INSERT INTO sum_of_ranks_event_values
  (result_type, cohort_id, person_id, event_id, event_rank, result_value)
SELECT
  'average', 1, rank.person_id, rank.event_id, rank.world_rank, rank.best
FROM ranks_average rank
WHERE rank.event_id IN (
    '333', '222', '444', '555', '666', '777', '333bf', '333fm',
    '333oh', 'clock', 'minx', 'pyram', 'skewb', 'sq1', '444bf', '555bf'
  )
  AND rank.best > 0
  AND rank.world_rank > 0;

-- phase: rank country event values
INSERT INTO sum_of_ranks_event_values
  (result_type, cohort_id, person_id, event_id, event_rank, result_value)
SELECT
  value.result_type,
  cohort.cohort_id,
  value.person_id,
  value.event_id,
  RANK() OVER (
    PARTITION BY value.result_type, value.event_id, value.country_id
    ORDER BY value.result_value
  ),
  value.result_value
FROM sum_of_ranks_historical_bests value
INNER JOIN sum_of_ranks_cohorts cohort
  ON cohort.scope = 'country'
  AND cohort.region_id = value.country_id;

-- phase: rank continent event values
INSERT INTO sum_of_ranks_event_values
  (result_type, cohort_id, person_id, event_id, event_rank, result_value)
WITH continent_bests AS (
  SELECT
    result_type,
    event_id,
    person_id,
    continent_id,
    MIN(result_value) AS result_value
  FROM sum_of_ranks_historical_bests
  WHERE continent_id <> ''
  GROUP BY result_type, event_id, person_id, continent_id
)
SELECT
  value.result_type,
  cohort.cohort_id,
  value.person_id,
  value.event_id,
  RANK() OVER (
    PARTITION BY value.result_type, value.event_id, value.continent_id
    ORDER BY value.result_value
  ),
  value.result_value
FROM continent_bests value
INNER JOIN sum_of_ranks_cohorts cohort
  ON cohort.scope = 'continent'
  AND cohort.region_id = value.continent_id;

DROP TEMPORARY TABLE IF EXISTS sum_of_ranks_event_penalties;

CREATE TEMPORARY TABLE sum_of_ranks_event_penalties (
  result_type ENUM('single', 'average') NOT NULL,
  cohort_id SMALLINT UNSIGNED NOT NULL,
  event_id VARCHAR(6) CHARACTER SET ascii NOT NULL,
  fallback_rank INT UNSIGNED NOT NULL,
  reference_result INT UNSIGNED NOT NULL,
  PRIMARY KEY (result_type, cohort_id, event_id)
) ENGINE = MEMORY;

-- phase: calculate event penalties and Kinch references
INSERT INTO sum_of_ranks_event_penalties
  (result_type, cohort_id, event_id, fallback_rank, reference_result)
SELECT
  result_type,
  cohort_id,
  event_id,
  COUNT(*) + 1,
  MIN(result_value)
FROM sum_of_ranks_event_values
GROUP BY result_type, cohort_id, event_id;

DROP TEMPORARY TABLE IF EXISTS sum_of_ranks_kinch_values;

CREATE TEMPORARY TABLE sum_of_ranks_kinch_values (
  cohort_id SMALLINT UNSIGNED NOT NULL,
  person_id VARCHAR(10) CHARACTER SET ascii NOT NULL,
  event_id VARCHAR(6) CHARACTER SET ascii NOT NULL,
  kinch_value DECIMAL(12, 5) UNSIGNED NOT NULL,
  PRIMARY KEY (cohort_id, person_id, event_id)
) ENGINE = InnoDB;

-- phase: combine the traditional Kinch event choices
INSERT INTO sum_of_ranks_kinch_values
  (cohort_id, person_id, event_id, kinch_value)
WITH ratios AS (
  SELECT
    value.cohort_id,
    value.person_id,
    value.event_id,
    MAX(CASE WHEN value.result_type = 'single' THEN
      CASE WHEN value.event_id = '333mbf' THEN
        100.0 * GREATEST(0, (
          (99 - FLOOR(value.result_value / 10000000) % 100)
          + 1
          - CASE WHEN FLOOR(value.result_value / 100) % 100000 = 99999 THEN 0
            ELSE (FLOOR(value.result_value / 100) % 100000 * 100.0) / 360000 END
        )) / NULLIF(GREATEST(0, (
          (99 - FLOOR(penalty.reference_result / 10000000) % 100)
          + 1
          - CASE WHEN FLOOR(penalty.reference_result / 100) % 100000 = 99999 THEN 0
            ELSE (FLOOR(penalty.reference_result / 100) % 100000 * 100.0) / 360000 END
        )), 0)
      ELSE 100.0 * penalty.reference_result / value.result_value END
    END) AS single_ratio,
    MAX(CASE WHEN value.result_type = 'average' THEN
      100.0 * penalty.reference_result / value.result_value
    END) AS average_ratio
  FROM sum_of_ranks_event_values value
  INNER JOIN sum_of_ranks_event_penalties penalty
    ON penalty.result_type = value.result_type
    AND penalty.cohort_id = value.cohort_id
    AND penalty.event_id = value.event_id
  GROUP BY value.cohort_id, value.person_id, value.event_id
)
SELECT
  cohort_id,
  person_id,
  event_id,
  CASE
    WHEN event_id = '333mbf' THEN COALESCE(single_ratio, 0)
    WHEN event_id IN ('333fm', '333bf', '444bf', '555bf')
      THEN GREATEST(COALESCE(single_ratio, 0), COALESCE(average_ratio, 0))
    ELSE COALESCE(average_ratio, 0)
  END
FROM ratios;

CREATE TABLE person_sum_of_ranks_scores (
  metric_version SMALLINT UNSIGNED NOT NULL,
  event_set_version SMALLINT UNSIGNED NOT NULL,
  result_type ENUM('single', 'average') NOT NULL,
  scope ENUM('world', 'continent', 'country') NOT NULL,
  region_id VARCHAR(50) CHARACTER SET ascii NOT NULL,
  person_id VARCHAR(10) CHARACTER SET ascii NOT NULL,
  score BIGINT UNSIGNED NOT NULL,
  coverage TINYINT UNSIGNED NOT NULL,
  required_coverage TINYINT UNSIGNED NOT NULL,
  kinch_score DECIMAL(12, 5) UNSIGNED NOT NULL,
  kinch_coverage TINYINT UNSIGNED NOT NULL,
  rank INT UNSIGNED NOT NULL,
  position INT UNSIGNED NOT NULL,
  kinch_rank INT UNSIGNED NOT NULL,
  kinch_position INT UNSIGNED NOT NULL
);

-- phase: aggregate and rank person scores
INSERT INTO person_sum_of_ranks_scores
WITH baselines AS (
  SELECT
    result_type,
    cohort_id,
    SUM(fallback_rank)
      + (CASE WHEN result_type = 'single' THEN 17 ELSE 16 END)
      - COUNT(*) AS fallback_score,
    CASE WHEN result_type = 'single' THEN 17 ELSE 16 END AS required_coverage
  FROM sum_of_ranks_event_penalties
  GROUP BY result_type, cohort_id
), person_adjustments AS (
  SELECT
    value.result_type,
    value.cohort_id,
    value.person_id,
    SUM(
      CAST(value.event_rank AS SIGNED)
        - CAST(penalty.fallback_rank AS SIGNED)
    ) AS score_adjustment,
    COUNT(*) AS coverage
  FROM sum_of_ranks_event_values value
  INNER JOIN sum_of_ranks_event_penalties penalty
    ON penalty.result_type = value.result_type
    AND penalty.cohort_id = value.cohort_id
    AND penalty.event_id = value.event_id
  GROUP BY value.result_type, value.cohort_id, value.person_id
), totals AS (
  SELECT
    person.result_type,
    person.cohort_id,
    person.person_id,
    CAST(baseline.fallback_score AS SIGNED)
      + person.score_adjustment AS score,
    person.coverage,
    baseline.required_coverage,
    kinch.kinch_score,
    kinch.kinch_coverage
  FROM person_adjustments person
  INNER JOIN baselines baseline
    ON baseline.result_type = person.result_type
    AND baseline.cohort_id = person.cohort_id
  INNER JOIN (
    SELECT cohort_id, person_id, SUM(kinch_value) AS kinch_score, COUNT(*) AS kinch_coverage
    FROM sum_of_ranks_kinch_values
    GROUP BY cohort_id, person_id
  ) kinch
    ON kinch.cohort_id = person.cohort_id
    AND kinch.person_id = person.person_id
), ranked AS (
  SELECT
    totals.*,
    RANK() OVER (
      PARTITION BY result_type, cohort_id
      ORDER BY score
    ) AS rank,
    ROW_NUMBER() OVER (
      PARTITION BY result_type, cohort_id
      ORDER BY score, person_id
    ) AS position,
    RANK() OVER (
      PARTITION BY result_type, cohort_id
      ORDER BY kinch_score DESC
    ) AS kinch_rank,
    ROW_NUMBER() OVER (
      PARTITION BY result_type, cohort_id
      ORDER BY kinch_score DESC, person_id
    ) AS kinch_position
  FROM totals
)
SELECT
  1,
  1,
  ranked.result_type,
  cohort.scope,
  cohort.region_id,
  ranked.person_id,
  ranked.score,
  ranked.coverage,
  ranked.required_coverage,
  ranked.kinch_score,
  ranked.kinch_coverage,
  ranked.rank,
  ranked.position,
  ranked.kinch_rank,
  ranked.kinch_position
FROM ranked
INNER JOIN sum_of_ranks_cohorts cohort
  ON cohort.cohort_id = ranked.cohort_id;

-- phase: index person scores
ALTER TABLE person_sum_of_ranks_scores
  ADD PRIMARY KEY (
    metric_version, event_set_version, result_type,
    scope, region_id, person_id
  ),
  ADD INDEX idx_person_sum_of_ranks_page (
    metric_version, event_set_version, result_type,
    scope, region_id, position, person_id
  ),
  ADD INDEX idx_person_kinch_page (
    metric_version, event_set_version, result_type,
    scope, region_id, kinch_position, person_id
  );

DROP TEMPORARY TABLE sum_of_ranks_event_penalties;
DROP TEMPORARY TABLE sum_of_ranks_kinch_values;
DROP TEMPORARY TABLE sum_of_ranks_event_values;
DROP TEMPORARY TABLE sum_of_ranks_cohorts;
DROP TEMPORARY TABLE sum_of_ranks_historical_bests;
