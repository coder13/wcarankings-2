DROP TEMPORARY TABLE IF EXISTS city_event_attempt_counts;

DROP TEMPORARY TABLE IF EXISTS city_event_base;

DROP TEMPORARY TABLE IF EXISTS city_event_scoped;

DROP TEMPORARY TABLE IF EXISTS city_event_aggregates;

DROP TEMPORARY TABLE IF EXISTS city_event_winners;

-- phase: count valid attempts once
CREATE TEMPORARY TABLE city_event_attempt_counts ENGINE = InnoDB AS
SELECT
  result_id,
  COUNT(
    CASE
      WHEN value > 0 THEN 1
    END
  ) AS official_solve_count
FROM
  result_attempts
GROUP BY
  result_id;

ALTER TABLE city_event_attempt_counts
ADD PRIMARY KEY (result_id);

-- phase: materialize city result facts once
CREATE TEMPORARY TABLE city_event_base ENGINE = InnoDB AS
SELECT
  facts.result_id,
  facts.event_id,
  facts.person_id,
  facts.competition_id,
  facts.competition_start_date,
  facts.best,
  facts.average,
  comp.city_name,
  comp.country_id,
  facts.gender AS person_gender,
  COALESCE(attempts.official_solve_count, 0) AS official_solve_count
FROM
  result_facts facts
  INNER JOIN competitions comp ON comp.id = facts.competition_id
  LEFT JOIN city_event_attempt_counts attempts ON attempts.result_id = facts.result_id
WHERE
  comp.city_name <> '';

DROP TEMPORARY TABLE city_event_attempt_counts;

-- phase: materialize gender scopes once
CREATE TEMPORARY TABLE city_event_scoped ENGINE = InnoDB AS
SELECT
  result_id,
  event_id,
  person_id,
  competition_id,
  competition_start_date,
  best,
  average,
  city_name,
  country_id,
  person_gender AS gender,
  official_solve_count
FROM
  city_event_base
UNION ALL
SELECT
  result_id,
  event_id,
  person_id,
  competition_id,
  competition_start_date,
  best,
  average,
  city_name,
  country_id,
  'all',
  official_solve_count
FROM
  city_event_base;

DROP TEMPORARY TABLE city_event_base;

ALTER TABLE city_event_scoped
ADD INDEX idx_city_event_scoped_single (
  city_name,
  country_id,
  event_id,
  gender,
  best,
  competition_start_date,
  competition_id,
  result_id
),
ADD INDEX idx_city_event_scoped_average (
  city_name,
  country_id,
  event_id,
  gender,
  average,
  competition_start_date,
  competition_id,
  result_id
);

-- phase: aggregate each city event scope once
CREATE TEMPORARY TABLE city_event_aggregates ENGINE = InnoDB AS
SELECT
  city_name,
  country_id,
  event_id,
  gender,
  MIN(
    CASE
      WHEN best > 0 THEN best
    END
  ) AS fastest_single,
  MIN(
    CASE
      WHEN average > 0 THEN average
    END
  ) AS fastest_average,
  COUNT(DISTINCT person_id) AS competitor_count,
  COUNT(DISTINCT competition_id) AS competition_count,
  SUM(official_solve_count) AS official_solve_count
FROM
  city_event_scoped
GROUP BY
  city_name,
  country_id,
  event_id,
  gender;

ALTER TABLE city_event_aggregates
ADD PRIMARY KEY (city_name, country_id, event_id, gender);

-- phase: choose the earliest result for tied city records
CREATE TEMPORARY TABLE city_event_winners ENGINE = InnoDB AS
SELECT
  city_name,
  country_id,
  event_id,
  gender,
  MAX(
    CASE
      WHEN single_choice = 1 THEN result_id
    END
  ) AS fastest_single_result_id,
  MAX(
    CASE
      WHEN average_choice = 1 THEN result_id
    END
  ) AS fastest_average_result_id
FROM
  (
    SELECT
      scoped.city_name,
      scoped.country_id,
      scoped.event_id,
      scoped.gender,
      scoped.result_id,
      ROW_NUMBER() OVER (
        PARTITION BY
          scoped.city_name,
          scoped.country_id,
          scoped.event_id,
          scoped.gender
        ORDER BY
          scoped.competition_start_date,
          scoped.competition_id,
          scoped.result_id
      ) AS single_choice,
      0 AS average_choice
    FROM
      city_event_scoped scoped
      INNER JOIN city_event_aggregates aggregates ON aggregates.city_name = scoped.city_name
      AND aggregates.country_id = scoped.country_id
      AND aggregates.event_id = scoped.event_id
      AND aggregates.gender = scoped.gender
      AND aggregates.fastest_single = scoped.best
    UNION ALL
    SELECT
      scoped.city_name,
      scoped.country_id,
      scoped.event_id,
      scoped.gender,
      scoped.result_id,
      0,
      ROW_NUMBER() OVER (
        PARTITION BY
          scoped.city_name,
          scoped.country_id,
          scoped.event_id,
          scoped.gender
        ORDER BY
          scoped.competition_start_date,
          scoped.competition_id,
          scoped.result_id
      )
    FROM
      city_event_scoped scoped
      INNER JOIN city_event_aggregates aggregates ON aggregates.city_name = scoped.city_name
      AND aggregates.country_id = scoped.country_id
      AND aggregates.event_id = scoped.event_id
      AND aggregates.gender = scoped.gender
      AND aggregates.fastest_average = scoped.average
  ) winner_candidates
GROUP BY
  city_name,
  country_id,
  event_id,
  gender;

ALTER TABLE city_event_winners
ADD PRIMARY KEY (city_name, country_id, event_id, gender);

CREATE TABLE city_event_stats AS
SELECT
  aggregates.city_name,
  aggregates.country_id,
  aggregates.event_id,
  aggregates.gender,
  aggregates.fastest_single,
  winners.fastest_single_result_id,
  aggregates.fastest_average,
  winners.fastest_average_result_id,
  aggregates.competitor_count,
  aggregates.competition_count,
  aggregates.official_solve_count,
  CASE
    WHEN fastest_single IS NOT NULL THEN DENSE_RANK() OVER (
      PARTITION BY
        event_id,
        gender
      ORDER BY
        fastest_single
    )
  END AS fastest_single_rank,
  CASE
    WHEN fastest_average IS NOT NULL THEN DENSE_RANK() OVER (
      PARTITION BY
        event_id,
        gender
      ORDER BY
        fastest_average
    )
  END AS fastest_average_rank
FROM
  city_event_aggregates aggregates
  LEFT JOIN city_event_winners winners USING (city_name, country_id, event_id, gender);

ALTER TABLE city_event_stats
ADD PRIMARY KEY (city_name, country_id, event_id, gender),
ADD INDEX idx_city_event_single (
  event_id,
  gender,
  fastest_single,
  country_id,
  city_name
),
ADD INDEX idx_city_event_average (
  event_id,
  gender,
  fastest_average,
  country_id,
  city_name
),
ADD INDEX idx_city_event_competitors (
  event_id,
  gender,
  competitor_count,
  country_id,
  city_name
),
ADD INDEX idx_city_event_competitions (
  event_id,
  gender,
  competition_count,
  country_id,
  city_name
),
ADD INDEX idx_city_event_solves (
  event_id,
  gender,
  official_solve_count,
  country_id,
  city_name
);

DROP TEMPORARY TABLE city_event_winners;

DROP TEMPORARY TABLE city_event_aggregates;

DROP TEMPORARY TABLE city_event_scoped;
