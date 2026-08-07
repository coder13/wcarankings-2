/**
 * Rebuild one event only. The official yearly grain remains untouched; this is
 * a separate overlay until the official export contains the live results.
 */
export const provisionalCurrentYearRankingSql = `
INSERT INTO provisional_current_year_rankings
  (year, event_id, result_type, scope, region_id, person_id, result_source, result_key, result_value, public_rank, position)
WITH candidates AS (
  SELECT period_year AS year, event_id, result_type, person_id, country_id, continent_id,
    'official' AS result_source, CAST(result_id AS CHAR) AS result_key, result_value,
    competition_start_date, competition_id
  FROM person_event_bests
  WHERE period_year = ? AND event_id = ? AND result_value > 0
  UNION ALL
  SELECT source.competition_year, live.event_id, result_type.result_type, live.person_id,
    COALESCE(country.id, person.country_id, '') AS country_id,
    COALESCE(country.continent_id, fallback_country.continent_id, '') AS continent_id,
    'live', CONCAT(live.source_name, ':', live.competition_id, ':', live.source_result_id),
    CASE result_type.result_type WHEN 'single' THEN live.best ELSE live.average END,
    MAKEDATE(source.competition_year, 1), live.competition_id
  FROM provisional_live_results live
  JOIN provisional_live_result_sources source
    ON source.source_name = live.source_name AND source.competition_id = live.competition_id
  JOIN (SELECT 'single' AS result_type UNION ALL SELECT 'average') result_type
  LEFT JOIN countries country ON country.iso2 = live.country_iso2
  LEFT JOIN persons person ON person.wca_id = live.person_id AND person.sub_id = 1
  LEFT JOIN countries fallback_country ON fallback_country.id = person.country_id
  WHERE source.enabled = 1 AND source.competition_year = ? AND live.event_id = ?
    AND CASE result_type.result_type WHEN 'single' THEN live.best ELSE live.average END > 0
), country_bests AS (
  SELECT * FROM (
    SELECT candidates.*, ROW_NUMBER() OVER (
      PARTITION BY year, event_id, result_type, person_id, country_id
      ORDER BY result_value, competition_start_date, competition_id, result_key
    ) AS candidate_position
    FROM candidates
  ) ranked WHERE candidate_position = 1
), cohorts AS (
  SELECT year, event_id, result_type, person_id, result_source, result_key, result_value, 'country' AS scope, country_id AS region_id
  FROM country_bests WHERE country_id <> ''
  UNION ALL
  SELECT year, event_id, result_type, person_id, result_source, result_key, result_value, 'continent', continent_id
  FROM (
    SELECT country_bests.*, ROW_NUMBER() OVER (
      PARTITION BY year, event_id, result_type, person_id, continent_id
      ORDER BY result_value, competition_start_date, competition_id, result_key
    ) AS candidate_position
    FROM country_bests WHERE continent_id <> ''
  ) ranked WHERE candidate_position = 1
  UNION ALL
  SELECT year, event_id, result_type, person_id, result_source, result_key, result_value, 'world', ''
  FROM (
    SELECT country_bests.*, ROW_NUMBER() OVER (
      PARTITION BY year, event_id, result_type, person_id
      ORDER BY result_value, competition_start_date, competition_id, result_key
    ) AS candidate_position
    FROM country_bests
  ) ranked WHERE candidate_position = 1
)
SELECT year, event_id, result_type, scope, region_id, person_id, result_source, result_key, result_value,
  RANK() OVER (PARTITION BY year, event_id, result_type, scope, region_id ORDER BY result_value) AS public_rank,
  ROW_NUMBER() OVER (PARTITION BY year, event_id, result_type, scope, region_id ORDER BY result_value, person_id) AS position
FROM cohorts`;
