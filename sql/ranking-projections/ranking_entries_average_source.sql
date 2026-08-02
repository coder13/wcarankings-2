CREATE OR REPLACE VIEW ranking_entries_average_source AS
WITH historical AS (
  SELECT
    r.event_id,
    r.person_id,
    r.person_name,
    COALESCE(r.person_country_id, '') AS country_id,
    r.person_country_name AS country_name,
    r.person_country_iso2 AS country_iso2,
    r.person_continent_id AS continent_id,
    r.average AS best,
    r.competition_id,
    r.competition_name,
    r.regional_average_record AS regional_record,
    ROW_NUMBER() OVER (
      PARTITION BY r.event_id, r.person_id, COALESCE(r.person_country_id, '')
      ORDER BY r.average, r.result_id
    ) AS country_person_position,
    ROW_NUMBER() OVER (
      PARTITION BY r.event_id, r.person_id, r.person_continent_id
      ORDER BY r.average, r.result_id
    ) AS continent_person_position
  FROM result_facts r
  WHERE r.average > 0
), country_rows AS (
  SELECT
    event_id, person_id, person_name, country_id, country_name, country_iso2,
    continent_id, best, competition_id, competition_name,
    0 AS world_rank, 0 AS continent_rank,
    RANK() OVER (PARTITION BY event_id, country_id ORDER BY best) AS country_rank,
    0 AS world_sub_rank, 0 AS continent_sub_rank,
    ROW_NUMBER() OVER (PARTITION BY event_id, country_id ORDER BY best, person_name, person_id) AS country_sub_rank,
    regional_record = 'WR' AS is_world_record,
    regional_record IN ('AfR', 'AsR', 'ER', 'NaR', 'OcR', 'SaR') AS is_continent_record,
    regional_record = 'NR' AS is_country_record
  FROM historical WHERE country_person_position = 1
), continent_rows AS (
  SELECT
    event_id, person_id, person_name, country_id, country_name, country_iso2,
    continent_id, best, competition_id, competition_name,
    0 AS world_rank,
    RANK() OVER (PARTITION BY event_id, continent_id ORDER BY best) AS continent_rank,
    0 AS country_rank, 0 AS world_sub_rank,
    ROW_NUMBER() OVER (PARTITION BY event_id, continent_id ORDER BY best, person_name, person_id) AS continent_sub_rank,
    0 AS country_sub_rank,
    regional_record = 'WR' AS is_world_record,
    regional_record IN ('AfR', 'AsR', 'ER', 'NaR', 'OcR', 'SaR') AS is_continent_record,
    regional_record = 'NR' AS is_country_record
  FROM historical WHERE continent_person_position = 1
), world_rows AS (
  SELECT
    r.event_id, r.person_id, COALESCE(p.name, r.person_id) AS person_name,
    COALESCE(p.country_id, '') AS country_id,
    COALESCE(country.name, p.country_id, '') AS country_name,
    COALESCE(country.iso2, '') AS country_iso2,
    COALESCE(country.continent_id, '') AS continent_id,
    r.best, COALESCE(best.competition_id, '') AS competition_id,
    COALESCE(comp.name, '') AS competition_name,
    r.world_rank, 0 AS continent_rank, 0 AS country_rank,
    SUM(r.world_rank > 0) OVER (
      PARTITION BY r.event_id
      ORDER BY r.world_rank, COALESCE(p.name, r.person_id), r.person_id
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS world_sub_rank,
    0 AS continent_sub_rank, 0 AS country_sub_rank,
    r.world_rank = 1 AS is_world_record,
    r.continent_rank = 1 AS is_continent_record,
    r.country_rank = 1 AS is_country_record
  FROM ranks_average r
  LEFT JOIN persons p ON p.wca_id = r.person_id AND p.sub_id = 1
  LEFT JOIN countries country ON country.id = p.country_id
  LEFT JOIN wca_best_average best ON best.person_id = r.person_id AND best.event_id = r.event_id
  LEFT JOIN competitions comp ON comp.id = best.competition_id
)
SELECT event_id, person_id, person_name, country_id, country_name, country_iso2,
  continent_id, best, competition_id, competition_name,
  is_world_record, is_continent_record, is_country_record,
  world_rank, continent_rank, country_rank, world_sub_rank, continent_sub_rank, country_sub_rank
FROM world_rows
UNION ALL
SELECT event_id, person_id, person_name, country_id, country_name, country_iso2,
  continent_id, best, competition_id, competition_name,
  is_world_record, is_continent_record, is_country_record,
  world_rank, continent_rank, country_rank, world_sub_rank, continent_sub_rank, country_sub_rank
FROM country_rows
UNION ALL
SELECT event_id, person_id, person_name, country_id, country_name, country_iso2,
  continent_id, best, competition_id, competition_name,
  is_world_record, is_continent_record, is_country_record,
  world_rank, continent_rank, country_rank, world_sub_rank, continent_sub_rank, country_sub_rank
FROM continent_rows;
