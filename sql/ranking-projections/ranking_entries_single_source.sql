CREATE OR REPLACE VIEW ranking_entries_single_source AS
WITH historical AS (
  SELECT
    r.event_id,
    r.person_id,
    COALESCE(p.name, r.person_id) AS person_name,
    COALESCE(r.person_country_id, '') AS country_id,
    COALESCE(country.name, r.person_country_id, '') AS country_name,
    COALESCE(country.iso2, '') AS country_iso2,
    COALESCE(country.continent_id, '') AS continent_id,
    r.best,
    COALESCE(r.competition_id, '') AS competition_id,
    COALESCE(comp.name, r.competition_id, '') AS competition_name,
    COALESCE(r.regional_single_record, '') AS regional_record,
    ROW_NUMBER() OVER (
      PARTITION BY r.event_id, r.person_id, COALESCE(r.person_country_id, '')
      ORDER BY r.best, r.id
    ) AS country_person_position,
    ROW_NUMBER() OVER (
      PARTITION BY r.event_id, r.person_id, COALESCE(country.continent_id, '')
      ORDER BY r.best, r.id
    ) AS continent_person_position
  FROM results r
  LEFT JOIN persons p ON p.wca_id = r.person_id AND p.sub_id = 1
  LEFT JOIN countries country ON country.id = r.person_country_id
  LEFT JOIN competitions comp ON comp.id = r.competition_id
  WHERE r.best > 0
), country_rows AS (
  SELECT
    event_id, person_id, person_name, country_id, country_name, country_iso2,
    continent_id, best, competition_id, competition_name,
    0 AS world_rank,
    0 AS continent_rank,
    RANK() OVER (PARTITION BY event_id, country_id ORDER BY best) AS country_rank,
    0 AS world_sub_rank,
    0 AS continent_sub_rank,
    ROW_NUMBER() OVER (
      PARTITION BY event_id, country_id
      ORDER BY best, person_name, person_id
    ) AS country_sub_rank,
    CASE WHEN regional_record = 'WR' THEN 1 ELSE 0 END AS is_world_record,
    CASE WHEN regional_record IN ('AfR', 'AsR', 'ER', 'NaR', 'OcR', 'SaR') THEN 1 ELSE 0 END AS is_continent_record,
    CASE WHEN regional_record = 'NR' THEN 1 ELSE 0 END AS is_country_record
  FROM historical
  WHERE country_person_position = 1
), continent_rows AS (
  SELECT
    event_id, person_id, person_name, country_id, country_name, country_iso2,
    continent_id, best, competition_id, competition_name,
    0 AS world_rank,
    RANK() OVER (PARTITION BY event_id, continent_id ORDER BY best) AS continent_rank,
    0 AS country_rank,
    0 AS world_sub_rank,
    ROW_NUMBER() OVER (
      PARTITION BY event_id, continent_id
      ORDER BY best, person_name, person_id
    ) AS continent_sub_rank,
    0 AS country_sub_rank,
    CASE WHEN regional_record = 'WR' THEN 1 ELSE 0 END AS is_world_record,
    CASE WHEN regional_record IN ('AfR', 'AsR', 'ER', 'NaR', 'OcR', 'SaR') THEN 1 ELSE 0 END AS is_continent_record,
    CASE WHEN regional_record = 'NR' THEN 1 ELSE 0 END AS is_country_record
  FROM historical
  WHERE continent_person_position = 1
), world_rows AS (
  SELECT
    r.event_id,
    r.person_id,
    COALESCE(p.name, r.person_id) AS person_name,
    COALESCE(p.country_id, '') AS country_id,
    COALESCE(country.name, p.country_id, '') AS country_name,
    COALESCE(country.iso2, '') AS country_iso2,
    COALESCE(country.continent_id, '') AS continent_id,
    r.best,
    COALESCE(best.competition_id, '') AS competition_id,
    COALESCE(comp.name, '') AS competition_name,
    r.world_rank,
    0 AS continent_rank,
    0 AS country_rank,
    SUM(CASE WHEN r.world_rank > 0 THEN 1 ELSE 0 END) OVER (
      PARTITION BY r.event_id
      ORDER BY r.world_rank, COALESCE(p.name, r.person_id), r.person_id
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS world_sub_rank,
    0 AS continent_sub_rank,
    0 AS country_sub_rank,
    CASE WHEN r.world_rank = 1 THEN 1 ELSE 0 END AS is_world_record,
    CASE WHEN r.continent_rank = 1 THEN 1 ELSE 0 END AS is_continent_record,
    CASE WHEN r.country_rank = 1 THEN 1 ELSE 0 END AS is_country_record
  FROM ranks_single r
  LEFT JOIN persons p ON p.wca_id = r.person_id AND p.sub_id = 1
  LEFT JOIN countries country ON country.id = p.country_id
  LEFT JOIN wca_best_single best ON best.person_id = r.person_id AND best.event_id = r.event_id
  LEFT JOIN competitions comp ON comp.id = best.competition_id
)
SELECT event_id, person_id, person_name, country_id, country_name, country_iso2,
  continent_id, best, competition_id, competition_name,
  is_world_record, is_continent_record, is_country_record,
  world_rank, continent_rank, country_rank,
  world_sub_rank, continent_sub_rank, country_sub_rank
FROM world_rows
UNION ALL
SELECT event_id, person_id, person_name, country_id, country_name, country_iso2,
  continent_id, best, competition_id, competition_name,
  is_world_record, is_continent_record, is_country_record,
  world_rank, continent_rank, country_rank,
  world_sub_rank, continent_sub_rank, country_sub_rank
FROM country_rows
UNION ALL
SELECT event_id, person_id, person_name, country_id, country_name, country_iso2,
  continent_id, best, competition_id, competition_name,
  is_world_record, is_continent_record, is_country_record,
  world_rank, continent_rank, country_rank,
  world_sub_rank, continent_sub_rank, country_sub_rank
FROM continent_rows;
