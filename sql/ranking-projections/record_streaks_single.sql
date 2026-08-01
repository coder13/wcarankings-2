CREATE TABLE record_streaks_single AS
WITH result_weeks AS (
  SELECT
    r.id AS result_id,
    r.person_id,
    r.event_id,
    r.best AS result_value,
    DATE_SUB(
      STR_TO_DATE(CONCAT(comp.year, '-', LPAD(comp.month, 2, '0'), '-', LPAD(comp.day, 2, '0')), '%Y-%m-%d'),
      INTERVAL MOD(DAYOFWEEK(STR_TO_DATE(CONCAT(comp.year, '-', LPAD(comp.month, 2, '0'), '-', LPAD(comp.day, 2, '0')), '%Y-%m-%d')) + 2, 7) DAY
    ) AS week_start,
    COALESCE(person.country_id, '') AS country_id,
    COALESCE(country.continent_id, '') AS continent_id
  FROM results r
  INNER JOIN competitions comp ON comp.id = r.competition_id
  LEFT JOIN persons person ON person.wca_id = r.person_id AND person.sub_id = 1
  LEFT JOIN countries country ON country.id = person.country_id
  WHERE r.best > 0
), scoped_results AS (
  SELECT event_id, person_id, result_value, week_start, 'world' AS scope, '' AS region_id FROM result_weeks
  UNION ALL
  SELECT event_id, person_id, result_value, week_start, 'continent' AS scope, continent_id FROM result_weeks
  WHERE continent_id <> ''
  UNION ALL
  SELECT event_id, person_id, result_value, week_start, 'country' AS scope, country_id FROM result_weeks
  WHERE country_id <> ''
), current_values AS (
  SELECT scope, event_id, region_id, MIN(result_value) AS result_value
  FROM scoped_results
  GROUP BY scope, event_id, region_id
), first_weeks AS (
  SELECT current_values.scope, current_values.event_id, current_values.region_id,
    MIN(scoped_results.week_start) AS first_week
  FROM current_values
  INNER JOIN scoped_results
    ON scoped_results.scope = current_values.scope
   AND scoped_results.event_id = current_values.event_id
   AND scoped_results.region_id = current_values.region_id
   AND scoped_results.result_value = current_values.result_value
  GROUP BY current_values.scope, current_values.event_id, current_values.region_id
), latest_week AS (
  SELECT MAX(week_start) AS week_start FROM result_weeks
), streaks AS (
  SELECT first_weeks.scope, first_weeks.event_id, first_weeks.region_id,
    FLOOR(DATEDIFF(latest_week.week_start, first_weeks.first_week) / 7) + 1 AS streak_weeks
  FROM first_weeks
  CROSS JOIN latest_week
), holders AS (
  SELECT DISTINCT scoped_results.event_id, scoped_results.person_id, streaks.scope, streaks.region_id, streaks.streak_weeks
  FROM scoped_results
  INNER JOIN current_values
    ON current_values.scope = scoped_results.scope
   AND current_values.event_id = scoped_results.event_id
   AND current_values.region_id = scoped_results.region_id
   AND current_values.result_value = scoped_results.result_value
  INNER JOIN streaks
    ON streaks.scope = scoped_results.scope
   AND streaks.event_id = scoped_results.event_id
   AND streaks.region_id = scoped_results.region_id
)
SELECT event_id, person_id,
  MAX(CASE WHEN scope = 'world' THEN streak_weeks END) AS world_record_streak_weeks,
  MAX(CASE WHEN scope = 'continent' THEN streak_weeks END) AS continent_record_streak_weeks,
  MAX(CASE WHEN scope = 'country' THEN streak_weeks END) AS country_record_streak_weeks
FROM holders
GROUP BY event_id, person_id;
