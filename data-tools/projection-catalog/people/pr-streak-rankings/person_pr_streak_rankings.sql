-- phase: materialize each person's best results at each competition
CREATE TEMPORARY TABLE pr_streak_competition_event_bests AS
SELECT
  person_id,
  event_id,
  competition_id,
  competition_start_date,
  YEAR(competition_start_date) AS competition_year,
  MIN(
    CASE
      WHEN best > 0 THEN best
    END
  ) AS best_single,
  MIN(
    CASE
      WHEN average > 0 THEN average
    END
  ) AS best_average
FROM
  result_facts
WHERE
  best > 0
  OR average > 0
GROUP BY
  person_id,
  event_id,
  competition_id,
  competition_start_date;

-- phase: index competition bests for person-event history
ALTER TABLE pr_streak_competition_event_bests
ADD PRIMARY KEY (
  person_id,
  event_id,
  competition_start_date,
  competition_id
);

-- phase: collapse same-day results before calculating personal-best history
CREATE TEMPORARY TABLE pr_streak_person_event_day_bests AS
SELECT
  person_id,
  event_id,
  competition_start_date,
  MIN(best_single) AS best_single,
  MIN(best_average) AS best_average
FROM
  pr_streak_competition_event_bests
GROUP BY
  person_id,
  event_id,
  competition_start_date;

-- phase: index same-day personal bests
ALTER TABLE pr_streak_person_event_day_bests
ADD PRIMARY KEY (person_id, event_id, competition_start_date);

-- phase: calculate the personal best entering each competition date
CREATE TEMPORARY TABLE pr_streak_person_event_day_history AS
WITH
  running_bests AS (
    SELECT
      person_id,
      event_id,
      competition_start_date,
      MIN(best_single) OVER (
        PARTITION BY
          person_id,
          event_id
        ORDER BY
          competition_start_date ROWS BETWEEN UNBOUNDED PRECEDING
          AND CURRENT ROW
      ) AS running_single,
      MIN(best_average) OVER (
        PARTITION BY
          person_id,
          event_id
        ORDER BY
          competition_start_date ROWS BETWEEN UNBOUNDED PRECEDING
          AND CURRENT ROW
      ) AS running_average
    FROM
      pr_streak_person_event_day_bests
  )
SELECT
  person_id,
  event_id,
  competition_start_date,
  LAG(running_single) OVER (
    PARTITION BY
      person_id,
      event_id
    ORDER BY
      competition_start_date
  ) AS prior_single,
  LAG(running_average) OVER (
    PARTITION BY
      person_id,
      event_id
    ORDER BY
      competition_start_date
  ) AS prior_average
FROM
  running_bests;

-- phase: index personal-best history
ALTER TABLE pr_streak_person_event_day_history
ADD PRIMARY KEY (person_id, event_id, competition_start_date);

-- phase: mark competitions that contain a personal record
CREATE TEMPORARY TABLE pr_streak_competition_outcomes AS
SELECT
  competition_best.person_id,
  competition_best.competition_start_date,
  competition_best.competition_year,
  competition_best.competition_id,
  MAX(
    (
      competition_best.best_single IS NOT NULL
      AND (
        history.prior_single IS NULL
        OR competition_best.best_single <= history.prior_single
      )
    )
    OR (
      competition_best.best_average IS NOT NULL
      AND (
        history.prior_average IS NULL
        OR competition_best.best_average <= history.prior_average
      )
    )
  ) AS set_pr
FROM
  pr_streak_competition_event_bests competition_best
  INNER JOIN pr_streak_person_event_day_history history ON history.person_id = competition_best.person_id
  AND history.event_id = competition_best.event_id
  AND history.competition_start_date = competition_best.competition_start_date
GROUP BY
  competition_best.person_id,
  competition_best.competition_start_date,
  competition_best.competition_year,
  competition_best.competition_id;

-- phase: index competition outcomes
ALTER TABLE pr_streak_competition_outcomes
ADD PRIMARY KEY (person_id, competition_start_date, competition_id);

-- phase: require every same-day competition to contain a personal record
CREATE TEMPORARY TABLE pr_streak_person_days AS
SELECT
  person_id,
  competition_start_date,
  competition_year,
  COUNT(*) AS competition_count,
  MIN(set_pr) AS all_competitions_set_pr
FROM
  pr_streak_competition_outcomes
GROUP BY
  person_id,
  competition_start_date,
  competition_year;

-- phase: index person competition dates
ALTER TABLE pr_streak_person_days
ADD PRIMARY KEY (person_id, competition_start_date);

-- phase: assign consecutive personal-record streak groups
CREATE TEMPORARY TABLE pr_streak_day_segments AS
SELECT
  person_id,
  competition_start_date,
  competition_year,
  competition_count,
  all_competitions_set_pr,
  SUM(
    CASE
      WHEN all_competitions_set_pr = 0 THEN 1
      ELSE 0
    END
  ) OVER (
    PARTITION BY
      person_id
    ORDER BY
      competition_start_date ROWS BETWEEN UNBOUNDED PRECEDING
      AND CURRENT ROW
  ) AS streak_group
FROM
  pr_streak_person_days;

-- phase: index streak groups
ALTER TABLE pr_streak_day_segments
ADD INDEX idx_pr_streak_day_segments_all_time (person_id, streak_group, all_competitions_set_pr),
ADD INDEX idx_pr_streak_day_segments_year (
  competition_year,
  person_id,
  streak_group,
  all_competitions_set_pr
);

-- phase: materialize each person's longest all-time PR streak
CREATE TABLE person_pr_streak_counts AS
WITH
  streaks AS (
    SELECT
      person_id,
      streak_group,
      SUM(competition_count) AS pr_streak
    FROM
      pr_streak_day_segments
    WHERE
      all_competitions_set_pr = 1
    GROUP BY
      person_id,
      streak_group
  )
SELECT
  streak.person_id,
  CASE
    WHEN person.gender IN ('m', 'f') THEN person.gender
    ELSE 'o'
  END AS person_gender,
  COALESCE(person.country_id, '') AS country_id,
  COALESCE(country.continent_id, '') AS continent_id,
  MAX(streak.pr_streak) AS pr_streak
FROM
  streaks streak
  INNER JOIN persons person ON person.wca_id = streak.person_id
  AND person.sub_id = 1
  LEFT JOIN countries country ON country.id = person.country_id
GROUP BY
  streak.person_id,
  person_gender,
  country_id,
  continent_id
HAVING
  MAX(streak.pr_streak) >= 2;

-- phase: index all-time PR streak cohorts
ALTER TABLE person_pr_streak_counts
ADD PRIMARY KEY (person_id),
ADD INDEX idx_person_pr_streak_counts_world (person_gender, pr_streak, person_id),
ADD INDEX idx_person_pr_streak_counts_continent (continent_id, person_gender, pr_streak, person_id),
ADD INDEX idx_person_pr_streak_counts_country (country_id, person_gender, pr_streak, person_id);

-- phase: materialize each person's longest PR streak within each year
CREATE TABLE person_pr_streak_year_counts AS
WITH
  streaks AS (
    SELECT
      competition_year AS year,
      person_id,
      streak_group,
      SUM(competition_count) AS pr_streak
    FROM
      pr_streak_day_segments
    WHERE
      all_competitions_set_pr = 1
    GROUP BY
      competition_year,
      person_id,
      streak_group
  )
SELECT
  streak.year,
  streak.person_id,
  CASE
    WHEN person.gender IN ('m', 'f') THEN person.gender
    ELSE 'o'
  END AS person_gender,
  COALESCE(person.country_id, '') AS country_id,
  COALESCE(country.continent_id, '') AS continent_id,
  MAX(streak.pr_streak) AS pr_streak
FROM
  streaks streak
  INNER JOIN persons person ON person.wca_id = streak.person_id
  AND person.sub_id = 1
  LEFT JOIN countries country ON country.id = person.country_id
GROUP BY
  streak.year,
  streak.person_id,
  person_gender,
  country_id,
  continent_id
HAVING
  MAX(streak.pr_streak) >= 2;

-- phase: index yearly PR streak cohorts
ALTER TABLE person_pr_streak_year_counts
ADD PRIMARY KEY (year, person_id),
ADD INDEX idx_person_pr_streak_year_counts_world (year, person_gender, pr_streak, person_id),
ADD INDEX idx_person_pr_streak_year_counts_continent (
  year,
  continent_id,
  person_gender,
  pr_streak,
  person_id
),
ADD INDEX idx_person_pr_streak_year_counts_country (
  year,
  country_id,
  person_gender,
  pr_streak,
  person_id
);

-- phase: rank common all-time region and single-gender cohorts
CREATE TABLE person_pr_streak_rankings AS
WITH
  cohorts AS (
    SELECT
      person_id,
      pr_streak,
      'world' AS scope,
      '' AS region_id,
      'all' AS gender
    FROM
      person_pr_streak_counts
    UNION ALL
    SELECT
      person_id,
      pr_streak,
      'world',
      '',
      person_gender
    FROM
      person_pr_streak_counts
    UNION ALL
    SELECT
      person_id,
      pr_streak,
      'continent',
      continent_id,
      'all'
    FROM
      person_pr_streak_counts
    WHERE
      continent_id <> ''
    UNION ALL
    SELECT
      person_id,
      pr_streak,
      'continent',
      continent_id,
      person_gender
    FROM
      person_pr_streak_counts
    WHERE
      continent_id <> ''
    UNION ALL
    SELECT
      person_id,
      pr_streak,
      'country',
      country_id,
      'all'
    FROM
      person_pr_streak_counts
    WHERE
      country_id <> ''
    UNION ALL
    SELECT
      person_id,
      pr_streak,
      'country',
      country_id,
      person_gender
    FROM
      person_pr_streak_counts
    WHERE
      country_id <> ''
  )
SELECT
  person_id,
  pr_streak,
  scope,
  region_id,
  gender,
  RANK() OVER (
    PARTITION BY
      scope,
      region_id,
      gender
    ORDER BY
      pr_streak DESC
  ) AS rank,
  ROW_NUMBER() OVER (
    PARTITION BY
      scope,
      region_id,
      gender
    ORDER BY
      pr_streak DESC,
      person_id
  ) AS position
FROM
  cohorts;

-- phase: index PR streak ranking pages
ALTER TABLE person_pr_streak_rankings
ADD PRIMARY KEY (scope, region_id, gender, person_id),
ADD INDEX idx_person_pr_streak_rankings_page (scope, region_id, gender, position, person_id);

-- phase: materialize common PR streak ranking counts
CREATE TABLE person_pr_streak_ranking_counts AS
SELECT
  scope,
  region_id,
  gender,
  COUNT(*) AS count
FROM
  person_pr_streak_rankings
GROUP BY
  scope,
  region_id,
  gender;

-- phase: index PR streak ranking counts
ALTER TABLE person_pr_streak_ranking_counts
ADD PRIMARY KEY (scope, region_id, gender);

-- phase: clean up PR streak build stages
DROP TEMPORARY TABLE pr_streak_day_segments,
pr_streak_person_days,
pr_streak_competition_outcomes,
pr_streak_person_event_day_history,
pr_streak_person_event_day_bests,
pr_streak_competition_event_bests;
