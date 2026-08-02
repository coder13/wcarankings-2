-- One row per valid official attempt. This is the canonical Single ranking
-- grain; result rows remain the canonical Average ranking grain.
CREATE TABLE solve_facts AS
SELECT
  attempt.result_id,
  attempt.attempt_number,
  facts.event_id,
  facts.person_id,
  CASE WHEN person.gender IN ('m', 'f') THEN person.gender ELSE 'o' END AS gender,
  facts.competition_id,
  facts.competition_year,
  facts.competition_start_date,
  facts.round_type_id,
  facts.person_country_id AS country_id,
  facts.person_continent_id AS continent_id,
  attempt.value AS solve_value,
  CASE WHEN attempt.value = facts.best THEN facts.regional_single_record ELSE '' END AS record_code
FROM result_attempts attempt
JOIN result_facts facts ON facts.result_id = attempt.result_id
JOIN persons person ON person.wca_id = facts.person_id AND person.sub_id = 1
WHERE attempt.value > 0;

ALTER TABLE solve_facts
  ADD PRIMARY KEY (result_id, attempt_number),
  ADD INDEX idx_solve_facts_common (gender, event_id, solve_value, result_id, attempt_number),
  ADD INDEX idx_solve_facts_person (person_id, event_id, solve_value, result_id, attempt_number),
  ADD INDEX idx_solve_facts_country_year (
    gender, event_id, country_id, competition_start_date, solve_value,
    competition_id, result_id, attempt_number
  );
