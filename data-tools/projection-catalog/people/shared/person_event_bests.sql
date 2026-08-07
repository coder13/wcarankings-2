-- phase: select all-time and historical-country person event bests
CREATE TABLE person_event_bests AS
WITH candidates AS (
  SELECT
    0 AS period_year,
    facts.person_id,
    facts.event_id,
    'single' AS result_type,
    facts.result_id,
    facts.best AS result_value,
    facts.person_country_id AS country_id,
    facts.person_continent_id AS continent_id,
    facts.gender,
    facts.competition_start_date,
    facts.competition_id,
    ROW_NUMBER() OVER (
      PARTITION BY facts.person_id, facts.event_id
      ORDER BY facts.best, facts.competition_start_date, facts.competition_id, facts.result_id
    ) AS best_position
  FROM result_facts facts
  WHERE facts.best > 0
  UNION ALL
  SELECT
    0,
    facts.person_id,
    facts.event_id,
    'average',
    facts.result_id,
    facts.average,
    facts.person_country_id,
    facts.person_continent_id,
    facts.gender,
    facts.competition_start_date,
    facts.competition_id,
    ROW_NUMBER() OVER (
      PARTITION BY facts.person_id, facts.event_id
      ORDER BY facts.average, facts.competition_start_date, facts.competition_id, facts.result_id
    )
  FROM result_facts facts
  WHERE facts.average > 0
  UNION ALL
  SELECT
    facts.competition_year,
    facts.person_id,
    facts.event_id,
    'single',
    facts.result_id,
    facts.best,
    facts.person_country_id,
    facts.person_continent_id,
    facts.gender,
    facts.competition_start_date,
    facts.competition_id,
    ROW_NUMBER() OVER (
      PARTITION BY facts.competition_year, facts.person_id, facts.event_id, facts.person_country_id
      ORDER BY facts.best, facts.competition_start_date, facts.competition_id, facts.result_id
    )
  FROM result_facts facts
  WHERE facts.best > 0
  UNION ALL
  SELECT
    facts.competition_year,
    facts.person_id,
    facts.event_id,
    'average',
    facts.result_id,
    facts.average,
    facts.person_country_id,
    facts.person_continent_id,
    facts.gender,
    facts.competition_start_date,
    facts.competition_id,
    ROW_NUMBER() OVER (
      PARTITION BY facts.competition_year, facts.person_id, facts.event_id, facts.person_country_id
      ORDER BY facts.average, facts.competition_start_date, facts.competition_id, facts.result_id
    )
  FROM result_facts facts
  WHERE facts.average > 0
)
SELECT
  period_year,
  person_id,
  event_id,
  result_type,
  result_id,
  result_value,
  competition_start_date,
  competition_id,
  country_id,
  continent_id,
  gender
FROM candidates
WHERE best_position = 1;

ALTER TABLE person_event_bests
  ADD PRIMARY KEY (period_year, person_id, event_id, result_type, country_id),
  ADD INDEX idx_person_event_bests_rank (period_year, event_id, result_type, result_value, person_id),
  ADD INDEX idx_person_event_bests_country (period_year, event_id, result_type, country_id, result_value, person_id);
