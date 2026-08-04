CREATE TABLE result_facts AS
SELECT
  r.id AS result_id,
  r.event_id,
  r.person_id,
  r.person_country_id,
  COALESCE(country.continent_id, '') AS person_continent_id,
  r.competition_id,
  comp.year AS competition_year,
  STR_TO_DATE(CONCAT(comp.year, '-', LPAD(comp.month, 2, '0'), '-', LPAD(comp.day, 2, '0')), '%Y-%m-%d') AS competition_start_date,
  r.round_type_id,
  COALESCE(round_type.final, 0) AS is_final_round,
  r.pos AS position,
  r.best,
  r.average,
  COALESCE(format.expected_solve_count, 0) AS attempt_count,
  COALESCE(r.regional_single_record, '') AS regional_single_record,
  COALESCE(r.regional_average_record, '') AS regional_average_record
FROM results r
INNER JOIN competitions comp ON comp.id = r.competition_id
LEFT JOIN countries country ON country.id = r.person_country_id
LEFT JOIN round_types round_type ON round_type.id = r.round_type_id
LEFT JOIN formats format ON format.id = r.format_id;

ALTER TABLE result_facts
  ADD PRIMARY KEY (result_id),
  ADD INDEX idx_result_facts_person_event_date (person_id, event_id, competition_start_date, result_id),
  ADD INDEX idx_result_facts_competition_event (competition_id, event_id, result_id),
  ADD INDEX idx_result_facts_year_single (competition_year, event_id, person_id, person_country_id, best, result_id),
  ADD INDEX idx_result_facts_year_average (competition_year, event_id, person_id, person_country_id, average, result_id),
  ADD INDEX idx_result_facts_single_ranking_cover (
    event_id, best, competition_start_date, competition_id, person_id,
    result_id, round_type_id, person_country_id, person_continent_id
  ),
  ADD INDEX idx_result_facts_average_ranking_cover (
    event_id, average, competition_start_date, competition_id, person_id,
    result_id, round_type_id, person_country_id, person_continent_id
  );
