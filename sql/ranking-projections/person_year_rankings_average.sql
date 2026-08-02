CREATE TABLE person_year_rankings_average AS
WITH country_candidates AS (
  SELECT
    competition_year AS ranking_year, event_id, person_id,
    person_country_id AS country_id, person_continent_id AS continent_id,
    result_id, competition_start_date, competition_id, average AS result_value,
    ROW_NUMBER() OVER (
      PARTITION BY competition_year, event_id, person_id, person_country_id
      ORDER BY average, competition_start_date, competition_id, result_id
    ) AS candidate_position
  FROM result_facts
  WHERE average > 0
    AND event_id IN ('333', '222', '444', '555', '666', '777', '333bf', '333fm', '333oh', 'clock', 'minx', 'pyram', 'skewb', 'sq1', '444bf', '555bf')
), country_bests AS (
  SELECT * FROM country_candidates WHERE candidate_position = 1
), cohort_candidates AS (
  SELECT ranking_year, event_id, person_id, result_id, result_value, 'country' AS scope, country_id AS region_id
  FROM country_bests WHERE country_id <> ''
  UNION ALL
  SELECT ranking_year, event_id, person_id, result_id, result_value, 'continent', continent_id
  FROM (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY ranking_year, event_id, person_id, continent_id ORDER BY result_value, competition_start_date, competition_id, result_id) AS cohort_position
    FROM country_bests WHERE continent_id <> ''
  ) continent_bests WHERE cohort_position = 1
  UNION ALL
  SELECT ranking_year, event_id, person_id, result_id, result_value, 'world', ''
  FROM (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY ranking_year, event_id, person_id ORDER BY result_value, competition_start_date, competition_id, result_id) AS cohort_position
    FROM country_bests
  ) world_bests WHERE cohort_position = 1
)
SELECT candidate.ranking_year AS year, candidate.event_id, cohort.cohort_id,
  candidate.person_id, candidate.result_id, candidate.result_value,
  RANK() OVER (PARTITION BY candidate.ranking_year, candidate.event_id, cohort.cohort_id ORDER BY candidate.result_value) AS public_rank,
  ROW_NUMBER() OVER (PARTITION BY candidate.ranking_year, candidate.event_id, cohort.cohort_id ORDER BY candidate.result_value, candidate.person_id) AS position
FROM cohort_candidates candidate
JOIN person_year_ranking_cohorts cohort ON cohort.scope = candidate.scope AND cohort.region_id = candidate.region_id;

ALTER TABLE person_year_rankings_average
  ADD PRIMARY KEY (year, event_id, cohort_id, person_id),
  ADD INDEX idx_person_year_average_browse (year, event_id, cohort_id, position, person_id),
  ADD INDEX idx_person_year_average_person (year, event_id, cohort_id, person_id);
