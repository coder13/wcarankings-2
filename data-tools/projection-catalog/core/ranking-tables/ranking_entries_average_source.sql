CREATE OR REPLACE VIEW ranking_entries_average_source AS
WITH
  historical AS (
    SELECT
      r.event_id,
      r.person_id,
      COALESCE(r.person_country_id, '') AS country_id,
      r.person_continent_id AS continent_id,
      r.average AS best,
      r.competition_id,
      r.regional_average_record AS regional_record,
      ROW_NUMBER() OVER (
        PARTITION BY
          r.event_id,
          r.person_id,
          COALESCE(r.person_country_id, '')
        ORDER BY
          r.average,
          r.result_id
      ) AS country_person_position,
      ROW_NUMBER() OVER (
        PARTITION BY
          r.event_id,
          r.person_id,
          r.person_continent_id
        ORDER BY
          r.average,
          r.result_id
      ) AS continent_person_position
    FROM
      result_facts r
    WHERE
      r.average > 0
  ),
  country_rows AS (
    SELECT
      historical.event_id,
      historical.person_id,
      COALESCE(person.name, historical.person_id) AS person_name,
      COALESCE(person.gender, '') AS gender,
      historical.country_id,
      COALESCE(country.name, historical.country_id, '') AS country_name,
      COALESCE(country.iso2, '') AS country_iso2,
      historical.continent_id,
      historical.best,
      historical.competition_id,
      COALESCE(comp.name, historical.competition_id, '') AS competition_name,
      0 AS world_rank,
      0 AS continent_rank,
      RANK() OVER (
        PARTITION BY
          historical.event_id,
          historical.country_id
        ORDER BY
          historical.best
      ) AS country_rank,
      0 AS world_sub_rank,
      0 AS continent_sub_rank,
      ROW_NUMBER() OVER (
        PARTITION BY
          historical.event_id,
          historical.country_id
        ORDER BY
          historical.best,
          COALESCE(person.name, historical.person_id),
          historical.person_id
      ) AS country_sub_rank,
      historical.regional_record = 'WR' AS is_world_record,
      historical.regional_record IN ('AfR', 'AsR', 'ER', 'NaR', 'OcR', 'SaR') AS is_continent_record,
      historical.regional_record = 'NR' AS is_country_record
    FROM
      historical
      LEFT JOIN persons person ON person.wca_id = historical.person_id
      AND person.sub_id = 1
      LEFT JOIN countries country ON country.id = historical.country_id
      LEFT JOIN competitions comp ON comp.id = historical.competition_id
    WHERE
      historical.country_person_position = 1
  ),
  continent_rows AS (
    SELECT
      historical.event_id,
      historical.person_id,
      COALESCE(person.name, historical.person_id) AS person_name,
      COALESCE(person.gender, '') AS gender,
      historical.country_id,
      COALESCE(country.name, historical.country_id, '') AS country_name,
      COALESCE(country.iso2, '') AS country_iso2,
      historical.continent_id,
      historical.best,
      historical.competition_id,
      COALESCE(comp.name, historical.competition_id, '') AS competition_name,
      0 AS world_rank,
      RANK() OVER (
        PARTITION BY
          historical.event_id,
          historical.continent_id
        ORDER BY
          historical.best
      ) AS continent_rank,
      0 AS country_rank,
      0 AS world_sub_rank,
      ROW_NUMBER() OVER (
        PARTITION BY
          historical.event_id,
          historical.continent_id
        ORDER BY
          historical.best,
          COALESCE(person.name, historical.person_id),
          historical.person_id
      ) AS continent_sub_rank,
      0 AS country_sub_rank,
      historical.regional_record = 'WR' AS is_world_record,
      historical.regional_record IN ('AfR', 'AsR', 'ER', 'NaR', 'OcR', 'SaR') AS is_continent_record,
      historical.regional_record = 'NR' AS is_country_record
    FROM
      historical
      LEFT JOIN persons person ON person.wca_id = historical.person_id
      AND person.sub_id = 1
      LEFT JOIN countries country ON country.id = historical.country_id
      LEFT JOIN competitions comp ON comp.id = historical.competition_id
    WHERE
      historical.continent_person_position = 1
  ),
  world_rows AS (
    SELECT
      ranking.event_id,
      ranking.person_id,
      COALESCE(person.name, ranking.person_id) AS person_name,
      COALESCE(person.gender, '') AS gender,
      COALESCE(person.country_id, '') AS country_id,
      COALESCE(country.name, person.country_id, '') AS country_name,
      COALESCE(country.iso2, '') AS country_iso2,
      COALESCE(country.continent_id, '') AS continent_id,
      ranking.best,
      COALESCE(best.competition_id, '') AS competition_id,
      COALESCE(comp.name, '') AS competition_name,
      ranking.world_rank,
      0 AS continent_rank,
      0 AS country_rank,
      SUM(ranking.world_rank > 0) OVER (
        PARTITION BY
          ranking.event_id
        ORDER BY
          ranking.world_rank,
          COALESCE(person.name, ranking.person_id),
          ranking.person_id ROWS BETWEEN UNBOUNDED PRECEDING
          AND CURRENT ROW
      ) AS world_sub_rank,
      0 AS continent_sub_rank,
      0 AS country_sub_rank,
      ranking.world_rank = 1 AS is_world_record,
      ranking.continent_rank = 1 AS is_continent_record,
      ranking.country_rank = 1 AS is_country_record
    FROM
      ranks_average ranking
      LEFT JOIN persons person ON person.wca_id = ranking.person_id
      AND person.sub_id = 1
      LEFT JOIN countries country ON country.id = person.country_id
      LEFT JOIN wca_best_average best ON best.person_id = ranking.person_id
      AND best.event_id = ranking.event_id
      LEFT JOIN competitions comp ON comp.id = best.competition_id
  )
SELECT
  event_id,
  person_id,
  person_name,
  gender,
  country_id,
  country_name,
  country_iso2,
  continent_id,
  best,
  competition_id,
  competition_name,
  is_world_record,
  is_continent_record,
  is_country_record,
  world_rank,
  continent_rank,
  country_rank,
  world_sub_rank,
  continent_sub_rank,
  country_sub_rank
FROM
  world_rows
UNION ALL
SELECT
  event_id,
  person_id,
  person_name,
  gender,
  country_id,
  country_name,
  country_iso2,
  continent_id,
  best,
  competition_id,
  competition_name,
  is_world_record,
  is_continent_record,
  is_country_record,
  world_rank,
  continent_rank,
  country_rank,
  world_sub_rank,
  continent_sub_rank,
  country_sub_rank
FROM
  country_rows
UNION ALL
SELECT
  event_id,
  person_id,
  person_name,
  gender,
  country_id,
  country_name,
  country_iso2,
  continent_id,
  best,
  competition_id,
  competition_name,
  is_world_record,
  is_continent_record,
  is_country_record,
  world_rank,
  continent_rank,
  country_rank,
  world_sub_rank,
  continent_sub_rank,
  country_sub_rank
FROM
  continent_rows;
