DROP TEMPORARY TABLE IF EXISTS country_event_base;

DROP TEMPORARY TABLE IF EXISTS country_event_gender_aggregates;

DROP TEMPORARY TABLE IF EXISTS country_event_gender_masks;

DROP TEMPORARY TABLE IF EXISTS country_event_cohort_values;

DROP TEMPORARY TABLE IF EXISTS country_event_competition_genders;

DROP TEMPORARY TABLE IF EXISTS country_event_competition_counts;

-- phase: materialize hosted country result facts once
CREATE TEMPORARY TABLE country_event_base ENGINE = InnoDB AS
SELECT
  facts.result_id,
  facts.event_id,
  facts.person_id,
  facts.competition_id,
  facts.competition_year,
  facts.competition_start_date,
  facts.best,
  facts.average,
  facts.gender,
  facts.official_solve_count,
  competition.country_id
FROM
  result_facts facts
  INNER JOIN competitions competition ON competition.id = facts.competition_id
WHERE
  competition.country_id <> '';

-- phase: aggregate base genders for all-time and yearly periods
CREATE TEMPORARY TABLE country_event_gender_aggregates (
  country_id VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  event_id VARCHAR(6) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  stat_year SMALLINT UNSIGNED NOT NULL,
  gender CHAR(1) NOT NULL,
  fastest_single_key VARBINARY(70),
  fastest_average_key VARBINARY(70),
  competitor_count INT UNSIGNED NOT NULL,
  official_solve_count BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (country_id, event_id, stat_year, gender)
) ENGINE = InnoDB;

INSERT INTO
  country_event_gender_aggregates
SELECT
  country_id,
  event_id,
  0,
  gender,
  MIN(
    CASE
      WHEN best > 0 THEN CAST(
        CONCAT(
          LPAD(best, 10, '0'),
          DATE_FORMAT(competition_start_date, '%Y%m%d'),
          RPAD(competition_id, 32, ' '),
          LPAD(result_id, 20, '0')
        ) AS BINARY
      )
    END
  ),
  MIN(
    CASE
      WHEN average > 0 THEN CAST(
        CONCAT(
          LPAD(average, 10, '0'),
          DATE_FORMAT(competition_start_date, '%Y%m%d'),
          RPAD(competition_id, 32, ' '),
          LPAD(result_id, 20, '0')
        ) AS BINARY
      )
    END
  ),
  COUNT(DISTINCT person_id),
  SUM(official_solve_count)
FROM
  country_event_base
GROUP BY
  country_id,
  event_id,
  gender;

INSERT INTO
  country_event_gender_aggregates
SELECT
  country_id,
  event_id,
  competition_year,
  gender,
  MIN(
    CASE
      WHEN best > 0 THEN CAST(
        CONCAT(
          LPAD(best, 10, '0'),
          DATE_FORMAT(competition_start_date, '%Y%m%d'),
          RPAD(competition_id, 32, ' '),
          LPAD(result_id, 20, '0')
        ) AS BINARY
      )
    END
  ),
  MIN(
    CASE
      WHEN average > 0 THEN CAST(
        CONCAT(
          LPAD(average, 10, '0'),
          DATE_FORMAT(competition_start_date, '%Y%m%d'),
          RPAD(competition_id, 32, ' '),
          LPAD(result_id, 20, '0')
        ) AS BINARY
      )
    END
  ),
  COUNT(DISTINCT person_id),
  SUM(official_solve_count)
FROM
  country_event_base
GROUP BY
  country_id,
  event_id,
  competition_year,
  gender;

-- phase: expand compact base-gender aggregates to the seven useful cohorts
CREATE TEMPORARY TABLE country_event_gender_masks (gender_mask TINYINT UNSIGNED NOT NULL PRIMARY KEY) ENGINE = MEMORY;

INSERT INTO
  country_event_gender_masks
VALUES
  (1),
  (2),
  (3),
  (4),
  (5),
  (6),
  (7);

CREATE TEMPORARY TABLE country_event_cohort_values ENGINE = InnoDB AS
SELECT
  aggregate.country_id,
  aggregate.event_id,
  aggregate.stat_year,
  masks.gender_mask,
  MIN(aggregate.fastest_single_key) AS fastest_single_key,
  MIN(aggregate.fastest_average_key) AS fastest_average_key,
  SUM(aggregate.competitor_count) AS competitor_count,
  SUM(aggregate.official_solve_count) AS official_solve_count
FROM
  country_event_gender_aggregates aggregate
  INNER JOIN country_event_gender_masks masks ON masks.gender_mask & CASE aggregate.gender
    WHEN 'm' THEN 1
    WHEN 'f' THEN 2
    ELSE 4
  END <> 0
GROUP BY
  aggregate.country_id,
  aggregate.event_id,
  aggregate.stat_year,
  masks.gender_mask;

ALTER TABLE country_event_cohort_values
ADD PRIMARY KEY (country_id, event_id, stat_year, gender_mask);

-- phase: count hosted competitions once for every intersecting gender cohort
CREATE TEMPORARY TABLE country_event_competition_genders ENGINE = InnoDB AS
SELECT
  country_id,
  event_id,
  competition_year,
  competition_id,
  BIT_OR(
    CASE gender
      WHEN 'm' THEN 1
      WHEN 'f' THEN 2
      ELSE 4
    END
  ) AS gender_mask
FROM
  country_event_base
GROUP BY
  country_id,
  event_id,
  competition_year,
  competition_id;

ALTER TABLE country_event_competition_genders
ADD PRIMARY KEY (
  country_id,
  event_id,
  competition_year,
  competition_id
);

CREATE TEMPORARY TABLE country_event_competition_counts (
  country_id VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  event_id VARCHAR(6) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  stat_year SMALLINT UNSIGNED NOT NULL,
  gender_mask TINYINT UNSIGNED NOT NULL,
  competition_count INT UNSIGNED NOT NULL,
  PRIMARY KEY (country_id, event_id, stat_year, gender_mask)
) ENGINE = InnoDB;

INSERT INTO
  country_event_competition_counts
SELECT
  competition.country_id,
  competition.event_id,
  0,
  masks.gender_mask,
  COUNT(*)
FROM
  country_event_competition_genders competition
  INNER JOIN country_event_gender_masks masks ON competition.gender_mask & masks.gender_mask <> 0
GROUP BY
  competition.country_id,
  competition.event_id,
  masks.gender_mask;

INSERT INTO
  country_event_competition_counts
SELECT
  competition.country_id,
  competition.event_id,
  competition.competition_year,
  masks.gender_mask,
  COUNT(*)
FROM
  country_event_competition_genders competition
  INNER JOIN country_event_gender_masks masks ON competition.gender_mask & masks.gender_mask <> 0
GROUP BY
  competition.country_id,
  competition.event_id,
  competition.competition_year,
  masks.gender_mask;

-- phase: publish one compact row per country, event, period, and cohort
CREATE TABLE country_event_stats AS
SELECT
  cohort.country_id,
  COALESCE(country.continent_id, '') AS continent_id,
  cohort.event_id,
  cohort.stat_year,
  cohort.gender_mask,
  CAST(LEFT (cohort.fastest_single_key, 10) AS UNSIGNED) AS fastest_single,
  CAST(RIGHT (cohort.fastest_single_key, 20) AS UNSIGNED) AS fastest_single_result_id,
  CAST(LEFT (cohort.fastest_average_key, 10) AS UNSIGNED) AS fastest_average,
  CAST(
    RIGHT (cohort.fastest_average_key, 20) AS UNSIGNED
  ) AS fastest_average_result_id,
  cohort.competitor_count,
  competition.competition_count,
  cohort.official_solve_count
FROM
  country_event_cohort_values cohort
  INNER JOIN country_event_competition_counts competition USING (country_id, event_id, stat_year, gender_mask)
  LEFT JOIN countries country ON country.id = cohort.country_id;

ALTER TABLE country_event_stats
ADD PRIMARY KEY (country_id, event_id, stat_year, gender_mask),
ADD INDEX idx_country_event_single (
  event_id,
  stat_year,
  gender_mask,
  fastest_single,
  country_id
),
ADD INDEX idx_country_event_average (
  event_id,
  stat_year,
  gender_mask,
  fastest_average,
  country_id
),
ADD INDEX idx_country_event_competitors (
  event_id,
  stat_year,
  gender_mask,
  competitor_count,
  country_id
),
ADD INDEX idx_country_event_competitions (
  event_id,
  stat_year,
  gender_mask,
  competition_count,
  country_id
),
ADD INDEX idx_country_event_solves (
  event_id,
  stat_year,
  gender_mask,
  official_solve_count,
  country_id
);

DROP TEMPORARY TABLE country_event_competition_counts;

DROP TEMPORARY TABLE country_event_competition_genders;

DROP TEMPORARY TABLE country_event_cohort_values;

DROP TEMPORARY TABLE country_event_gender_masks;

DROP TEMPORARY TABLE country_event_gender_aggregates;

DROP TEMPORARY TABLE country_event_base;
