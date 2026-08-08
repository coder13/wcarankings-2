-- One row per valid official attempt. Keep this build-only stage minimal: its
-- consumers scan every row, so indexes only add build time and disk traffic.
DROP TEMPORARY TABLE IF EXISTS solve_facts_stage;

-- phase: materialize minimal solve stage
CREATE TEMPORARY TABLE solve_facts_stage ENGINE = InnoDB AS
SELECT
  attempt.result_id,
  attempt.attempt_number,
  facts.event_id,
  facts.person_id,
  CASE
    WHEN person.gender IN ('m', 'f') THEN person.gender
    ELSE 'o'
  END AS gender,
  facts.competition_id,
  facts.competition_start_date,
  facts.person_country_id AS country_id,
  facts.person_continent_id AS continent_id,
  attempt.value AS solve_value,
  CASE
    WHEN attempt.value = facts.best THEN facts.regional_single_record
    ELSE ''
  END AS record_code
FROM
  result_facts facts
  LEFT JOIN persons person ON person.wca_id = facts.person_id
  AND person.sub_id = 1
  STRAIGHT_JOIN result_attempts attempt ON attempt.result_id = facts.result_id
WHERE
  attempt.value > 0;
