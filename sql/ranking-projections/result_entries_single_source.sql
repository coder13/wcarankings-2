CREATE OR REPLACE VIEW result_entries_single_source AS
SELECT
  r.id AS result_id,
  r.event_id,
  r.person_id,
  COALESCE(p.name, r.person_name, r.person_id) AS person_name,
  COALESCE(p.country_id, '') AS country_id,
  COALESCE(c.name, p.country_id, '') AS country_name,
  COALESCE(c.iso2, '') AS country_iso2,
  COALESCE(c.continent_id, '') AS continent_id,
  r.best,
  r.competition_id,
  COALESCE(comp.name, r.competition_id) AS competition_name,
  comp.start_date AS competition_date,
  r.round_type_id,
  COALESCE(r.regional_single_record, '') AS regional_single_record,
  DENSE_RANK() OVER (
    PARTITION BY r.event_id
    ORDER BY r.best
  ) AS world_rank,
  DENSE_RANK() OVER (
    PARTITION BY r.event_id, COALESCE(c.continent_id, '')
    ORDER BY r.best
  ) AS continent_rank,
  DENSE_RANK() OVER (
    PARTITION BY r.event_id, COALESCE(p.country_id, '')
    ORDER BY r.best
  ) AS country_rank,
  ROW_NUMBER() OVER (
    PARTITION BY r.event_id
    ORDER BY r.best, r.competition_id, r.round_type_id, r.person_id, r.id
  ) AS world_sub_rank,
  ROW_NUMBER() OVER (
    PARTITION BY r.event_id, COALESCE(c.continent_id, '')
    ORDER BY r.best, r.competition_id, r.round_type_id, r.person_id, r.id
  ) AS continent_sub_rank,
  ROW_NUMBER() OVER (
    PARTITION BY r.event_id, COALESCE(p.country_id, '')
    ORDER BY r.best, r.competition_id, r.round_type_id, r.person_id, r.id
  ) AS country_sub_rank
FROM results r
LEFT JOIN persons p ON p.wca_id = r.person_id AND p.sub_id = 1
LEFT JOIN countries c ON c.id = p.country_id
LEFT JOIN competitions comp ON comp.id = r.competition_id
WHERE r.best > 0;
